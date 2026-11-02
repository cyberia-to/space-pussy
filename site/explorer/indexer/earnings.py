"""earnings — what the chain pays for, from chain data only (cybernode specs/chain-economy.md §5.2–§6.2).

every block mints SUBSIDY and splits it (§6.1–6.2): the miner's coinbase is SUBSIDY − cut(h) + the block's fees, the focus pool
gets cut(h) = floor(SUBSIDY · focus_bps / 10,000), with focus_bps the split fixed at the last boundary before h
(focus_bps(E) = min(5,000, isqrt(floor(active(E) · 10^8 / supply(E)))), 0 in epoch 1). at settle(E) the pool releases a budget of
a quarter of itself (§5.5) to the positions that added stake on the winning side of an axon, each capped at 1 % of what it added.

outputs (site data)
  earnings.json  per new block: the emission ledger per epoch (to miners, fees, to the pool, budget, paid, pool after, θ, focus_bps),
                 the totals, and the miners of the last hour, day and all blocks (blocks, work, subsidy + fees, first and last block)
  payouts.json   per settlement or stake change: every payout as a receipt (epoch, card, author, owner, p → q, valence, the card's stake
                 at the boundary, the stake it added in the epoch, its 1 % cap, amount), the links and particles paid most, the stakers
                 (neurons) and the positions with their yield per epoch of stake held

the node publishes per settled epoch only the payouts with amount > 0 ({card, owner, amount}) — no per-position credit x(c), no
attribution a(c), no high-water mark (cybernode rs/src/chain/economy_api.rs). the receipts carry what the chain says plus what
follows from the staking signals (stake at the boundaries, stake added, the cap); they never estimate a credit.
"""
import math

POOL_RELEASE = 4            # §0: budget = pool / 4 per settlement
R_MAX_PPM = 10_000          # §0: a position earns at most 1 % of the stake it added, per settlement
FOCUS_MAX_BPS = 5_000       # §0: at most half the subsidy leaves proof of work
EPOCHS_PER_YEAR = 4_380     # 240 blocks × 30 s = 2 h; 12 a day; 365 days
TOP_MINERS = 100
TOP_ROWS = 200
RECEIPTS = 5_000


def sig(x, n=4):
    if x is None or not math.isfinite(x):
        return None
    if x == 0:
        return 0
    return float(f'{x:.{n}g}') if abs(x) < 1e15 else float(f'{x:.{n}e}')


def status_of(node):
    t = node.get('/status', text=True)
    return dict(l.split(': ', 1) for l in t.splitlines() if ': ' in l)


