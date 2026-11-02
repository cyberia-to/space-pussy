"""PageRank (d=0.85) over the genesis cyberlinks; used to pick top particles before /focus was computed.
usage: rank.py links.tsv particles.tsv OUT_TSV"""
import csv, sys, collections, json
links = list(csv.reader(open(sys.argv[1]), delimiter="\t"))[1:]
p2c = {r[0]: r[1] for r in list(csv.reader(open(sys.argv[2]), delimiter="\t"))[1:]}
nodes = sorted({x for r in links for x in (r[1], r[2])}); idx = {n: i for i, n in enumerate(nodes)}; N = len(nodes)
out = collections.defaultdict(list); indeg = collections.Counter(); outdeg = collections.Counter(); neurons = collections.defaultdict(set)
for r in links:
    a, b = idx[r[1]], idx[r[2]]; out[a].append(b); indeg[b] += 1; outdeg[a] += 1; neurons[b].add(r[0])
pr = [1.0 / N] * N; d = 0.85
for it in range(100):
    nxt = [(1 - d) / N] * N; dang = sum(pr[i] for i in range(N) if i not in out)
    for i, outs in out.items():
        s = d * pr[i] / len(outs)
        for j in outs: nxt[j] += s
    for j in range(N): nxt[j] += d * dang / N
    delta = sum(abs(x - y) for x, y in zip(nxt, pr)); pr = nxt
    if delta < 1e-12: break
order = sorted(range(N), key=lambda i: -pr[i])
with open(sys.argv[3], "w") as f:
    f.write("rank\tparticle\tcid\tpagerank\tin_links\tout_links\tin_neurons\n")
    for k, i in enumerate(order, 1):
        n = nodes[i]; f.write(f"{k}\t{n}\t{p2c.get(n,'-')}\t{pr[i]:.6e}\t{indeg[i]}\t{outdeg[i]}\t{len(neurons[i])}\n")
print("nodes", N, "links", len(links), "iterations", it + 1, "delta", delta)
