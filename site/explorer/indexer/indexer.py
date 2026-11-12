#!/usr/bin/env python3
"""explorer-index — the history of a soft3 chain for spacepussy.ai/explorer, python stdlib only.

walks blocks 0..tip from a node's read API (cybernode rs/src/node/chain_routes.rs: /tip, /block/<h>,
/header/<h>, /tx/<id>, /epochs, /cards/<neuron>, /economy, /status), keeps an append-only JSONL of
one line per block under --data, follows new blocks, rewinds on a reorg (compares ids back from the
tip and truncates the tail), and every --publish seconds writes three static files into --site:

  history.json  the whole chain downsampled to <= --points bins per range (all, day, hour); per bin the
                end height and time, hashrate (Σ work ÷ Δt, with the min/max of a 12-block rolling
                estimate), difficulty (expected hashes per block = 2^256 / (target + 1), mean/min/max),
                block time (mean/min/max), signals (coinbase excluded), active and total stake
  stakes.json   every staking position (cyberlink with amount > 0, unlock kind 6, payout kind 7),
                replayed and joined with /cards/<neuron> for the current card, and the settled epochs
                with what each paid; earned per position = Σ payouts of its card
  summary.json  tip, chainwork, recent hashrate and block time, totals, top miners
  earnings.json the emission ledger per epoch and the miners of the last hour, day and all blocks (earnings.py)
  payouts.json  every payout as a receipt, the links and particles paid most, stakers and positions with their yield (earnings.py)
  tickets.json  settlement mining (tru specs/rewards.md §7): the game each epoch's blocks sample (players N, window W, axons),
                the lottery of every settled epoch (k per player, mean against exact, the rule that paid, the rescale, dust)

the chain's work is a ticket once the node runs cybernode feat/ticket-pow: the header is 200 bytes and its last 32 are
`sample`, the commitment of the block's Shapley sample; the work of a block, 2^256 / (target + 1), is then the expected
attempts (tickets) per block and Σ work ÷ Δt is tickets per second. the indexer reads `sample` from the block's `hex`
when the header is 200 bytes and leaves it out on the 168-byte header the alpha runs until it redeploys, so every file
keeps its old fields and gains `work`: 'tickets' or 'hashes'.

every --network-every seconds (network.py): network.json — the nodes the node sees on the wire and the ones the chain
announces, placed by DB-IP Lite (--geo), named by --nodes.

and once per settled epoch (focus.py, in a thread): the full φ* of the epoch into --data/focus/<epoch>.json (the node keeps
only the last one), and axons.json, neurons.json, particles.json, phi/<xx>.json, moved.json (who moved focus) and graph.json (the top of the graph)
from φ*, the genesis export under
--genesis and the cyberlinks in the blocks.

each file is written whole and renamed into place, so a reader never sees half of one.
usage: indexer.py --node http://127.0.0.1:7783 --data /srv/edge/data/explorer --site <site>/explorer/data \
                  --genesis /srv/edge/data/explorer/genesis
"""
import argparse
import json
import math
import os
import signal
import sys
import time
import urllib.error
import threading
import urllib.request
from array import array
from bisect import bisect_left, bisect_right
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

from earnings import Earnings
from focus import FocusIndex
from network import Network

TARGET = 30                 # s per block, the ASERT target (cybernode specs/chain.md)
ROLL = 12                   # blocks in the rolling hashrate estimate behind a bin's min/max
REORG_MAX = 5000            # deeper than this, rebuild from genesis
VERSION = 1
BLOCKS_FORMAT = 2           # 2: blocks.jsonl lines carry every cyberlink ('lk' for amount 0); an older file is re-walked
TICKET_HEADER_HEX = 400     # a 200-byte header (cybernode feat/ticket-pow): bytes 168..200 are `sample`
SAMPLE_HEX = 336            # offset of `sample` in the header's hex
RECORD_HEX = 436            # a 218-byte epoch record: the lottery's four fields after `payouts` (chain-economy §5.6 amended)
LOTTERY_RETRY = 3           # the newest settled epochs whose lottery is asked again when the node did not hold it


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


@lru_cache(maxsize=65536)
def work_of(bits):
    """floor(2^256 / (target + 1)) of a compact target — cybernode chain/pow.rs."""
    b = int(bits, 16) if isinstance(bits, str) else int(bits)
    exp, man = b >> 24, b & 0x7FFFFF
    if not man:
        return 0
    target = man >> (8 * (3 - exp)) if exp <= 3 else man << (8 * (exp - 3))
    return (1 << 256) // (target + 1)


class Down(Exception):
    pass


