"""network — who the explorer's node sees on the wire, for the network tab, python stdlib only.

every --network-every seconds (indexer.py's loop) it reads the node's /peers and /status (cybernode
rs/src/node/chain_routes.rs) and keeps one sighting per radio endpoint: first and last seen, best height and tip,
direction, penalty score, and where its address is (country, city, coordinates rounded to GRID degrees) by DB-IP Lite;
an address that is not global (private, NAT, CGNAT, loopback) is "behind NAT" and gets no place. the address itself
is never written anywhere: it is looked up and dropped.

it also reads the chain's address book (cybernode specs/chain-wire.md §6, rs/src/chain/net/discovery.rs): kind-2
cyberlinks from a neuron with p = hemera("antenna"), q = its endpoint id, and p = hemera("socket"), q = '4' ‖ ipv4[4]
‖ port BE[2] ‖ zeros; newest wins, an antenna clears the sockets before it. those nodes are "announced" with their
neuron. the cyberlinks come from the index's blocks (indexer.py keeps every cyberlink, staked or not).

and it writes explorer/data/network.json (published) and --data/network-state.json (the sightings, no addresses).

geolocation: DB-IP IP to City Lite (CC BY 4.0, https://db-ip.com/db/lite.php), the monthly
dbip-city-lite-YYYY-MM.csv.gz under --geo. the indexer fetches the month's file when it is missing (at most once per
GEO_RETRY), parses it into a sorted range table in memory at start and on a new month (adjacent ranges with the same
place merged; ~15 s, ~300 MB) and answers by bisection. without a file every address is "unplaced".
"""
import bisect
import gzip
import csv
import ipaddress
import json
import os
import socket
import statistics
import threading
import time
import tomllib
import urllib.request
from array import array

# hemera 0.4 of the ASCII words (discovery.rs `wkp`); checked with cyber-hemera 0.4: hemera("pussy") = 87a70ff9…6a71,
# the native token the pussy-rc node reports in /balance
ANTENNA = 'c7fe5929e8468ae49de4abcf8fa2b8362f5f5bb975bf420b97d127a9325fc6d4'
SOCKET = '25c829efc43610e97cf123fed0b52fad2787eb5d2072b6abc0413fb869b08fa7'

DAY = 86400
ONLINE = 120                # s: a node in the last /peers read (or the explorer's node answering) is online
KEEP = 30 * DAY             # sightings older than this are forgotten
GRID = 0.5                  # degrees: published coordinates are rounded to this
GEO_RETRY = 6 * 3600        # s between attempts to fetch a missing month
GEO_URL = 'https://download.db-ip.com/free/dbip-city-lite-{month}.csv.gz'
VERSION = 1


def log(*a):
    print(time.strftime('%H:%M:%S'), '[network]', *a, flush=True)


def unpack_socket(q):
    """the packed socket of discovery.rs, or None: '4' ‖ ipv4[4] ‖ port BE[2] ‖ zeros."""
    try:
        b = bytes.fromhex(q)
    except ValueError:
        return None
    if len(b) != 32 or b[0] != ord('4') or any(b[7:]):
        return None
    return '.'.join(str(x) for x in b[1:5]), int.from_bytes(b[5:7], 'big')


def host_of(addr):
    """'1.2.3.4:7793' or '[2a01::1]:7793' → the ip string."""
    a = addr.strip()
    if a.startswith('['):
        return a[1:a.index(']')]
    return a.rsplit(':', 1)[0] if a.count(':') == 1 else a


class V6Keys:
    """a bytes buffer of 16-byte big-endian keys as a sequence bisect can search."""

    def __init__(self, buf):
        self.buf = buf

    def __len__(self):
        return len(self.buf) // 16

    def __getitem__(self, i):
        return self.buf[i * 16:(i + 1) * 16]