class Earnings:
    def __init__(self, ix, work_of):
        self.ix, self.work_of = ix, work_of
        self.s0 = None              # genesis supply: supply − height · SUBSIDY, from /status (conservation, §6.3)
        self.subsidy = None
        self.pool_node = None       # (height, pool) from /status, to check the ledger against
        self.L = 240
        self.bps = [0]              # bps[E] = focus_bps(E), the split in force for the blocks of epoch E + 1
        self.bps_src = ['genesis']  # 'record' (the epoch record) or 'computed' (boundary passed, epoch not settled yet)
        self.active = [0]           # active stake at boundary E
        self.snaps = [{}]           # snaps[E] = {card key: (stake, valence)} after the block at boundary E, stake > 0 only
        self.card_meta = {}         # card id -> (author, p, q), for payout cards the indexer has no key for
        self.blocks_key = None
        self.totals = None
        self.pay_key = None
        self.sanity = {}

    # ------------------------------------------------------------------ the split per epoch
    def prepare(self, eco):
        """read /status once, replay stake to every passed boundary, and fix focus_bps per epoch."""
        ix = self.ix
        st = status_of(ix.node)
        self.subsidy = int(st['subsidy'])
        self.s0 = int(st['supply']) - int(st['height']) * self.subsidy
        self.pool_node = (int(st['height']), int(st.get('pool') or 0))
        self.L = int(eco.get('epoch_length') or 240)
        tip = len(ix.t) - 1
        last_b = tip // self.L                          # boundaries passed: 1..last_b
        stx = list(ix.stx)
        cards, snaps, active = {}, [{}], [0]
        i = 0
        for E in range(1, last_b + 1):
            b = E * self.L
            while i < len(stx) and stx[i][0] <= b:
                h, s = stx[i]
                i += 1
                key = f"{s['from']}:{s['p']}:{s['q']}"
                c = cards.get(key)
                if s['kind'] == 'cyberlink':
                    if c is None or c[0] == 0:
                        c = cards[key] = [0, 0]
                    c[0] += s['amount']
                    c[1] = s['valence']
                elif s['kind'] == 'unlock' and c:
                    c[0] = max(0, c[0] - s['amount'])
            snaps.append({k: (v[0], v[1]) for k, v in cards.items() if v[0] > 0})
            active.append(sum(v[0] for v in cards.values() if v[1] != 0))
        bps, src, mism = [0], ['genesis'], []
        for E in range(1, last_b + 1):
            supply = self.s0 + E * self.L * self.subsidy
            calc = min(FOCUS_MAX_BPS, math.isqrt(active[E] * 10 ** 8 // supply)) if supply > 0 else 0
            rec = ix.epochs.get(E)
            if rec is not None and rec.get('focus_bps') is not None:
                bps.append(int(rec['focus_bps']))
                src.append('record')
                if int(rec['focus_bps']) != calc:
                    mism.append(E)
            else:
                bps.append(calc)
                src.append('computed')
        self.snaps, self.active, self.bps, self.bps_src = snaps, active, bps, src
        self.sanity['focus_bps_mismatch'] = mism[-20:]
        self.sanity['focus_bps_checked'] = sum(1 for x in src if x == 'record')

    def bps_at(self, h):
        """the split in force for block h (h ≥ 1)."""
        e = (max(1, h) - 1) // self.L + 1
        return self.bps[e - 1] if e - 1 < len(self.bps) else self.bps[-1]

    def cut_at(self, h):
        return self.subsidy * self.bps_at(h) // 10_000

    # ------------------------------------------------------------------ earnings.json
    def miners(self, lo, hi):
        ix, work_of = self.ix, self.work_of
        agg, total_w, n = {}, 0, 0
        for h in range(max(1, lo), hi + 1):
            m = ix.miner[h]
            w = work_of(ix.bits[h])
            total_w += w
            if m < 0:
                continue
            n += 1
            a = agg.get(m)
            if a is None:
                a = agg[m] = [0, 0, 0, 0, h, h]
            a[0] += 1
            a[1] += w
            a[2] += self.subsidy - self.cut_at(h)
            a[3] += ix.fees[h]
            a[5] = h
        span = ix.t[hi] - ix.t[max(0, lo - 1)] if hi >= lo else 0
        hr = total_w / span if span > 0 else None
        rows = []
        for m, (b, w, sub, fee, first, last) in sorted(agg.items(), key=lambda kv: (-kv[1][0], -kv[1][1], kv[1][4]))[:TOP_MINERS]:
            ws = w / total_w if total_w else 0
            rows.append({'m': ix.miners[m], 'blocks': b, 'share': sig(b / n if n else 0, 5), 'work_share': sig(ws, 5), 'hr': sig(ws * hr) if hr else None,
                         'subsidy': str(sub), 'fees': str(fee), 'earned': str(sub + fee), 'first': first, 'first_t': ix.t[first], 'last': last, 'last_t': ix.t[last]})
        return {'from': max(1, lo), 'to': hi, 'blocks': n, 'miners': len(agg), 'hashrate': sig(hr), 'rows': rows,
                'earned': str(sum(a[2] + a[3] for a in agg.values()))}

    def write_blocks(self, now):
        ix = self.ix
        tip = len(ix.t) - 1
        key = (tip, ix.id_at(tip), len(ix.epochs), tuple(self.bps))
        if key == self.blocks_key:
            return
        L, sub = self.L, self.subsidy
        led, pool_ok, pool_bad = [], 0, []
        to_miners = fees_all = to_pool = paid_all = 0
        last_e = (tip - 1) // L + 1 if tip >= 1 else 0
        pre = [0]                                       # pre[e] = Σ cut over the blocks of epochs 1..e
        for e in range(1, last_e + 1):
            pre.append(pre[-1] + L * (sub * (self.bps[e - 1] if e - 1 < len(self.bps) else self.bps[-1]) // 10_000))

        def cut_upto(h):
            e = (h - 1) // L + 1
            return pre[e - 1] + (h - (e - 1) * L) * self.cut_at(h)
        for e in range(1, last_e + 1):
            lo, hi = (e - 1) * L + 1, min(e * L, tip)
            n = hi - lo + 1
            bps = self.bps[e - 1] if e - 1 < len(self.bps) else self.bps[-1]
            cut = sub * bps // 10_000
            fees = sum(ix.fees[lo:hi + 1])
            to_miners += n * (sub - cut)
            fees_all += fees
            to_pool += n * cut
            rec = ix.epochs.get(e)
            row = [e, n, bps, str(n * (sub - cut)), str(fees), str(n * cut), None, None, None, None, None, None, None, None]
            if e < len(self.active):
                supply = self.s0 + e * L * sub
                row[11] = self.bps[e]
                row[12] = str(self.active[e])
                row[13] = sig(self.active[e] / supply, 5) if supply else None
            if rec:
                row[6], row[7], row[8], row[9], row[10] = str(rec.get('budget', 0)), str(rec.get('paid', 0)), rec.get('rewarded', 0), str(rec.get('pool_after', 0)), str(rec.get('delta_syntropy', 0))
                paid_all += int(rec.get('paid') or 0)
                # the pool after settle(E) is Σ cut over blocks 1..settled_at − Σ paid through E (§6.3); check the record against it
                s_at = int(rec.get('settled_at') or (e * L + 120))
                if s_at <= tip:
                    pool_calc = cut_upto(s_at) - paid_all
                    if pool_calc == int(rec.get('pool_after') or 0):
                        pool_ok += 1
                    else:
                        pool_bad.append(e)
            led.append(row)
        pool_calc = to_pool - paid_all
        nh, np_ = self.pool_node or (None, None)
        self.sanity.update({'pool_after_checked': pool_ok, 'pool_after_mismatch': pool_bad[-20:],
                            'pool_now_calc': str(pool_calc), 'pool_now_node': str(np_) if nh == tip else None, 'pool_now_matches': (pool_calc == np_) if nh == tip else None})
        windows = {'hour': self.miners(ix.since(3600), tip), 'day': self.miners(ix.since(86400), tip), 'all': self.miners(1, tip)}
        cur_bps = self.bps_at(tip + 1)
        self.totals = {'to_miners': str(to_miners + fees_all), 'to_stakers': str(paid_all), 'pool': str(pool_calc), 'focus_bps_next': cur_bps, 'tip': tip}
        ix.write('earnings.json', {
            'version': 1, 'chain': ix.chain, 'generated': now, 'tip': tip, 'tip_time': ix.t[tip], 'subsidy': str(sub), 's0': str(self.s0),
            'epoch_length': L, 'pool_release': POOL_RELEASE, 'r_max_ppm': R_MAX_PPM, 'focus_max_bps': FOCUS_MAX_BPS, 'epochs_per_year': EPOCHS_PER_YEAR,
            'focus_bps_next': cur_bps, 'cut_next': str(sub * cur_bps // 10_000),
            'totals': {'minted': str(tip * sub), 'to_miners': str(to_miners + fees_all), 'miner_subsidy': str(to_miners), 'fees': str(fees_all),
                       'to_pool': str(to_pool), 'paid': str(paid_all), 'pool': str(pool_calc), 'epochs_settled': len(ix.epochs)},
            'cols': ['epoch', 'blocks', 'bps in force', 'to miners (subsidy)', 'fees', 'to pool', 'budget', 'paid', 'rewarded', 'pool after',
                     'delta syntropy', 'bps set at its boundary', 'active stake at its boundary', 'theta = active / supply at its boundary'],
            'ledger': led, 'miners': windows, 'sanity': self.sanity,
            'note': 'per block: miner = SUBSIDY − cut + fees, pool = cut = floor(SUBSIDY · bps / 10,000), bps fixed at the boundary before the block '
                    '(chain-economy §6.1–6.2); per settled epoch: budget = pool / 4, paid ≤ budget (§5.5). bps of a passed boundary whose epoch is not '
                    'settled yet is computed from the replayed active stake and the supply S0 + boundary · SUBSIDY, and checked against the record once it settles.'})
        self.blocks_key = key

    # ------------------------------------------------------------------ payouts.json
    def card_keys(self):
        """card id -> (author, p, q), from the indexer's map and, for the rest, the node's /card/<id>."""
        ix = self.ix
        out = {cid: tuple(k.split(':')) for k, cid in dict(ix.card_ids).items() if cid}
        for e in list(ix.epochs.values()):
            for p in e.get('payouts') or ():
                c = p['card']
                if c in out:
                    continue
                if c not in self.card_meta:
                    r = ix.node.get(f'/card/{c}', missing_ok=True)
                    if r:
                        self.card_meta[c] = (r['author'], r['p'], r['q'])
                if c in self.card_meta:
                    out[c] = self.card_meta[c]
        return out

    def write_payouts(self, cards, now):
        """cards: the indexer's replay (key -> position now)."""
        ix = self.ix
        last = max(ix.epochs) if ix.epochs else 0
        key = (last, len(ix.stx), len(ix.card_ids), len(self.snaps))
        if key == self.pay_key:
            return
        meta = self.card_keys()
        snaps = self.snaps
        pix, plist = {}, []

        def P(x):
            if x not in pix:
                pix[x] = len(plist)
                plist.append(x)
            return pix[x]

        def side(sv):
            return -1 if sv and sv[1] == -1 else 1

        receipts, by_card, by_link, by_q, epochs = [], {}, {}, {}, {}
        for E in sorted(ix.epochs):
            rec = ix.epochs[E]
            pays = rec.get('payouts') or ()
            if pays:
                epochs[E] = [str(rec.get('paid', 0)), str(rec.get('budget', 0)), rec.get('rewarded', 0), str(rec.get('delta_syntropy', 0)), rec.get('settled_at')]
            for p in pays:
                c, amt = p['card'], int(p['amount'])
                n, pp, qq = meta.get(c, (None, None, None))
                k = f'{n}:{pp}:{qq}' if n else None
                cur = snaps[E].get(k) if k and E < len(snaps) else None
                prev = snaps[E - 1].get(k) if k and 0 < E <= len(snaps) else None
                s_cur = cur[0] if cur else 0
                if prev and cur and side(prev) == side(cur):
                    added = s_cur - prev[0]
                else:
                    added = s_cur                               # a new card, or a side change: all of it is new on this side (§5.2)
                cap = max(0, added) * R_MAX_PPM // 1_000_000
                val = cur[1] if cur else (cards.get(k) or {}).get('valence')
                receipts.append([E, c, n, p['owner'], P(pp) if pp else None, P(qq) if qq else None, val, str(s_cur), str(added), str(cap), str(amt)])
                bc = by_card.setdefault(c, [0, 0, set()])
                bc[0] += amt
                bc[1] += 1
                bc[2].add(E)
                if pp:
                    bl = by_link.setdefault((pp, qq), [0, 0, set(), set()])
                    bl[0] += amt
                    bl[1] += 1
                    bl[2].add(c)
                    bl[3].add(E)
                    bq = by_q.setdefault(qq, [0, 0, set(), set()])
                    bq[0] += amt
                    bq[1] += 1
                    bq[2].add(c)
                    bq[3].add((pp, qq))
        receipts.reverse()
        # stake now per axon, from the replay
        ax_for, ax_ag = {}, {}
        for c in cards.values():
            if c['stake'] > 0:
                d = ax_ag if c['valence'] == -1 else ax_for
                d[(c['p'], c['q'])] = d.get((c['p'], c['q']), 0) + c['stake']
        links = [[P(p), P(q), str(v[0]), v[1], len(v[2]), len(v[3]), str(ax_for.get((p, q), 0)), str(ax_ag.get((p, q), 0))]
                 for (p, q), v in sorted(by_link.items(), key=lambda kv: -kv[1][0])[:TOP_ROWS]]
        parts = [[P(q), str(v[0]), v[1], len(v[2]), len(v[3])] for q, v in sorted(by_q.items(), key=lambda kv: -kv[1][0])[:TOP_ROWS]]
        # positions: stake held at every settled boundary, earned, yield per unit of stake per epoch held
        cid_of = dict(ix.card_ids)
        pos, neurons = [], {}
        for k, c in cards.items():
            card = cid_of.get(k)
            held = se = 0
            first = None
            for E in range(1, min(last, len(snaps) - 1) + 1):
                sv = snaps[E].get(k)
                if sv:
                    held += 1
                    se += sv[0]
                    first = first or E
            earned, npaid, eps = by_card.get(card, [0, 0, set()]) if card else (0, 0, set())
            y = earned / se if se else None
            pos.append({'card': card, 'n': c['neuron'], 'owner': c['owner'], 'p': P(c['p']), 'q': P(c['q']), 'v': c['valence'], 'stake': str(c['stake']), 'open': c['stake'] > 0,
                        'earned': str(earned), 'paid': len(eps), 'last_paid': max(eps) if eps else None, 'held': held, 'first': first, 'se': str(se),
                        'y': sig(y, 5), 'apr': sig(y * EPOCHS_PER_YEAR, 4) if y is not None else None})
            a = neurons.setdefault(c['neuron'], {'n': c['neuron'], 'earned': 0, 'positions': 0, 'open': 0, 'sa': 0, 'sp': 0, 'se': 0, 'eps': set(), 'owners': set(), 'last': None})
            a['earned'] += earned
            a['positions'] += 1
            a['open'] += 1 if c['stake'] > 0 else 0
            a['sa' if c['valence'] != 0 else 'sp'] += c['stake']
            a['se'] += se
            a['eps'] |= eps
            if c['owner'] != c['neuron']:
                a['owners'].add(c['owner'])
        # payouts to cards the replay does not hold (should be none): count them on their author
        held_ids = {cid_of.get(k) for k in cards}
        for c, (earned, npaid, eps) in by_card.items():
            if c in held_ids:
                continue
            n = meta.get(c, (None,))[0]
            if n:
                a = neurons.setdefault(n, {'n': n, 'earned': 0, 'positions': 0, 'open': 0, 'sa': 0, 'sp': 0, 'se': 0, 'eps': set(), 'owners': set(), 'last': None})
                a['earned'] += earned
                a['eps'] |= eps
        nrows = []
        for a in neurons.values():
            y = a['earned'] / a['se'] if a['se'] else None
            nrows.append({'n': a['n'], 'earned': str(a['earned']), 'positions': a['positions'], 'open': a['open'], 'sa': str(a['sa']), 'sp': str(a['sp']), 'se': str(a['se']),
                          'paid': len(a['eps']), 'last_paid': max(a['eps']) if a['eps'] else None, 'owners': len(a['owners']),
                          'y': sig(y, 5), 'apr': sig(y * EPOCHS_PER_YEAR, 4) if y is not None else None})
        nrows.sort(key=lambda r: (-int(r['earned']), -(int(r['sa']) + int(r['sp'])), r['n']))
        pos.sort(key=lambda r: (-int(r['earned']), -int(r['stake']), r['card'] or ''))
        ix.write('payouts.json', {
            'version': 1, 'chain': ix.chain, 'generated': now, 'tip': len(ix.t) - 1, 'last_settled': last, 'epoch_length': self.L,
            'r_max_ppm': R_MAX_PPM, 'epochs_per_year': EPOCHS_PER_YEAR, 'scale_bits': 60,
            'credit_exposed': False,
            'note': 'receipts: [epoch, card, author neuron, payout owner, p, q (indexes into particles), valence, the card\'s stake at the epoch\'s boundary, '
                    'stake it added on its side since the boundary before (§5.2), its cap = floor(added · 10,000 / 10^6) (§5.5), amount paid], newest first. '
                    'the node publishes {card, owner, amount} per payout and no per-position credit or attribution; stake, added and cap are replayed from '
                    'the staking signals. epochs: {epoch: [paid, budget, rewarded, delta syntropy (raw, 2^60 nats), settled at]}. links: [p, q, Σ paid, payouts, '
                    'positions, epochs, stake for now, stake against now]; particles (paid to make attended, Σ over positions on axons into q): [q, Σ paid, '
                    'payouts, positions, axons]. yield y = earned ÷ Σ stake held at each settled boundary (se), apr = y · 4,380 epochs a year (simple).',
            'particles': plist, 'epochs': epochs, 'receipts': receipts[:RECEIPTS], 'receipts_total': len(receipts),
            'links': links, 'paid_particles': parts, 'stakers': nrows[:1000], 'positions': pos[:2000],
            'positions_total': len(pos), 'earned_total': str(sum(v[0] for v in by_card.values()))})
        self.pay_key = key


def payout_keys(ix):
    """card id -> (author, p, q) without node calls, for the focus thread."""
    return {cid: tuple(k.split(':')) for k, cid in dict(ix.card_ids).items() if cid}
