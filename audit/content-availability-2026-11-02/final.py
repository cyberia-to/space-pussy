"""classify pussy genesis particles by where their bytes are.
usage: final.py CACHE EXPORT APPARATUS BOSTROM_SNAP OUT_TSV
CACHE: probe results + filecoin-particles.tsv + focus-epoch13.json + heads/; EXPORT: `soft3 genesis build --export` dir;
APPARATUS: apparatus checkout; BOSTROM_SNAP: dir with bostrom cyberlinks_indexed.csv.gz + missing_particles.txt.gz"""
import csv, json, sys, os, collections
D, EXP, APP, BSNAP, OUT = [os.path.join(a, '') for a in sys.argv[1:5]] + [sys.argv[5]]
fc = set(l.split("\t",1)[0] for l in open(D+'filecoin-particles.tsv'))
extra = set(l.strip() for l in open(APP+'audit/filecoin/new-pins-2026-10-27.txt') if l.strip())
parts = list(csv.reader(open(EXP+'particles.tsv'), delimiter='\t'))[1:]
links = list(csv.reader(open(EXP+'links.tsv'), delimiter='\t'))[1:]
tset = dict(l.rstrip("\n").split("\t") for l in open(D+'targets.tsv'))
res = collections.defaultdict(lambda: collections.defaultdict(list))
for f in [x for x in ('probe.jsonl', 'probe-top.jsonl', 'probe-phi.jsonl', 'pub.jsonl', 'retry.jsonl') if os.path.exists(D+x)]:
    for l in open(D+f):
        r = json.loads(l); res[r['cid']][r['host']].append(r)
PUB = ('pinata', 'filebase', 'ipfs-lens')
def ok(c, h): return any(r.get('ok') for r in res[c].get(h, []))
def best(c):
    for h in ('ours',) + PUB:
        for r in res[c].get(h, []):
            if r.get('ok'): return r
def others(c): return max([r.get('others', 0) for r in res[c].get('routing', []) if r.get('ok')] or [0])
def routed(c): return any(r.get('ok') for r in res[c].get('routing', []))
cls = {}
for p, c in parts:
    if c in fc or c in extra: cls[c] = 'archive'
    elif ok(c, 'ours'): cls[c] = 'gateway'
    elif any(ok(c, h) for h in PUB): cls[c] = 'public'
    elif others(c): cls[c] = 'announced'
    else: cls[c] = 'lost'
C = collections.Counter(cls.values()); N = len(parts)
print("## classes", N, {k: (v, round(100*v/N, 2)) for k, v in C.items()})
print("archive: ledger", sum(c in fc for _, c in parts), "new-pins", sum(c in extra for _, c in parts))
# probe coverage per set and host
cov = collections.defaultdict(collections.Counter)
for c, s in tset.items():
    if c in extra: s = 'new-pins'
    for h in ('ours',) + PUB:
        rs = res[c].get(h, [])
        if rs: cov[(s, h)]['ok' if ok(c, h) else ('429' if all(r.get('status') == 429 for r in rs) else 'fail')] += 1
    if routed(c): cov[(s, 'routing')]['others>0' if others(c) else 'only-ours-or-none'] += 1
for k in sorted(cov): print("cov", k, dict(cov[k]))
# kinds & sizes per class (retrieved)
kinds = collections.defaultdict(collections.Counter); sizes = collections.defaultdict(list)
for c, s in tset.items():
    b = best(c)
    if b:
        g = 'archive-sample' if s == 'archive-sample' else cls[c]
        kinds[g][b['kind'].split(':')[0]] += 1; sizes[g].append(b.get('size') or 0)
for g in kinds:
    z = sorted(sizes[g]); print("kinds", g, dict(kinds[g]), "n", len(z), "sum", sum(z), "median", z[len(z)//2], "mean", round(sum(z)/len(z)), "max", z[-1])
# non-archived split by bostrom audit
import gzip
bp = set(); miss = set()
with gzip.open(BSNAP+'cyberlinks_indexed.csv.gz', 'rt') as f:
    r = csv.reader(f); next(r)
    for row in r: bp.update(row[:2])
for l in gzip.open(BSNAP+'missing_particles.txt.gz', 'rt'):
    l = l.strip()
    if len(l) == 92: miss.update([l[:46], l[46:]])
    elif l: miss.add(l)
x = collections.Counter()
for _, c in parts:
    tag = 'pussy-only' if c not in bp else ('bostrom-missing' if c in miss else 'io-flatfs-2026-08-28')
    x[(cls[c], tag)] += 1
print("xtab", sorted(x.items()))
# per-neuron link weight of classes: share of cyberlinks whose both ends have bytes
p2c = {p: c for p, c in parts}
def have(pp): c = p2c.get(pp); return c is not None and cls[c] in ('archive', 'gateway', 'public')
L = [r for r in links if r[5] != '-']
print("links", len(L), "both ends held/reachable", sum(have(r[1]) and have(r[2]) for r in L))
# focus table (alpha node, /focus?top=N, capped at 1000)
F = json.load(open(D+'focus-epoch13.json')); S = 2**F['scale_bits']
w = collections.Counter(); tot = 0
for e in F['top']:
    c = p2c.get(e['particle']); k = cls.get(c, 'no-cid') if c else 'no-cid'; w[k] += e['phi']; tot += e['phi']
print("phi top1000 share of all phi", round(tot / S * 100, 2), {k: round(v / S * 100, 2) for k, v in w.items()})
w50 = collections.Counter()
top = []
for i, e in enumerate(F['top'][:50], 1):
    c = p2c.get(e['particle'], '-'); b = best(c) if c != '-' else None
    head = ''
    if b and b['kind'] == 'text':
        try: head = open(D+'heads/'+c, 'rb').read()[:40].decode('utf-8', 'replace').replace('\n', ' ').replace('|', '/').replace('\r', ' ').strip()
        except Exception: pass
    k = cls.get(c, 'no-cid'); w50[k] += e['phi']
    top.append(dict(rank=i, particle=e['particle'], cid=c, phi=e['phi'] / S, cls=k, kind=(b or {}).get('kind', '-').split(':')[0], size=(b or {}).get('size'), head=head, verified=bool(b)))
print("top50 classes", collections.Counter(t['cls'] for t in top), "bytes retrieved now", sum(t['verified'] for t in top), "phi share", {k: round(v / S * 100, 2) for k, v in w50.items()})
json.dump(top, open(D+'top50.json', 'w'), indent=0)
# mapping file
out = OUT
with open(out, 'w') as f:
    f.write("particle\tcid\tclass\tkind\tbytes\n")
    for p, c in sorted(parts):
        b = best(c); f.write(f"{p}\t{c}\t{cls[c]}\t{(b['kind'].split(':')[0]) if b else '-'}\t{(b.get('size') if b and b.get('size') is not None else '-')}\n")
    for p in sorted({x for r in links for x in (r[1], r[2])} - set(p2c)):
        f.write(f"{p}\t-\tno-cid\t-\t-\n")
print("wrote", out, os.path.getsize(out))
# rescue sets
pub = [c for c in cls if cls[c] == 'public']; ann = [c for c in cls if cls[c] == 'announced']
print("public bytes", sum((best(c) or {}).get('size') or 0 for c in pub), "announced n", len(ann))
open(D+'rescue-public.txt', 'w').write("\n".join(sorted(pub)) + "\n"); open(D+'rescue-announced.txt', 'w').write("\n".join(sorted(ann)) + "\n")
