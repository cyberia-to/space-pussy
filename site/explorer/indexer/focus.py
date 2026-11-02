"""focus — the axon and neuron index of the explorer, recomputed once per settled epoch (φ* changes only then).

inputs
  the genesis export (`soft3 genesis build --chain pussy-rc --snapshot … --export DIR`): links.tsv (neuron, p, q, …,
  address), balances.tsv (owner, token, amount, address, denom), accounts.tsv (address, owner), particles.tsv
  (particle, cid). not consensus, but byte-for-byte the frames of the genesis file the node runs.
  the staking txs and the plain cyberlinks the indexer reads from the blocks.
  φ* of the last settled epoch from the node: /focus?top=1000 (the node caps the list at 1,000) and /focus/<particle>
  for every particle of the graph, throttled, because the node keeps only the last settled φ*.

the weight of an axon is cybernode specs/chain-economy.md §4.1–4.2 exactly:
  B(n) = native balance of n in the genesis file, L(n) = l frames authored by n
  g(f) = max(1, floor(B(author(f)) / L(author(f)))) per frame, G_pq = Σ g(f) over the frames on (p, q)
  S⁺_pq = Σ stake of cards on (p, q) with valence 0 or +1, S⁻_pq = with valence −1, both at the boundary of the epoch
  A_pq = max(0, G_pq + S⁺_pq − S⁻_pq); an axon with A = 0 is absent
focus flow of an axon (the share of p's focus that diffusion sends along it):
  flow(p → q) = φ*(p) · A_pq / Σ_q' A_pq'
focus authored by a neuron = Σ over the axons it touches of flow · c_n / A_pq, c_n = its genesis weight on the axon
  + its stake for − its stake against (so the shares of one axon sum to 1; stake against counts negative).

outputs (site data): axons.json, neurons.json, particles.json, phi/<xx>.json (per-particle series of the last epochs),
moved.json (per recorded epoch: the particles whose φ* moved most, the cyberlinks and stake changes of the epoch that touch them, and
the positions paid at its settlement) and graph.json (the top particles by φ*, the endpoints of every staked axon, the axons among them).
record (data dir): focus/<epoch>.json — the node's top list and the full φ* vector, aligned with focus/particles-<sha>.json.
"""
import csv
import hashlib
import json
import os
import threading
import time

SCALE_BITS = 60
SERIES = 24            # epochs kept in the site's per-particle series shards (and in moved.json)
MOVED_TOP = 12         # risers and fallers per epoch in moved.json
GRAPH_NODES = 400      # graph.json: the top particles by φ*, plus the endpoints of staked axons
GRAPH_EDGES = 2400     # at most this many axons drawn (a phone stays smooth)
TOP_AXONS = 1000
TOP_NEURONS = 1000
CHART_TOP = 200


def _rows(path):
    with open(path, newline='') as f:
        yield from csv.DictReader(f, delimiter='\t')