class Geo:
    def __init__(self, folder):
        self.dir = folder
        self.month = None
        self.t = None               # the loaded table
        self.busy = None
        self.tried = 0.0
        os.makedirs(folder, exist_ok=True)

    # ---------------------------------------------------------------- the file
    def newest(self):
        names = sorted(n for n in os.listdir(self.dir) if n.startswith('dbip-city-lite-') and n.endswith('.csv.gz'))
        return names[-1] if names else None

    def fetch(self):
        """download this month's file if it is not here (DB-IP publishes on the 1st; last month's stays until then)."""
        month = time.strftime('%Y-%m', time.gmtime())
        name = f'dbip-city-lite-{month}.csv.gz'
        path = os.path.join(self.dir, name)
        if os.path.exists(path) or time.time() - self.tried < GEO_RETRY:
            return
        self.tried = time.time()
        part = path + '.part'
        try:
            req = urllib.request.Request(GEO_URL.format(month=month), headers={'User-Agent': 'spacepussy-explorer-index'})
            with urllib.request.urlopen(req, timeout=120) as r, open(part, 'wb') as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            with gzip.open(part, 'rt') as g:           # a whole gzip with a CSV head, or it is not the file
                if not g.readline().count(',') >= 7:
                    raise ValueError('not the city CSV')
            os.replace(part, path)
            log(f'geo: fetched {name}')
            keep = self._keep()                        # the newest two months
            for old in os.listdir(self.dir):
                if old.startswith('dbip-city-lite-') and old not in keep:
                    os.remove(os.path.join(self.dir, old))
        except Exception as e:
            log(f'geo: fetching {name} failed: {type(e).__name__}: {e}; next try in {GEO_RETRY // 3600} h')
            if os.path.exists(part):
                os.remove(part)

    def _keep(self):
        names = sorted(n for n in os.listdir(self.dir) if n.startswith('dbip-city-lite-') and n.endswith('.csv.gz'))[-2:]
        return set(names)

    # ---------------------------------------------------------------- the table
    def build(self, name):
        src = os.path.join(self.dir, name)
        t0 = time.time()
        locs, loc_ix = [], {}
        v4s, v4e, v4l = array('I'), array('I'), array('I')
        v6s, v6e, v6l = bytearray(), bytearray(), array('I')
        with gzip.open(src, 'rt', newline='', encoding='utf-8') as f:
            for row in csv.reader(f):
                if len(row) < 8:
                    continue
                start, end, _cont, cc, region, city, lat, lon = row[:8]
                if cc == 'ZZ' or not cc:
                    continue
                key = (cc, city, region, round(float(lat) / GRID) * GRID, round(float(lon) / GRID) * GRID)
                li = loc_ix.get(key)
                if li is None:
                    li = loc_ix[key] = len(locs)
                    locs.append(key)
                if ':' in start:
                    s, e = socket.inet_pton(socket.AF_INET6, start), socket.inet_pton(socket.AF_INET6, end)
                    if v6l and v6l[-1] == li and int.from_bytes(v6e[-16:], 'big') + 1 == int.from_bytes(s, 'big'):
                        v6e[-16:] = e
                        continue
                    v6s += s
                    v6e += e
                    v6l.append(li)
                else:
                    s, e = int.from_bytes(socket.inet_aton(start), 'big'), int.from_bytes(socket.inet_aton(end), 'big')
                    if v4l and v4l[-1] == li and v4e[-1] + 1 == s:
                        v4e[-1] = e
                        continue
                    v4s.append(s)
                    v4e.append(e)
                    v4l.append(li)
        v6s, v6e = bytes(v6s), bytes(v6e)
        t = {'name': name, 'locs': locs, 'v4s': v4s, 'v4e': v4e, 'v4l': v4l, 'v6k': V6Keys(v6s), 'v6ek': V6Keys(v6e), 'v6l': v6l}
        log(f'geo: {name}: {len(v4s)} v4 + {len(v6l)} v6 ranges, {len(locs)} places, in {time.time() - t0:.0f} s')
        return t

    def refresh(self):
        """in a thread: fetch the month if missing, load the newest table if it is not the one in use."""
        if self.busy and self.busy.is_alive():
            return

        def work():
            try:
                self.fetch()
                name = self.newest()
                if name and (not self.t or self.t['name'] != name):
                    t = self.build(name)
                    self.t, self.month = t, name[len('dbip-city-lite-'):-len('.csv.gz')]
                    log(f'geo: using {name}')
            except Exception as e:
                log(f'geo: {type(e).__name__}: {e}')
        self.busy = threading.Thread(target=work, name='geo', daemon=True)
        self.busy.start()

    # ---------------------------------------------------------------- lookups
    def place(self, ip):
        """{'nat': True} for an address that is not global, a place dict, or None when unknown or no table yet."""
        try:
            a = ipaddress.ip_address(ip)
        except ValueError:
            return None
        if a.version == 6 and a.ipv4_mapped:
            a = a.ipv4_mapped
        if not a.is_global:
            return {'nat': True}
        t = self.t
        if not t:
            return None
        if a.version == 4:
            k = int(a)
            i = bisect.bisect_right(t['v4s'], k) - 1
            if i < 0 or k > t['v4e'][i]:
                return None
            li = t['v4l'][i]
        else:
            k = a.packed
            i = bisect.bisect_right(t['v6k'], k) - 1
            if i < 0 or k > t['v6ek'][i]:
                return None
            li = t['v6l'][i]
        cc, city, region, lat, lon = t['locs'][li]
        return {'cc': cc, 'city': city, 'region': region, 'lat': lat, 'lon': lon}


