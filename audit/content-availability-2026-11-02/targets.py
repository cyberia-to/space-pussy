"""probe targets: 600 random particles held in the Filecoin archive (seed 20261102) + every particle not in the ledger's pack manifests.
usage: targets.py EXPORT CACHE  (EXPORT = `soft3 genesis build --export` dir; CACHE holds filecoin-particles.tsv, gets targets.tsv)"""
import csv, os, random, sys
exp, cache = sys.argv[1:3]
fc = set(l.split("\t", 1)[0] for l in open(os.path.join(cache, "filecoin-particles.tsv")))
cids = [r[1] for r in list(csv.reader(open(os.path.join(exp, "particles.tsv")), delimiter="\t"))[1:]]
A = sorted(c for c in cids if c in fc); N = sorted(c for c in cids if c not in fc)
random.seed(20261102); S = random.sample(A, 600)
with open(os.path.join(cache, "targets.tsv"), "w") as f:
    for c in S: f.write(f"{c}\tarchive-sample\n")
    for c in N: f.write(f"{c}\tnot-archive\n")
print(len(S), len(N))