class Genesis:
    """the genesis frames, their weights (§4.1) and the side tables of the export."""

    def __init__(self, folder, native):
        self.folder = folder
        bal = {}
        for r in _rows(os.path.join(folder, 'balances.tsv')):
            if r['token'] == native:
                bal[r['owner']] = bal.get(r['owner'], 0) + int(r['amount'])
        self.balance = bal
        self.address = {}
        for r in _rows(os.path.join(folder, 'accounts.tsv')):
            self.address.setdefault(r['owner'], r['address'])
        frames, per_pair = {}, {}
        for r in _rows(os.path.join(folder, 'links.tsv')):
            n, k = r['neuron'], (r['p'], r['q'])
            frames[n] = frames.get(n, 0) + 1
            d = per_pair.setdefault(k, {})
            d[n] = d.get(n, 0) + 1
            if r.get('address') and r['address'] != '-':
                self.address.setdefault(n, r['address'])
        self.frames = frames                                            # L(n)
        self.g = {n: max(1, bal.get(n, 0) // c) for n, c in frames.items()}
        self.at_floor = sum(c for n, c in frames.items() if bal.get(n, 0) // c == 0)
        self.authors = per_pair                                         # (p, q) -> {author: frames}
        self.G = {k: sum(self.g[n] * c for n, c in d.items()) for k, d in per_pair.items()}
        self.total = sum(self.G.values())
        self.cid = {r['particle']: r['cid'] for r in _rows(os.path.join(folder, 'particles.tsv'))}


class FocusIndex:
    """per settled epoch: fetch φ*, build the axon and neuron tables, write them; the fetch runs in a thread."""

    def __init__(self, ix, genesis_dir, rate):
        self.ix, self.dir, self.rate = ix, genesis_dir, rate
        self.rec = os.path.join(ix.data, 'focus')
        os.makedirs(self.rec, exist_ok=True)
        self.gen = None
        self.done = 0               # the epoch whose tables are written
        self.busy = None            # the thread working on an epoch
        self.lock = threading.Lock()

    def log(self, *a):
        print(time.strftime('%H:%M:%S'), 'focus:', *a, flush=True)

    # ------------------------------------------------------------------ the record
    def record_path(self, e):
        return os.path.join(self.rec, f'{e}.json')

    def load_record(self, e):
        """{particle: φ*} of epoch e from the record, the record's head, or (None, None)."""
        try:
            r = json.load(open(self.record_path(e)))
        except (OSError, ValueError):
            return None, None
        phi = {t['particle']: int(t['phi']) for t in r.get('top') or ()}
        if r.get('particles_file'):
            try:
                ps = json.load(open(os.path.join(self.rec, r['particles_file'])))
                for p, v in zip(ps, r['phi']):
                    if v is not None:
                        phi[p] = int(v)
            except (OSError, ValueError):
                r['complete'] = False
        return phi, r

    def save_record(self, e, top, ps, vals):
        blob = json.dumps(ps, separators=(',', ':')).encode()
        name = f'particles-{len(ps)}-{hashlib.sha256(blob).hexdigest()[:12]}.json'
        path = os.path.join(self.rec, name)
        if not os.path.exists(path):
            with open(path + '.tmp', 'wb') as f:
                f.write(blob)
            os.replace(path + '.tmp', path)
        known = [v for v in vals if v is not None]
        rec = {'epoch': e, 'scale_bits': top.get('scale_bits', SCALE_BITS), 'syntropy': str(top.get('syntropy')), 'digest': top.get('digest'),
               'captured': int(time.time()), 'complete': len(known) == len(vals), 'particles_n': len(ps), 'total': str(sum(known)),
               'top': top.get('top') or [], 'particles_file': name, 'phi': vals,
               'note': 'top = the node\'s /focus?top=1000 answer; phi[i] = /focus/<particles[i]> (raw, scale 2^60), null = no focus'}
        tmp = self.record_path(e) + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(rec, f, separators=(',', ':'))
        os.replace(tmp, self.record_path(e))

    # ------------------------------------------------------------------ the graph at a boundary
    def sides_at(self, boundary):
        """per card key the stake and valence after the block at `boundary`, replayed from the staking txs (§2.4)."""
        cards = {}
        for h, s in list(self.ix.stx):
            if h > boundary:
                break
            key = (s['from'], s['p'], s['q'])
            c = cards.get(key)
            if s['kind'] == 'cyberlink':
                if c is None or c[0] == 0:
                    c = [0, 0]
                c[0] += s['amount']
                c[1] = s['valence']
                cards[key] = c
            elif s['kind'] == 'unlock' and c:
                c[0] = max(0, c[0] - s['amount'])
        return cards

    def particles_of_graph(self, gen, cards):
        ps = set()
        for p, q in gen.G:
            ps.add(p)
            ps.add(q)
        for (_, p, q), (s, _) in cards.items():
            if s:
                ps.add(p)
                ps.add(q)
        return sorted(ps)

    # ------------------------------------------------------------------ the fetch
    def fetch_phi(self, e, ps):
        """the node's top list and φ* of every particle in ps at epoch e; None when the node moved to another epoch."""
        node = self.ix.node
        top = node.get('/focus?top=1000')
        if int(top['epoch']) != e:
            return None
        vals, gap = [], 1.0 / self.rate if self.rate > 0 else 0
        for i, p in enumerate(ps):
            f = node.get(f'/focus/{p}', missing_ok=True)
            if f is None:
                vals.append(None)
            elif int(f['epoch']) != e:
                return None
            else:
                vals.append(int(f['phi']))
            if gap:
                time.sleep(gap)
            if i and i % 4000 == 0:
                self.log(f'epoch {e}: {i}/{len(ps)} particles read')
        return top, vals

    # ------------------------------------------------------------------ entry: called by the indexer's loop
    def tick(self, eco):
        """start the work for the last settled epoch if it is not done and nothing runs."""
        e = int(eco.get('last_settled') or 0)
        if e <= 0 or e == self.done or (self.busy and self.busy.is_alive()):
            return
        self.busy = threading.Thread(target=self.work, args=(e, eco), daemon=True, name=f'focus-{e}')
        self.busy.start()

    def work(self, e, eco):
        try:
            t0 = time.time()
            if self.gen is None:
                self.gen = Genesis(self.dir, self.ix.native_token())
                self.log(f'genesis: {len(self.gen.G)} axons, Σ G {self.gen.total}, {len(self.gen.frames)} authors, {self.gen.at_floor} frames at the floor')
            L = int(eco.get('epoch_length') or 240)
            boundary = e * L
            cards = self.sides_at(boundary)
            ps = self.particles_of_graph(self.gen, cards)
            phi, head = self.load_record(e)
            if not head or not head.get('complete') or head.get('particles_n') != len(ps):
                got = self.fetch_phi(e, ps)
                if got is None:
                    self.log(f'epoch {e}: the node moved on during the read; next round')
                    return
                top, vals = got
                self.save_record(e, top, ps, vals)
                phi, head = self.load_record(e)
                self.log(f'epoch {e}: φ* of {len(ps)} particles recorded in {time.time() - t0:.0f} s')
            self.build(e, boundary, eco, phi, head, cards, L)
            self.done = e
            self.log(f'epoch {e}: tables written in {time.time() - t0:.0f} s')
        except Exception as ex:      # the indexer's main loop must not die with this thread
            self.log(f'epoch {e}: {type(ex).__name__}: {ex}')

    # ------------------------------------------------------------------ the tables
    def build(self, e, boundary, eco, phi, head, cards, L=240):
        gen, ix = self.gen, self.ix
        S = 1 << SCALE_BITS
        # sides per axon at the boundary, and the stakers' contributions
        sp, sm, stakers = {}, {}, {}
        for (n, p, q), (s, v) in cards.items():
            if not s:
                continue
            k = (p, q)
            if v == -1:
                sm[k] = sm.get(k, 0) + s
            else:
                sp[k] = sp.get(k, 0) + s
            stakers.setdefault(k, {})
            stakers[k][n] = stakers[k].get(n, 0) + (-s if v == -1 else s)
        A = {}
        for k in set(gen.G) | set(sp) | set(sm):
            a = gen.G.get(k, 0) + sp.get(k, 0) - sm.get(k, 0)
            if a > 0:
                A[k] = a
        out = {}
        for (p, q), a in A.items():
            out[p] = out.get(p, 0) + a
        # every cyberlinked pair the chain knows: genesis frames and every cyberlink in a block (any amount)
        linked = set(gen.G)
        chain_links = {}                            # neuron -> cyberlinks signed on chain
        chain_authors = {}                          # (p, q) -> {neuron}
        for h, l in list(ix.links):
            linked.add((l['p'], l['q']))
            chain_links[l['from']] = chain_links.get(l['from'], 0) + 1
            chain_authors.setdefault((l['p'], l['q']), set()).add(l['from'])
        # flows
        flows = []
        total_flow = 0
        for (p, q), a in A.items():
            f = phi.get(p)
            fl = f * a // out[p] if f else 0
            total_flow += fl
            flows.append((fl, p, q, a))
        flows.sort(key=lambda x: (-x[0], x[1], x[2]))
        phi_out = sum(phi.get(p, 0) for p in out)
        phi_total = sum(phi.values())
        missing_out = sum(1 for p in out if p not in phi)
        # current stake per axon and per particle (now), from the positions the indexer replays
        now_cards, _ = ix.replay()
        now_p, now_m = {}, {}
        for c in now_cards.values():
            if c['stake'] <= 0:
                continue
            k = (c['p'], c['q'])
            (now_m if c['valence'] == -1 else now_p)[k] = (now_m if c['valence'] == -1 else now_p).get(k, 0) + c['stake']
        # neurons: focus authored, pro rata to each one's share of the axon's weight
        authored = {}
        for fl, p, q, a in flows:
            if not fl:
                continue
            k = (p, q)
            for n, c in (gen.authors.get(k) or {}).items():
                authored[n] = authored.get(n, 0) + fl * gen.g[n] * c / a
            for n, s in (stakers.get(k) or {}).items():
                authored[n] = authored.get(n, 0) + fl * s / a
        earned = {}
        for ep in list(dict(ix.epochs).values()):
            for pay in ep.get('payouts') or ():
                earned[pay['owner']] = earned.get(pay['owner'], 0) + int(pay['amount'])
        stake_now = {}
        for c in now_cards.values():
            if c['stake'] > 0:
                a_ = stake_now.setdefault(c['neuron'], [0, 0])
                a_[0 if c['valence'] != 0 else 1] += c['stake']
        neurons = set(gen.frames) | set(chain_links) | set(stake_now) | set(earned)
        nrows = []
        for n in neurons:
            nrows.append({'n': n, 'addr': gen.address.get(n), 'f': authored.get(n, 0) / S, 'links': gen.frames.get(n, 0) + chain_links.get(n, 0),
                          'gl': gen.frames.get(n, 0), 'gb': str(gen.balance.get(n, 0)), 'g': gen.g.get(n, 0),
                          'sa': str(stake_now.get(n, [0, 0])[0]), 'sp': str(stake_now.get(n, [0, 0])[1]), 'earned': str(earned.get(n, 0))})
        nrows.sort(key=lambda r: (-r['f'], -int(r['gb']), r['n']))
        for i, r in enumerate(nrows):
            r['rank'] = i + 1
            r['f'] = float(f"{r['f']:.6g}")
        # particles: the table index for the axon rows
        pix, plist = {}, []

        def P(x):
            if x not in pix:
                pix[x] = len(plist)
                plist.append([x, str(phi.get(x, 0)), gen.cid.get(x)])
            return pix[x]
        arows = []
        for fl, p, q, a in flows[:TOP_AXONS]:
            k = (p, q)
            auth = set(gen.authors.get(k) or ()) | set(stakers.get(k) or ()) | chain_authors.get(k, set())
            arows.append([P(p), P(q), str(fl), str(a), str(gen.G.get(k, 0)), str(sp.get(k, 0)), str(sm.get(k, 0)),
                          str(now_p.get(k, 0)), str(now_m.get(k, 0)), len(auth), str(out[p])])
        stats = ix.node.get('/stats', missing_ok=True, text=True) or ''
        node_axons = None
        for line in stats.splitlines():
            if line.startswith('axons:'):
                node_axons = int(line.split(':', 1)[1])
        epoch_axons = (dict(ix.epochs).get(e) or {}).get('axons')
        timing = [t for t in (eco.get('timings') or []) if int(t.get('epoch', -1)) == e]
        now = int(time.time())
        common = {'version': 1, 'chain': ix.chain, 'generated': now, 'epoch': e, 'boundary': boundary, 'scale_bits': SCALE_BITS}
        sanity = {
            'flow_total': str(total_flow), 'phi_with_out': str(phi_out), 'phi_total': str(phi_total),
            'particles_with_out': len(out), 'particles_with_out_missing_phi': missing_out, 'particles_with_phi': len(phi),
            'record_complete': bool(head.get('complete')), 'node_particles': (timing[0]['particles'] if timing else None),
            'axons_present': len(A), 'axons_linked': len(linked), 'axons_genesis': len(gen.G), 'axons_staked': len(set(sp) | set(sm)),
            'node_axons_stats': node_axons, 'node_axons_epoch': epoch_axons, 'node_axons_timing': (timing[0]['axons'] if timing else None),
            'genesis_total': str(gen.total), 'genesis_frames': sum(gen.frames.values()), 'genesis_authors': len(gen.frames), 'genesis_at_floor': gen.at_floor,
            'chain_cyberlinks': len(ix.links),
        }
        ix.write('axons.json', {**common, 'note': 'rows: [p, q, flow, A, G, S+ at boundary, S- at boundary, stake for now, stake against now, authors, Σ out A of p]; '
                                'particles: [id, φ* raw, legacy CID]; flow = φ*(p)·A/Σout(p), raw at 2^60',
                                'axons': len(A), 'sanity': sanity, 'particles': plist, 'rows': arows})
        ix.write('neurons.json', {**common, 'note': 'f = focus authored as a share of all focus; gb = native balance in the genesis file; g = its weight per frame '
                                  '(§4.1); links = genesis frames + cyberlinks signed on chain; sa/sp = active/passive stake now; earned = Σ payouts owned',
                                  'neurons': len(nrows), 'rows': nrows[:TOP_NEURONS]})
        epochs, series, complete = self.particles_file(e, phi, now_p, now_m, common, head)
        for name, fn in (('moved.json', lambda: self.moved(e, L, epochs, series, complete, common)),
                         ('graph.json', lambda: self.graph(flows, phi, now_p, now_m, common))):
            try:
                fn()
            except Exception as ex:      # a side view: its failure leaves the other tables written
                self.log(f'epoch {e}: {name}: {type(ex).__name__}: {ex}')

    def particles_file(self, e, phi, now_p, now_m, common, head=None):
        """particles.json (top 1,000 with Δφ*, and the chart set) and the per-particle series shards phi/<xx>.json."""
        gen, ix = self.gen, self.ix
        epochs = sorted(int(n[:-5]) for n in os.listdir(self.rec) if n.endswith('.json') and n[:-5].isdigit())
        epochs = [x for x in epochs if x <= e][-SERIES:]
        series, complete = {}, {}
        for x in epochs:
            if x == e:
                series[x], complete[x] = phi, bool((head or {}).get('complete'))
            else:
                v, h = self.load_record(x)
                series[x], complete[x] = v or {}, bool((h or {}).get('complete'))
        prev = series.get(epochs[-2]) if len(epochs) > 1 else None
        prev_e = epochs[-2] if len(epochs) > 1 else None
        order = sorted(phi, key=lambda p: (-phi[p], p))
        rank = {p: i + 1 for i, p in enumerate(order)}
        in_p, in_m, out_s = {}, {}, {}
        for (p, q), s in now_p.items():
            in_p[q] = in_p.get(q, 0) + s
            out_s[p] = out_s.get(p, 0) + s
        for (p, q), s in now_m.items():
            in_m[q] = in_m.get(q, 0) + s
            out_s[p] = out_s.get(p, 0) + s
        pick = set(order[:1000]) | set(in_p) | set(in_m) | set(out_s)
        rows = []
        for p in sorted(pick, key=lambda p: (rank.get(p, 1 << 30), p)):
            pv = prev.get(p) if prev is not None else None
            rows.append([p, str(phi.get(p, 0)), None if pv is None else str(pv), rank.get(p), str(in_p.get(p, 0)), str(in_m.get(p, 0)), str(out_s.get(p, 0)), gen.cid.get(p)])
        active_total = sum(now_p.values()) + sum(now_m.values())
        ix.write('particles.json', {**common, 'prev_epoch': prev_e, 'particles': len(phi), 'chart_top': CHART_TOP, 'stake_on_axons': str(active_total),
                                    'note': 'rows: [particle, φ* raw, φ* raw of the epoch before (null = not recorded), rank, stake for on in-axons now, stake against on '
                                            'in-axons now, stake on out-axons now, legacy CID]; the top 1,000 by φ* and every particle with stake around it',
                                    'rows': rows})
        shards = {}
        for p in set().union(*[set(v) for v in series.values()]):
            shards.setdefault(p[:2], {})[p] = [None if series[x].get(p) is None else str(series[x][p]) for x in epochs]
        folder = os.path.join(ix.site, 'phi')
        os.makedirs(folder, exist_ok=True)
        for i in range(256):
            k = f'{i:02x}'
            ix.write(os.path.join('phi', f'{k}.json'), {'epoch': e, 'epochs': epochs, 'scale_bits': SCALE_BITS, 'p': shards.get(k, {})})
        return epochs, series, complete

    # ------------------------------------------------------------------ who moved focus
    def moved(self, e, L, epochs, series, complete, common):
        """per recorded epoch x whose epoch before is recorded too: Δφ* per particle, the epoch's cyberlinks and stake changes that
        touch the particles that moved most, and the positions its settlement paid. φ*_x is the solve over the graph at boundary x, so
        what moved it happened in blocks (x−1)·L+1 .. x·L."""
        from earnings import payout_keys
        ix = self.ix
        cid = self.gen.cid if self.gen else {}
        keys = payout_keys(ix)
        links = list(ix.links)
        stx = list(ix.stx)
        pix, plist = {}, []

        def P(x):
            if x not in pix:
                pix[x] = len(plist)
                plist.append([x, cid.get(x)])
            return pix[x]
        out = []
        for x in sorted(epochs, reverse=True):
            if x - 1 not in series:
                continue
            cur, prev = series[x], series[x - 1]
            whole = complete.get(x) and complete.get(x - 1)
            ids = (set(cur) | set(prev)) if whole else (set(cur) & set(prev))
            d = {p: cur.get(p, 0) - prev.get(p, 0) for p in ids}
            tv = sum(abs(v) for v in d.values()) // 2
            moved_n = sum(1 for v in d.values() if v)
            up = sorted((p for p in d if d[p] > 0), key=lambda p: (-d[p], p))[:MOVED_TOP]
            down = sorted((p for p in d if d[p] < 0), key=lambda p: (d[p], p))[:MOVED_TOP]
            lo, hi = (x - 1) * L + 1, x * L
            w_links = [(h, l) for h, l in links if lo <= h <= hi]
            w_stx = [(h, s) for h, s in stx if lo <= h <= hi]
            watch = set(up) | set(down)
            txs = []
            for h, s in w_stx:
                txs.append([h, s['txid'], 'lock' if s['kind'] == 'cyberlink' else s['kind'], s['from'], P(s['p']), P(s['q']), str(s.get('amount', 0)), s.get('valence'),
                            int(s['p'] in watch or s['q'] in watch)])
            staked = {s['txid'] for _, s in w_stx}
            for h, l in w_links:
                if l['txid'] in staked:
                    continue
                txs.append([h, l['txid'], 'cyberlink', l['from'], P(l['p']), P(l['q']), '0', None, int(l['p'] in watch or l['q'] in watch)])
            txs.sort(key=lambda r: (-r[8], r[0]))
            rec = dict(ix.epochs).get(x) or {}
            paid = []
            for pay in rec.get('payouts') or ():
                n, pp, qq = keys.get(pay['card'], (None, None, None))
                paid.append([pay['card'], n, pay['owner'], P(pp) if pp else None, P(qq) if qq else None, str(pay['amount'])])
            row = lambda p: [P(p), str(prev.get(p)) if p in prev else None, str(cur.get(p)) if p in cur else None, str(d[p])]
            out.append({'epoch': x, 'prev': x - 1, 'whole': bool(whole), 'compared': len(ids), 'moved': moved_n, 'tv': str(tv),
                        'from': lo, 'to': hi, 'cyberlinks': len(w_links), 'stake_txs': len(w_stx),
                        'locked': str(sum(s['amount'] for _, s in w_stx if s['kind'] == 'cyberlink')), 'unlocked': str(sum(s['amount'] for _, s in w_stx if s['kind'] == 'unlock')),
                        'settled_at': rec.get('settled_at'), 'budget': str(rec.get('budget', 0)) if rec else None, 'paid_total': str(rec.get('paid', 0)) if rec else None,
                        'delta_syntropy': str(rec.get('delta_syntropy')) if rec else None,
                        'up': [row(p) for p in up], 'down': [row(p) for p in down], 'txs': txs[:120], 'txs_total': len(txs), 'paid': paid})
        ix.write('moved.json', {**common, 'note': 'per epoch x (newest first) with φ* recorded at x and x−1: tv = ½ Σ|Δφ*| (raw, 2^60 = all focus), the focus that '
                                'changed place; up/down: [particle, φ* at x−1, φ* at x, Δ] (raw); txs: the epoch\'s staking txs and cyberlinks [height, txid, kind, '
                                'neuron, p, q, amount, valence, touches a listed particle]; paid: the positions its settlement paid [card, author, owner, p, q, amount]. '
                                'whole = both records hold every particle; otherwise only the particles in both are compared. a cyberlink without stake has '
                                'weight 0 in φ* unless genesis frames carry its axon (chain-economy §4.2).',
                                'particles': plist, 'epochs': out})

    # ------------------------------------------------------------------ the graph view
    def graph(self, flows, phi, now_p, now_m, common):
        """the top particles by φ*, the endpoints of every axon with stake now, and the axons among them (staked first, then by flow)."""
        cid = self.gen.cid if self.gen else {}
        S = float(1 << SCALE_BITS)
        top = sorted(phi, key=lambda p: (-phi[p], p))[:GRAPH_NODES]
        nodes = list(top)
        have = set(nodes)
        staked = set(now_p) | set(now_m)
        for p, q in sorted(staked, key=lambda k: -(now_p.get(k, 0) + now_m.get(k, 0))):
            for x in (p, q):
                if x not in have and len(nodes) < GRAPH_NODES + 100:
                    have.add(x)
                    nodes.append(x)
        ix_of = {p: i for i, p in enumerate(nodes)}
        in_for, in_ag = {}, {}
        for (p, q), s in now_p.items():
            in_for[q] = in_for.get(q, 0) + s
        for (p, q), s in now_m.items():
            in_ag[q] = in_ag.get(q, 0) + s
        edges, seen = [], set()
        for k in sorted(staked, key=lambda k: -(now_p.get(k, 0) + now_m.get(k, 0))):
            if k[0] in ix_of and k[1] in ix_of:
                seen.add(k)
                edges.append([ix_of[k[0]], ix_of[k[1]], 0.0, str(now_p.get(k, 0)), str(now_m.get(k, 0))])
        flow_of = {(p, q): fl for fl, p, q, a in flows}
        for e_ in edges:
            e_[2] = float(f'{flow_of.get((nodes[e_[0]], nodes[e_[1]]), 0) / S:.4g}')
        for fl, p, q, a in flows:                           # flows is sorted by flow, descending
            if len(edges) >= GRAPH_EDGES:
                break
            if (p, q) in seen or p not in ix_of or q not in ix_of or p == q:
                continue
            seen.add((p, q))
            edges.append([ix_of[p], ix_of[q], float(f'{fl / S:.4g}'), '0', '0'])
        rows = [[p, float(f'{phi.get(p, 0) / S:.4g}'), cid.get(p), str(in_for.get(p, 0)), str(in_ag.get(p, 0))] for p in nodes]
        self.ix.write('graph.json', {**common, 'note': 'nodes: [particle, share of focus φ*, legacy CID, stake for on its in-axons now, stake against on its in-axons now]: '
                                     f'the top {GRAPH_NODES} by φ* and the endpoints of axons with stake now; edges: [i, j, focus flow along it (share of all focus), '
                                     f'stake for now, stake against now], every staked axon among the nodes first, then the present axons by flow, at most {GRAPH_EDGES}.',
                                     'particles': len(phi), 'nodes': rows, 'edges': edges})
