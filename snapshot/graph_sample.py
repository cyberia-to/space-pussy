#!/usr/bin/env python3
"""sample a drawable subgraph from a cyberlinks csv for the deck's background (site/graph.json).
the recipe of cyber/landing/graph.json, with the link cap and layout tuned for the cat's hub-heavy graph.
    python3 snapshot/graph_sample.py cyberlinks_indexed.csv.gz site/graph.json space-pussy
needs numpy."""
import csv, gzip, json, sys, collections, math
import numpy as np
src, out, chain = sys.argv[1], sys.argv[2], sys.argv[3]
deg = collections.Counter(); rows = []
with gzip.open(src, 'rt') as f:
    r = csv.DictReader(f)
    for row in r:
        a, b = row['particle_from'], row['particle_to']
        rows.append((a, b, row['neuron'])); deg[a] += 1; deg[b] += 1
particles = len(deg); links_total = len(rows)
NH, NR = 400, 800
hub = [p for p, _ in deg.most_common(NH)]; hs = set(hub)
into = collections.Counter()
for a, b, _ in rows:
    if a in hs and b not in hs: into[b] += 1
    if b in hs and a not in hs: into[a] += 1
rest = [p for p, _ in into.most_common(NR)]
nodes = hub + rest
if len(nodes) < NH + NR:  # small graphs: fill with the next by degree
    for p, _ in deg.most_common():
        if len(nodes) >= NH + NR: break
        if p not in set(nodes): nodes.append(p)
idx = {p: i for i, p in enumerate(nodes)}
w = collections.defaultdict(set)
for a, b, n in rows:
    if a in idx and b in idx and a != b:
        i, j = sorted((idx[a], idx[b])); w[(i, j)].add(n)
pairs = {k: len(v) for k, v in w.items()}
n = len(nodes)
# each node's heaviest link first, then fill by (weight, degree-sum) up to 6000
best = {}
for (i, j), wt in pairs.items():
    for k in (i, j):
        if k not in best or pairs[best[k]] < wt: best[k] = (i, j)
chosen = set(best.values())
for (i, j), wt in sorted(pairs.items(), key=lambda kv: (-kv[1], -(deg[nodes[kv[0][0]]] + deg[nodes[kv[0][1]]]))):
    if len(chosen) >= 2400: break
    chosen.add((i, j))
links = sorted(chosen)
linked = sorted({i for e in links for i in e}); L = len(linked); lpos = {v: k for k, v in enumerate(linked)}
# layout: spectral init + force iterations on the linked subgraph
A = np.zeros((L, L))
for i, j in links: A[lpos[i], lpos[j]] = A[lpos[j], lpos[i]] = math.log1p(pairs[(i, j)])
d = A.sum(1); Dm = np.diag(1 / np.sqrt(np.maximum(d, 1e-9))); Lap = np.eye(L) - Dm @ A @ Dm
rng = np.random.default_rng(7); P = rng.normal(size=(L, 2))
dg = A.astype(bool).sum(1).astype(float)
for it in range(400):
    diff = P[:, None, :] - P[None, :, :]; dist = np.sqrt((diff ** 2).sum(-1)) + 1e-6
    rep = ((dg[:, None] + 1) * (dg[None, :] + 1) / dist ** 2)[:, :, None] * diff
    rep = rep.sum(1) * 0.06
    att = -(np.sqrt(A)[:, :, None] * diff).sum(1) * 0.05
    grav = -0.5 * (dg + 1)[:, None] * P * 0.02
    step = (rep + att + grav); norm = np.sqrt((step ** 2).sum(1))[:, None] + 1e-9
    cool = 1 - it / 400; P += step / norm * np.minimum(norm, 0.3 * cool)
lo, hi = np.percentile(P, 1.5, 0), np.percentile(P, 98.5, 0); P = np.clip((P - lo) / (hi - lo + 1e-9), 0, 1) * 0.76 + 0.12
outn = []
iso = [i for i in range(n) if i not in lpos]
for i, p in enumerate(nodes):
    if i in lpos: x, y = P[lpos[i]]
    else:
        k = iso.index(i); ang = 2 * math.pi * k / max(1, len(iso)); r = 0.47 + 0.02 * math.sin(k * 7.3)
        x, y = 0.5 + r * math.cos(ang), 0.5 + r * math.sin(ang)
    outn.append([p[:10], deg[p], round(float(x), 4), round(float(y), 4)])
meta = {"source": f"{chain} snapshot cyberlinks_indexed.csv.gz", "fields": ["particle_from", "particle_to", "neuron", "height", "timestamp", "transaction_hash"], "particles_total": particles, "links_total": links_total, "sampled_particles": n, "sampled_links": len(links), "linked_particles": L, "isolated_particles": n - L, "method": "nodes = top 400 particles by degree plus the 800 particles with most cyberlinks into that hub set (filled by degree on small graphs); links = cyberlinks with both ends in the sample, merged to unordered pairs, weight = distinct neurons, each node's heaviest link first then by (weight, degree-sum) up to 2400; layout = random init + 400 force iterations (repulsion (di+1)(dj+1)/d², attraction sqrt(w), gravity) scaled by the 1.5-98.5 percentile box into the central 0.76 box; unlinked nodes on a halo ring; node = [cid[:10], degree, x, y]; link = [i, j]"}
json.dump({"meta": meta, "nodes": outn, "links": [list(e) for e in links]}, open(out, 'w'), separators=(',', ':'))
print(particles, links_total, n, len(links), L)