class Node:
    def __init__(self, base, timeout=15):
        self.base = base.rstrip('/')
        self.timeout = timeout

    def get(self, path, missing_ok=False, text=False):
        req = urllib.request.Request(self.base + path, headers={'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                body = r.read()
                return body.decode() if text else json.loads(body)
        except urllib.error.HTTPError as e:
            if missing_ok and 400 <= e.code < 500:
                return None
            raise Down(f'{path}: HTTP {e.code}')
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise Down(f'{path}: {e}')


def stake_tx(t):
    """the staking part of a decoded signal, or None."""
    k, x = t.get('kind'), t.get('tx') or {}
    if k == 'cyberlink' and int(x.get('amount') or 0) > 0:
        return {'txid': t['txid'], 'kind': k, 'from': x['from'], 'p': x['p'], 'q': x['q'],
                'amount': int(x['amount']), 'valence': int(x.get('valence') or 0)}
    if k == 'unlock':
        return {'txid': t['txid'], 'kind': k, 'from': x['from'], 'p': x['p'], 'q': x['q'], 'amount': int(x['amount'])}
    if k == 'payout':
        return {'txid': t['txid'], 'kind': k, 'from': x['from'], 'p': x['p'], 'q': x['q'], 'payout': x['payout']}
    return None


def plain_link(t):
    """a cyberlink with no stake: it adds an axon to the graph and earns nothing."""
    x = t.get('tx') or {}
    if t.get('kind') == 'cyberlink' and int(x.get('amount') or 0) == 0:
        return {'txid': t['txid'], 'from': x['from'], 'p': x['p'], 'q': x['q']}
    return None


def record_tail(rec):
    """the lottery's four fields of a 218-byte epoch record (cybernode chain/economy/settle.rs `Record::encode`):
    players u32, samples u32, by_mean u32, value i64 (v(N) at 2^60), little-endian after the 198 old bytes."""
    h = rec.get('record') or ''
    if len(h) != RECORD_HEX:
        return None
    b = bytes.fromhex(h[396:])
    return {'players': int.from_bytes(b[0:4], 'little'), 'samples': int.from_bytes(b[4:8], 'little'),
            'by_mean': int.from_bytes(b[8:12], 'little'), 'value': str(int.from_bytes(b[12:20], 'little', signed=True))}


def lottery_summary(lot):
    """what one epoch's lottery says, from GET /epoch/{E}/lottery (rewards.md §7 'the payout'): per player a(c) is the mean
    when k ≥ K_MIN, else the exact gradient; a⁺ = max(0, a); the shares paid are a⁺ rescaled to v(N) and floored; the
    dust v(N) − Σ paid stays in the pool."""
    est = lot.get('estimates') or []
    value = int(lot.get('value') or 0)
    a_plus = sum(max(0, int(e['a'])) for e in est)
    paid = sum(int(e['paid']) for e in est)
    paid_n = sum(1 for e in est if int(e['paid']) > 0)
    k_min = int(lot.get('k_min') or 64)
    by_mean = sum(1 for e in est if int(e['k']) >= k_min)
    rescaled = a_plus > 0 and value > 0
    return {'epoch': int(lot['epoch']), 'settled_at': lot.get('settled_at'), 'beacon': lot.get('beacon'), 'window_end': lot.get('window_end'),
            'players': int(lot.get('players') or 0), 'samples': int(lot.get('samples') or 0), 'k_min': k_min,
            'by_mean': by_mean, 'by_exact': len(est) - by_mean, 'value': str(value), 'a_plus': str(a_plus), 'paid': str(paid), 'paid_players': paid_n,
            'rescaled': rescaled, 'dust': str(value - paid) if rescaled else None,
            'k_min_of': min((int(e['k']) for e in est), default=None), 'k_max_of': max((int(e['k']) for e in est), default=None)}


def sig(x, n=4):
    """a float rounded to n significant digits, for compact JSON."""
    if x is None or not math.isfinite(x):
        return None
    if x == 0:
        return 0
    return float(f'{x:.{n}g}') if abs(x) < 1e15 else float(f'{x:.{n}e}')


class Index:
    def __init__(self, node, data, site, workers, points):
        self.node, self.data, self.site, self.workers, self.points = node, data, site, workers, points
        os.makedirs(data, exist_ok=True)
        os.makedirs(site, exist_ok=True)
        self.path = os.path.join(data, 'blocks.jsonl')
        self.cards_path = os.path.join(data, 'cards.json')
        self.games_path = os.path.join(data, 'games.json')
        self.lotteries_path = os.path.join(data, 'lotteries.json')
        self.t = array('q')         # block time, by height
        self.bits = array('L')      # compact target, by height
        self.txs = array('l')       # signals incl. coinbase
        self.size = array('l')
        self.fees = array('q')      # Σ fees of the block's signals, all to its miner (chain-economy §6.4)
        self.miner = array('l')     # index into self.miners, -1 = none
        self.off = array('q')       # byte offset of each line in blocks.jsonl
        self.ids = bytearray()      # 32 bytes per height
        self.sample = []            # the header's `sample` (hex) by height; None on a 168-byte header
        self.games = {}             # epoch -> the game its window samples (/game/<beacon> without the base), kept in games.json
        self.lotteries = {}         # epoch -> GET /epoch/<E>/lottery, None when the node held none
        self.miners, self.miner_ix = [], {}
        self.stx = []               # (height, staking signal dict), in chain order
        self.links = []             # (height, {txid, from, p, q}) of every cyberlink on chain, staked or not
        self.token = None           # the native token id, from /balance
        self.epochs = {}            # epoch -> record without the raw bytes
        self.card_ids = {}          # "from:p:q" -> card id, kept across unlocks
        self.chain = ''
        self.min_lock = 20160
        self.earn = Earnings(self, work_of)
        self.load()

    # ------------------------------------------------------------------ store
    def load(self):
        if os.path.exists(self.cards_path):
            try:
                self.card_ids = json.load(open(self.cards_path))
            except ValueError:
                self.card_ids = {}
        for path, attr in ((self.games_path, 'games'), (self.lotteries_path, 'lotteries')):
            if os.path.exists(path):
                try:
                    setattr(self, attr, {int(k): v for k, v in json.load(open(path)).items()})
                except ValueError:
                    pass
        meta = os.path.join(self.data, 'blocks.format')
        fmt = open(meta).read().strip() if os.path.exists(meta) else ''
        if fmt != str(BLOCKS_FORMAT):
            if os.path.exists(self.path):
                log(f'blocks.jsonl is format {fmt or 1}, this indexer writes {BLOCKS_FORMAT}: walking the chain again')
                os.replace(self.path, self.path + '.old')
            with open(meta, 'w') as f:
                f.write(f'{BLOCKS_FORMAT}\n')
        if not os.path.exists(self.path):
            return
        good = 0
        with open(self.path, 'rb') as f:
            pos = 0
            for line in f:
                try:
                    b = json.loads(line)
                    if b['h'] != len(self.t):
                        raise ValueError('height out of order')
                except (ValueError, KeyError):
                    log(f'blocks.jsonl: bad line at byte {pos}, truncating there')
                    break
                self._push(b, pos)
                pos += len(line)
                good = pos
        if good != os.path.getsize(self.path):
            with open(self.path, 'r+b') as f:
                f.truncate(good)
        log(f'loaded {len(self.t)} blocks, {len(self.stx)} staking signals from {self.path}')

    def _push(self, b, pos):
        self.t.append(int(b['t']))
        self.bits.append(int(b['bits'], 16))
        self.txs.append(int(b['txs']))
        self.size.append(int(b['size']))
        self.fees.append(int(b.get('fees') or 0))
        m = b.get('miner')
        if m:
            if m not in self.miner_ix:
                self.miner_ix[m] = len(self.miners)
                self.miners.append(m)
            self.miner.append(self.miner_ix[m])
        else:
            self.miner.append(-1)
        self.off.append(pos)
        self.ids += bytes.fromhex(b['id'])
        self.sample.append(b.get('sample'))
        for s in b.get('stx') or ():
            self.stx.append((b['h'], s))
            if s['kind'] == 'cyberlink':
                self.links.append((b['h'], {'txid': s['txid'], 'from': s['from'], 'p': s['p'], 'q': s['q']}))
        for l in b.get('lk') or ():
            self.links.append((b['h'], l))

    def id_at(self, h):
        return self.ids[h * 32:(h + 1) * 32].hex()

    def append(self, blocks):
        with open(self.path, 'ab') as f:
            pos = f.tell()
            for b in blocks:
                line = (json.dumps(b, separators=(',', ':')) + '\n').encode()
                f.write(line)
                self._push(b, pos)
                pos += len(line)
            f.flush()
            os.fsync(f.fileno())

    def truncate(self, n):
        """keep heights < n."""
        if n >= len(self.t):
            return
        cut = self.off[n]
        for a in (self.t, self.bits, self.txs, self.size, self.fees, self.miner, self.off):
            del a[n:]
        del self.ids[n * 32:]
        del self.sample[n:]
        self.stx = [(h, s) for h, s in self.stx if h < n]
        self.links = [(h, l) for h, l in self.links if h < n]
        with open(self.path, 'r+b') as f:
            f.truncate(cut)
            f.flush()
            os.fsync(f.fileno())

    # ------------------------------------------------------------------ follow
    def rewind(self):
        """find the highest stored height the node still agrees with; drop everything above it."""
        h = len(self.t) - 1
        floor = max(-1, h - REORG_MAX)
        while h > floor:
            hdr = self.node.get(f'/header/{h}', missing_ok=True)
            if hdr and hdr['id'] == self.id_at(h):
                break
            h -= 1
        if h == floor and floor >= 0:
            h = -1
        log(f'reorg: rewinding from {len(self.t) - 1} to {h}')
        self.truncate(h + 1)

    def fetch_block(self, h):
        b = self.node.get(f'/block/{h}')
        stx, lk = [], []
        if len(b.get('txids') or ()) > 1:
            for tid in b['txids'][1:]:
                t = self.node.get(f'/tx/{tid}')
                s = stake_tx(t)
                if s:
                    stx.append(s)
                pl = plain_link(t)
                if pl:
                    lk.append(pl)
        rec = {'h': b['height'], 'id': b['id'], 'prev': b['prev'], 't': b['time'], 'bits': b['bits'],
               'work': work_of(b['bits']), 'txs': b['txs'], 'size': b['size'], 'miner': b.get('miner'), 'fees': b.get('fees', 0)}
        hx = b.get('hex') or ''
        if len(hx) == TICKET_HEADER_HEX:
            rec['sample'] = hx[SAMPLE_HEX:]
        if stx:
            rec['stx'] = stx
        if lk:
            rec['lk'] = lk
        return rec

    def step(self, pool, batch):
        """one round of following: returns the number of blocks added."""
        tip = self.node.get('/tip')
        th, n = int(tip['height']), len(self.t)
        if n and (th < n - 1 or (th == n - 1 and tip['id'] != self.id_at(n - 1))):
            self.rewind()
            return 0
        if th < n:
            return 0
        hs = list(range(n, min(th, n + batch - 1) + 1))
        got = list(pool.map(self.fetch_block, hs))
        keep = []
        for b in got:
            prev = keep[-1]['id'] if keep else (self.id_at(b['h'] - 1) if b['h'] > 0 else None)
            if b['h'] > 0 and b['prev'] != prev:
                break
            keep.append(b)
        if keep:
            self.append(keep)
        if len(keep) < len(got):
            if not keep:
                self.rewind()
            return len(keep)
        return len(keep)

    def native_token(self):
        """the id of the native token: the token the node reports a balance in."""
        if not self.token:
            self.token = self.node.get('/balance/' + '00' * 32, text=True)
            self.token = dict(l.split(': ', 1) for l in self.token.splitlines() if ': ' in l)['token']
        return self.token

    # ------------------------------------------------------------------ the node's economy
    def refresh_economy(self):
        eco = self.node.get('/economy', missing_ok=True) or {}
        self.min_lock = int(eco.get('min_lock') or self.min_lock)
        last = int(eco.get('last_settled') or 0)
        have = max(self.epochs) if self.epochs else 0
        after = max(0, min(have, last) - 3)      # re-read the last few: a reorg below finality is rare, cheap to cover
        while after < last:
            r = self.node.get(f'/epochs?after={after}&limit=100', missing_ok=True) or {}
            eps = r.get('epochs') or []
            if not eps:
                break
            for e in eps:
                tail = record_tail(e)
                e.pop('record', None)
                if tail:
                    e.update(tail)
                self.epochs[int(e['epoch'])] = e
            after = int(eps[-1]['epoch'])
        for e in [e for e in self.epochs if e > last]:
            del self.epochs[e]
            self.lotteries.pop(e, None)
        if self.ticket_chain():
            self.refresh_lotteries(last)
            self.refresh_game(eco)
        return eco

    def ticket_chain(self):
        """the chain mines by tickets: the tip's header carries a sample."""
        return bool(self.sample) and self.sample[-1] is not None

    def refresh_lotteries(self, last):
        """GET /epoch/<E>/lottery of every settled epoch once, newest first (the node holds only the estimates of its last
        settlements), kept in lotteries.json; the newest few are asked again when the node held none."""
        new = 0
        for e in sorted(self.epochs, reverse=True):
            if e in self.lotteries and (self.lotteries[e] is not None or e <= last - LOTTERY_RETRY):
                continue
            self.lotteries[e] = self.node.get(f'/epoch/{e}/lottery', missing_ok=True)
            new += self.lotteries[e] is not None
        if new:
            tmp = f'{self.lotteries_path}.{os.getpid()}.tmp'
            with open(tmp, 'w') as f:
                json.dump({str(k): v for k, v in self.lotteries.items()}, f, separators=(',', ':'))
            os.replace(tmp, self.lotteries_path)

    def refresh_game(self, eco):
        """the game the blocks of the tip's epoch sample (rewards.md §7: the blocks of epoch E + 1 sample the game of E),
        read once per epoch from GET /game/<beacon>; the node serves the current and the previous game only."""
        L = int(eco.get('epoch_length') or 240)
        tip = len(self.t) - 1
        e = (max(1, tip) - 1) // L + 1          # the epoch of the tip (chain-economy §2.1)
        sampled = e - 1                         # the game its blocks sample
        if sampled in self.games or sampled * L >= len(self.t):
            return
        beacon = self.id_at(sampled * L)
        g = self.node.get(f'/game/{beacon}', missing_ok=True)
        if not g:
            return
        n = len(g.get('players') or ())
        w = int(g.get('w_ticket') or 0)
        self.games[sampled] = {'epoch': sampled, 'beacon': beacon, 'cluster': g.get('cluster'), 'w_ticket': w, 'players': n,
                               'axons': len(g.get('base') or ()), 'marginals': min(n, max(0, w - 1)), 'probes': w - min(n, max(0, w - 1)),
                               'window_from': sampled * L + 1, 'window_to': (sampled + 1) * L, 'read_at': tip}
        tmp = f'{self.games_path}.{os.getpid()}.tmp'
        with open(tmp, 'w') as f:
            json.dump({str(k): v for k, v in self.games.items()}, f)
        os.replace(tmp, self.games_path)
        log(f'game of epoch {sampled}: {n} players, W_TICKET {w}, {self.games[sampled]["axons"]} axons')

    # ------------------------------------------------------------------ outputs
    def replay(self):
        """positions and the stake change points, from the staking signals in chain order."""
        cards, points = {}, [(0, 0, 0)]
        active = total = 0
        for h, s in self.stx:
            key = f"{s['from']}:{s['p']}:{s['q']}"
            c = cards.get(key)
            if s['kind'] == 'cyberlink':
                if c is None or c['stake'] == 0:
                    c = cards[key] = {'key': key, 'neuron': s['from'], 'p': s['p'], 'q': s['q'], 'stake': 0, 'valence': 0,
                                      'opened_at': h, 'opened_tx': s['txid'], 'owner': s['from'], 'since': h, 'locked': 0, 'unlocked': 0, 'txs': []}
                c['stake'] += s['amount']
                c['locked'] += s['amount']
                c['valence'] = s['valence']
                c['since'] = h
            elif s['kind'] == 'unlock' and c:
                c['stake'] = max(0, c['stake'] - s['amount'])
                c['unlocked'] += s['amount']
            elif s['kind'] == 'payout' and c:
                c['owner'] = s['payout']
            else:
                continue
            c['txs'].append({'h': h, 'txid': s['txid'], 'kind': s['kind'], 'amount': str(s.get('amount', 0))})
            active = sum(x['stake'] for x in cards.values() if x['valence'] != 0)
            total = sum(x['stake'] for x in cards.values())
            if points[-1][0] == h:
                points[-1] = (h, active, total)
            else:
                points.append((h, active, total))
        return cards, points

    def bins(self, lo, hi, points, bps_at=None):
        """heights lo..hi (lo >= 2) in <= self.points bins."""
        n = hi - lo + 1
        if n <= 0:
            return None
        per = max(1, math.ceil(n / self.points))
        t, bits, txs = self.t, self.bits, self.txs
        w = [float(work_of(bits[i])) for i in range(max(0, lo - ROLL - 1), hi + 1)]
        base = max(0, lo - ROLL - 1)
        cw = [0.0]
        for x in w:
            cw.append(cw[-1] + x)                       # cw[k] = Σ w over heights base .. base+k-1

        def W(a, b):                                    # Σ work over heights a..b
            return cw[b - base + 1] - cw[a - base]
        ph = [p[0] for p in points]
        out = {k: [] for k in ('h', 't', 'hr', 'hr_lo', 'hr_hi', 'd', 'd_lo', 'd_hi', 'bt', 'bt_lo', 'bt_hi', 'tx', 'sa', 'st', 'fb')}
        win = max(per, ROLL)                            # the line: over the bin, never fewer than ROLL blocks
        for a in range(lo, hi + 1, per):
            b = min(hi, a + per - 1)
            a2 = max(2, min(a, b - win + 1))
            span = t[b] - t[a2 - 1]
            hr = W(a2, b) / span if span > 0 else None
            rolls = []
            for i in range(a, b + 1):
                j = i - ROLL
                if j >= 1 and t[i] > t[j]:
                    rolls.append(W(j + 1, i) / (t[i] - t[j]))
            ds = [w[i - base] for i in range(a, b + 1)]
            dts = [t[i] - t[i - 1] for i in range(a, b + 1)]
            p = points[bisect_right(ph, b) - 1]
            out['h'].append(b)
            out['t'].append(t[b])
            out['hr'].append(sig(hr))
            out['hr_lo'].append(sig(min(rolls)) if rolls else None)
            out['hr_hi'].append(sig(max(rolls)) if rolls else None)
            out['d'].append(sig(sum(ds) / len(ds)))
            out['d_lo'].append(sig(min(ds)))
            out['d_hi'].append(sig(max(ds)))
            out['bt'].append(sig(span / (b - a2 + 1)) if span > 0 else None)
            out['bt_lo'].append(min(dts))
            out['bt_hi'].append(max(dts))
            out['tx'].append(sum(txs[i] - 1 for i in range(a, b + 1)))
            out['sa'].append(sig(float(p[1]), 6))
            out['st'].append(sig(float(p[2]), 6))
            out['fb'].append(bps_at(b) if bps_at else None)
        out['per'] = per
        out['from'] = lo
        out['to'] = hi
        return out

    def since(self, secs):
        """the first height whose time is within secs of the tip (times are near-monotonic; a linear scan back)."""
        tip = len(self.t) - 1
        edge = self.t[tip] - secs
        h = tip
        while h > 2 and self.t[h - 1] >= edge:
            h -= 1
        return h

    def rate(self, k):
        """Σ work ÷ Δt over the last k blocks, and the mean block time."""
        tip = len(self.t) - 1
        a = max(2, tip - k + 1)
        if tip < a or self.t[tip] <= self.t[a - 1]:
            return None, None
        span = self.t[tip] - self.t[a - 1]
        return sum(work_of(self.bits[i]) for i in range(a, tip + 1)) / span, span / (tip - a + 1)

    def publish(self, eco):
        tip = len(self.t) - 1
        if tip < 2:
            return
        now = int(time.time())
        cards, points = self.replay()
        bps_at = None
        try:
            self.earn.prepare(eco)
            bps_at = self.earn.bps_at
        except Down:
            raise
        except Exception as e:      # the earnings views are a side view: their failure never stops the index
            log(f'earnings: {type(e).__name__}: {e}')
        work = 'tickets' if self.ticket_chain() else 'hashes'
        hist = {'version': VERSION, 'chain': self.chain, 'generated': now, 'tip': tip, 'tip_time': self.t[tip], 'target': TARGET, 'work': work,
                'note': 'per bin: h = last height, t = its time; hr = Σ work ÷ Δt and bt = mean block time (s), both over the bin or the 12 blocks '
                        'ending at it when the bin is shorter; hr_lo/hr_hi = range of a 12-block rolling estimate, bt_lo/bt_hi = fastest/slowest block; '
                        'd = the work of a block, 2^256/(target+1): expected hashes per block when work = hashes, expected attempts (tickets) per block '
                        'when work = tickets (rewards.md §7), so hr is H/s or tickets/s; tx = signals, coinbase excluded; '
                        'sa/st = active/total stake at the bin end (floats for plotting; exact values in stakes.json); fb = focus_bps in force for the bin\'s last '
                        'block, the share of the subsidy that goes to the focus pool, in basis points (chain-economy §6.1). genesis-to-block-1 is left out.',
                'smooth': ROLL, 'ranges': {'all': self.bins(2, tip, points, bps_at), 'day': self.bins(self.since(86400), tip, points, bps_at),
                           'hour': self.bins(self.since(3600), tip, points, bps_at)}}
        self.write('history.json', hist)

        # positions joined with the node's cards (current state) and the epochs' payouts (earned)
        earned, paid_n, last_paid = {}, {}, {}
        for e in sorted(self.epochs):
            for p in self.epochs[e].get('payouts') or ():
                earned[p['card']] = earned.get(p['card'], 0) + int(p['amount'])
                paid_n[p['card']] = paid_n.get(p['card'], 0) + 1
                last_paid[p['card']] = e
        for neuron in sorted({c['neuron'] for c in cards.values()}):
            r = self.node.get(f'/cards/{neuron}', missing_ok=True) or {}
            for nc in r.get('cards') or ():
                key = f"{neuron}:{nc['p']}:{nc['q']}"
                self.card_ids[key] = nc['card']
                if key in cards:
                    cards[key]['node'] = nc
        tmp = f'{self.cards_path}.{os.getpid()}.tmp'
        with open(tmp, 'w') as f:
            json.dump(self.card_ids, f)
        os.replace(tmp, self.cards_path)
        positions = []
        for c in sorted(cards.values(), key=lambda c: (-c['stake'], c['opened_at'])):
            nc = c.get('node') or {}
            card = nc.get('card') or self.card_ids.get(c['key'])
            positions.append({
                'card': card, 'neuron': c['neuron'], 'p': c['p'], 'q': c['q'], 'valence': nc.get('valence', c['valence']),
                'stake': str(nc.get('stake', c['stake'])), 'owner': nc.get('owner', c['owner']), 'since': nc.get('since', c['since']),
                'unlock_at': nc.get('unlock_at', c['since'] + self.min_lock if c['stake'] else None),
                'opened_at': c['opened_at'], 'opened_tx': c['opened_tx'], 'open': c['stake'] > 0,
                'locked_total': str(c['locked']), 'unlocked_total': str(c['unlocked']),
                'earned': str(earned.get(card, 0)), 'paid_epochs': paid_n.get(card, 0), 'last_paid_epoch': last_paid.get(card), 'txs': c['txs'][-20:]})
        epochs = [{k: self.epochs[e].get(k) for k in ('epoch', 'boundary', 'settled_at', 'budget', 'paid', 'rewarded', 'focus_bps', 'pool_after',
                                                       'particles', 'axons', 'delta_syntropy', 'players', 'samples', 'by_mean', 'value')}
                  | {'payouts': len(self.epochs[e].get('payouts') or ())}
                  for e in sorted(self.epochs, reverse=True)]
        for e in epochs:
            for k in ('budget', 'paid', 'pool_after', 'delta_syntropy'):
                if e.get(k) is not None:
                    e[k] = str(e[k])
        act = sum(int(p['stake']) for p in positions if p['open'] and int(p['valence']) != 0)
        tot = sum(int(p['stake']) for p in positions if p['open'])
        stakes = {'version': VERSION, 'chain': self.chain, 'generated': now, 'tip': tip, 'min_lock': self.min_lock, 'work': work,
                  'economy': {k: (str(v) if isinstance(v, int) and abs(v) > 2 ** 53 else v) for k, v in eco.items() if k != 'timings'},
                  'active_stake': str(act), 'total_stake': str(tot), 'positions_open': sum(1 for p in positions if p['open']),
                  'earned_total': str(sum(earned.values())), 'positions': positions, 'epochs': epochs,
                  'events': [{'h': h, **{k: (str(v) if k == 'amount' else v) for k, v in s.items()}} for h, s in self.stx[-200:]][::-1]}
        self.write('stakes.json', stakes)
        if bps_at:
            try:
                self.earn.write_blocks(now)
                self.earn.write_payouts(cards, now)
            except Down:
                raise
            except Exception as e:
                log(f'earnings: {type(e).__name__}: {e}')

        hr100, bt100 = self.rate(100)
        hr1k, bt1k = self.rate(1000)
        tail = range(max(1, tip - 999), tip + 1)
        counts = {}
        for i in tail:
            if self.miner[i] >= 0:
                counts[self.miner[i]] = counts.get(self.miner[i], 0) + 1
        top = sorted(counts.items(), key=lambda kv: -kv[1])[:10]
        summary = {'version': VERSION, 'chain': self.chain, 'generated': now, 'height': tip, 'id': self.id_at(tip), 'time': self.t[tip], 'work': work,
                   'ticket': self.ticket_now(eco) if work == 'tickets' else None,
                   'chainwork': str(sum(work_of(b) for b in self.bits[1:])), 'difficulty': str(work_of(self.bits[tip])),
                   'hashrate_100': sig(hr100), 'hashrate_1000': sig(hr1k), 'block_time_100': sig(bt100), 'block_time_1000': sig(bt1k),
                   'signals_total': sum(self.txs) - (len(self.txs) - 1), 'staking_signals': len(self.stx),
                   'txs_total': sum(self.txs) - (len(self.txs) - 1), 'staking_txs': len(self.stx),   # signals_total/staking_signals; the old keys stay for one release
                   'cyberlinks': len(self.links), 'positions_open': stakes['positions_open'],
                   'active_stake': str(act), 'total_stake': str(tot), 'epochs_settled': len(self.epochs), 'earned_total': stakes['earned_total'],
                   'miners_1000': [{'miner': self.miners[m], 'blocks': n} for m, n in top], 'blocks_file_bytes': os.path.getsize(self.path),
                   'earnings': self.earn.totals}
        self.write('summary.json', summary)
        if work == 'tickets':
            self.write_tickets(eco, now, hr100, hr1k)

    def ticket_now(self, eco):
        """the game the tip's epoch samples, and the tip's own sample."""
        L = int(eco.get('epoch_length') or 240)
        tip = len(self.t) - 1
        e = (max(1, tip) - 1) // L + 1
        g = self.games.get(e - 1)
        return {'epoch': e, 'samples_game': e - 1, 'sample': self.sample[tip], 'game': g, 'window_from': (e - 1) * L + 1, 'window_to': e * L}

    def write_tickets(self, eco, now, hr100, hr1k):
        """tickets.json: settlement mining as the chain shows it (rewards.md §7) — the games sampled, the lotteries settled."""
        tip = len(self.t) - 1
        L = int(eco.get('epoch_length') or 240)
        lots = [lottery_summary(self.lotteries[e]) for e in sorted(self.lotteries, reverse=True) if self.lotteries[e]]
        first = next((h for h in range(len(self.sample)) if self.sample[h] is not None), None)
        # the per-player estimate of every held epoch as lottery/<E>.json, written once: the node serves only its last
        # settlements, the explorer's epoch page reads this file first and asks the node only for an epoch the index lacks
        os.makedirs(os.path.join(self.site, 'lottery'), exist_ok=True)
        for e, lot in self.lotteries.items():
            if lot and not os.path.exists(os.path.join(self.site, 'lottery', f'{e}.json')):
                self.write(os.path.join('lottery', f'{e}.json'), lot)
        self.write('tickets.json', {
            'version': VERSION, 'chain': self.chain, 'generated': now, 'tip': tip, 'tip_time': self.t[tip], 'epoch_length': L, 'target': TARGET,
            'k_min': next((int(l['k_min']) for l in lots), 64), 'first_ticket_height': first,
            'attempts_per_block': str(work_of(self.bits[tip])), 'bits': f'{self.bits[tip]:#010x}',
            'tickets_per_s_100': sig(hr100), 'tickets_per_s_1000': sig(hr1k),
            'now': self.ticket_now(eco), 'games': [self.games[e] for e in sorted(self.games, reverse=True)[:50]],
            'lotteries': lots[:500], 'lotteries_held': sum(1 for e in self.lotteries if self.lotteries[e]), 'lotteries_missing': sorted(e for e in self.lotteries if not self.lotteries[e])[-20:],
            'note': 'the work of a block is a settlement ticket: one Shapley sample of the game of the epoch before, W_TICKET entries '
                    '(the marginals of a cyclic window of the ordering drawn from the template, the rest gradient probes), committed in the header '
                    'as sample; the block id below the target is the ticket, the work and the subsidy (tru specs/rewards.md §7). attempts per block '
                    '= 2^256 ÷ (target + 1); tickets/s = Σ attempts ÷ Δt over the last 100 and 1,000 blocks. games: per epoch the game its window '
                    'samples, from GET /game/<beacon>: players N, W_TICKET, marginals = min(N, W − 1) and probes = W − marginals per ticket, the '
                    'axons of the base. lotteries: per settled epoch from GET /epoch/E/lottery: samples = Σ k over the players, by_mean = players '
                    'with k ≥ K_MIN paid by their mean, by_exact = the rest paid by the exact path gradient, value = v(N) at 2^60, a_plus = Σ max(0, a), '
                    'paid = Σ of the rescaled shares, dust = v(N) − paid (the pool\'s), rescaled = whether a_plus > 0 and v(N) > 0.'})

    def write(self, name, obj):
        path = os.path.join(self.site, name)
        tmp = f'{path}.{os.getpid()}.{threading.get_ident()}.tmp'
        with open(tmp, 'w') as f:
            json.dump(obj, f, separators=(',', ':'))
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--node', default='http://127.0.0.1:7783')
    ap.add_argument('--data', default='/srv/edge/data/explorer')
    ap.add_argument('--site', default='/var/www/burial/snapshot-pussy/site/explorer/data')
    ap.add_argument('--workers', type=int, default=4, help='parallel block fetches while catching up')
    ap.add_argument('--batch', type=int, default=200, help='blocks per catch-up round')
    ap.add_argument('--poll', type=float, default=2.0, help='seconds between /tip reads once caught up')
    ap.add_argument('--publish', type=float, default=30.0, help='seconds between writes of the site files')
    ap.add_argument('--points', type=int, default=2000, help='max bins per series')
    ap.add_argument('--genesis', default='/srv/edge/data/explorer/genesis', help='the genesis export (links.tsv, balances.tsv, accounts.tsv, particles.tsv)')
    ap.add_argument('--focus-rate', type=float, default=50.0, help='/focus/<particle> reads per second when recording an epoch')
    ap.add_argument('--geo', default='/srv/edge/data/explorer/geo', help='DB-IP Lite city CSVs (dbip-city-lite-YYYY-MM.csv.gz), fetched monthly')
    ap.add_argument('--nodes', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nodes.toml'), help='names of the nodes we run')
    ap.add_argument('--network-every', type=float, default=30.0, help='seconds between reads of /peers for network.json')
    ap.add_argument('--once', action='store_true', help='catch up, publish once, exit')
    a = ap.parse_args()

    stop = []
    signal.signal(signal.SIGTERM, lambda *_: stop.append(1))
    signal.signal(signal.SIGINT, lambda *_: stop.append(1))
    node = Node(a.node)
    ix = Index(node, a.data, a.site, a.workers, a.points)
    fx = FocusIndex(ix, a.genesis, a.focus_rate) if os.path.exists(os.path.join(a.genesis, 'links.tsv')) else None
    if not fx:
        log(f'{a.genesis}/links.tsv: not found; the axon and neuron index is off')
    net = Network(node, a.data, a.site, a.geo, a.nodes)
    last_pub, last_net, backoff, eco = 0.0, 0.0, 1.0, {}
    with ThreadPoolExecutor(max_workers=a.workers) as pool:
        while not stop:
            try:
                if not ix.chain:
                    st = dict(l.split(': ', 1) for l in node.get('/status', text=True).splitlines() if ': ' in l)
                    ix.chain = st.get('chain', '?')
                    log(f'node {a.node}: {ix.chain} at height {st.get("height")}')
                added = ix.step(pool, a.batch)
                if added:
                    log(f'+{added} → height {len(ix.t) - 1}')
                caught_up = added < a.batch
                if time.time() - last_pub >= a.publish and (caught_up or time.time() - last_pub >= 4 * a.publish):
                    eco = ix.refresh_economy()
                    ix.publish(eco)
                    last_pub = time.time()
                    if fx and caught_up:
                        fx.tick(eco)
                    if a.once and caught_up:
                        if fx and fx.busy:
                            fx.busy.join()
                        break
                if caught_up and time.time() - last_net >= a.network_every:
                    last_net = time.time()
                    try:
                        net.tick(ix)
                    except Down:
                        raise
                    except Exception as e:     # the network tab is a side view: its failure never stops the index
                        log(f'network: {type(e).__name__}: {e}')
                backoff = 1.0
                if caught_up:
                    time.sleep(a.poll)
            except Down as e:
                log(f'node away: {e}; retry in {backoff:.0f} s')
                time.sleep(backoff)
                backoff = min(60.0, backoff * 2)
            except Exception as e:     # a bad answer or a full disk: say it, wait, try again; runit restarts us if we die anyway
                log(f'error: {type(e).__name__}: {e}; retry in {backoff:.0f} s')
                time.sleep(backoff)
                backoff = min(60.0, backoff * 2)
    log(f'stopped at height {len(ix.t) - 1}')


if __name__ == '__main__':
    sys.exit(main())