def place_of(geo, addrs):
    """the place of the first global address; behind NAT when none is global; None when nothing is known."""
    nat = None
    for ad in addrs or ():
        p = geo.place(host_of(ad))
        if p and not p.get('nat'):
            return p
        if p:
            nat = p
    return nat


class Network:
    def __init__(self, node, data, site, geo_dir, nodes_file):
        self.node, self.site = node, site
        self.state_path = os.path.join(data, 'network-state.json')
        self.geo = Geo(geo_dir)
        self.known = {}
        if nodes_file and os.path.exists(nodes_file):
            with open(nodes_file, 'rb') as f:
                for n in tomllib.load(f).get('node') or ():
                    self.known[n['endpoint']] = n
        self.seen = {}              # endpoint -> sighting
        if os.path.exists(self.state_path):
            try:
                self.seen = json.load(open(self.state_path)).get('seen') or {}
            except ValueError:
                self.seen = {}
        self.self_id = None
        self.geo.refresh()

    def book(self, links):
        """the address book from the chain's cyberlinks: neuron -> {endpoint, sockets, at}; newest wins."""
        out = {}
        for h, l in links:
            p = l.get('p')
            if p == ANTENNA:
                out[l['from']] = {'endpoint': l['q'], 'sockets': [], 'at': h, 'txid': l.get('txid')}
            elif p == SOCKET:
                s = unpack_socket(l['q'])
                e = out.get(l['from'])
                if s and e is not None:
                    e['sockets'] = [x for x in e['sockets'] if x != s][-7:] + [s]
                    e['at'] = h
                elif s:
                    out.setdefault(l['from'], {'endpoint': None, 'sockets': [s], 'at': h, 'txid': None})
        return out

    def tick(self, ix):
        now = int(time.time())
        self.geo.refresh()
        st = dict(l.split(': ', 1) for l in self.node.get('/status', text=True).splitlines() if ': ' in l)
        pr = self.node.get('/peers')
        self.self_id = pr.get('endpoint') or st.get('endpoint')
        k = self.known.get(self.self_id) or {}
        me = self.seen.setdefault(self.self_id, {'first': now})
        me.update(last=now, height=int(st.get('height') or 0), tip=st.get('tip'), dir='self', score=0, via=[self.self_id])
        if k.get('ip'):
            pl = self.geo.place(k['ip'])
            if pl:
                me['place'] = pl
        for p in pr.get('peers') or ():
            s = self.seen.setdefault(p['endpoint'], {'first': now})
            via = set(s.get('via') or ()) | {self.self_id}
            s.update(last=now, height=int(p.get('best_height') or 0), tip=p.get('best_tip'), dir=p.get('direction'),
                     score=int(p.get('score') or 0), via=sorted(via))
            pl = place_of(self.geo, p.get('addrs'))
            if pl:
                s['place'] = pl
        for e in [e for e, s in self.seen.items() if now - s.get('last', 0) > KEEP]:
            del self.seen[e]
        tmp = f'{self.state_path}.{os.getpid()}.tmp'
        with open(tmp, 'w') as f:
            json.dump({'version': VERSION, 'seen': self.seen}, f, separators=(',', ':'))
        os.replace(tmp, self.state_path)
        self.publish(ix, st, now)

    def publish(self, ix, st, now):
        book = self.book(getattr(ix, 'links', None) or ())
        by_ep = {b['endpoint']: (n, b) for n, b in book.items() if b['endpoint']}
        tip = int(st.get('height') or 0)
        nodes = []
        eps = [e for e, s in self.seen.items() if now - s.get('last', 0) <= DAY] + [e for e in by_ep if e not in self.seen or now - self.seen[e].get('last', 0) > DAY]
        for e in eps:
            s = self.seen.get(e) if e in self.seen and now - self.seen[e].get('last', 0) <= DAY else None
            k = self.known.get(e) or {}
            nb = by_ep.get(e)
            pl = (s or {}).get('place')
            if not pl and nb:                          # announced only: place it by the socket it announced
                pl = place_of(self.geo, [a for a, _ in nb[1]['sockets']])
            rec = {'endpoint': e, 'name': k.get('name'), 'role': k.get('role'),
                   'neuron': nb[0] if nb else k.get('neuron'), 'neuron_from': 'announced' if nb else ('config' if k.get('neuron') else None),
                   'miner': k.get('miner'), 'seen': bool(s), 'online': bool(s) and now - s['last'] <= ONLINE,
                   'first_seen': (s or {}).get('first'), 'last_seen': (s or {}).get('last'),
                   'height': (s or {}).get('height'), 'lag': tip - s['height'] if s and s.get('height') is not None else None,
                   'tip': (s or {}).get('tip'), 'direction': (s or {}).get('dir'), 'score': (s or {}).get('score'),
                   'announced': bool(nb), 'announced_at': nb[1]['at'] if nb else None, 'sockets': len(nb[1]['sockets']) if nb else 0,
                   'nat': bool(pl and pl.get('nat')), 'cc': None, 'city': None, 'lat': None, 'lon': None}
            if pl and not pl.get('nat'):
                rec.update(cc=pl['cc'], city=pl['city'] or pl.get('region') or None, lat=pl['lat'], lon=pl['lon'])
            nodes.append(rec)
        nodes.sort(key=lambda r: (r['direction'] != 'self', not r['online'], not r['seen'], r['name'] is None, -(r['last_seen'] or 0), r['endpoint']))
        seen = [r for r in nodes if r['seen']]
        countries = {}
        for r in seen:
            if r['cc']:
                c = countries.setdefault(r['cc'], {'cc': r['cc'], 'n': 0, 'online': 0})
                c['n'] += 1
                c['online'] += r['online']
        peers = [r for r in seen if r['direction'] in ('inbound', 'outbound') and r['online']]
        out = {'version': VERSION, 'chain': st.get('chain'), 'generated': now, 'tip': tip, 'tip_id': st.get('tip'),
               'self': self.self_id, 'window': DAY, 'online_secs': ONLINE, 'grid_deg': GRID,
               'counts': {'seen_24h': len(seen), 'online': sum(r['online'] for r in seen), 'announced': sum(r['announced'] for r in nodes),
                          'countries': len(countries), 'nat': sum(r['nat'] for r in seen), 'placed': sum(r['lat'] is not None for r in seen),
                          'unplaced': sum(r['lat'] is None and not r['nat'] for r in seen), 'book': len([b for b in book.values() if b['endpoint']])},
               'median_score': statistics.median([r['score'] for r in peers]) if peers else None,
               'latency': None,
               'notes': {'latency': "the node's /peers reports no round-trip time, so the network tab shows none",
                         'score': 'penalty points of a connected peer (chain-wire §5): 0 is clean, 100 bans for an hour, decays 1 a minute',
                         'online': f'in the node\'s peer list within the last {ONLINE} s (the explorer\'s node: answering)'},
               'countries': sorted(countries.values(), key=lambda c: (-c['n'], c['cc'])),
               'nodes': nodes,
               'geo': {'source': 'DB-IP Lite', 'url': 'https://db-ip.com', 'license': 'CC BY 4.0', 'month': self.geo.month}}
        path = os.path.join(self.site, 'network.json')
        tmp = f'{path}.{os.getpid()}.{threading.get_ident()}.tmp'
        with open(tmp, 'w') as f:
            json.dump(out, f, separators=(',', ':'))
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
