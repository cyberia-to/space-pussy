"""fetch the dag-cbor root (pack manifest) of every row of the particle ledger from the two PDP providers.
usage: fetch_roots.py particles-ledger.jsonl ROOTS_DIR"""
import json, sys, os, urllib.request, concurrent.futures as cf, hashlib
ledger, outdir = sys.argv[1], sys.argv[2]
rows = [json.loads(l) for l in open(ledger)]
def get(r):
    p = os.path.join(outdir, f"pack{r['pack']:03d}.cbor")
    if os.path.exists(p) and os.path.getsize(p) > 0: return r['pack'], 'cached', os.path.getsize(p)
    for host in ("https://main.ezpdpz.net", "https://pdp.lotus.dedyn.io"):
        try:
            req = urllib.request.Request(f"{host}/ipfs/{r['root']}", headers={"Accept": "application/vnd.ipld.raw"})
            b = urllib.request.urlopen(req, timeout=120).read()
            open(p, "wb").write(b); return r['pack'], host, len(b)
        except Exception as e:
            err = repr(e)
    return r['pack'], 'FAIL ' + err, 0
with cf.ThreadPoolExecutor(6) as ex:
    for res in ex.map(get, rows): print(*res, flush=True)
