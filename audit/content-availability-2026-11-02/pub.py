"""staged public-gateway pass with rate limits and 429 backoff.
usage: pub.py targets.tsv out.jsonl heads_dir"""
import sys, os, json, time, threading, concurrent.futures as cf
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "probe.py")).read().split("def write(r):")[0]
exec(compile(src, "probe.py", "exec"))   # defines fetch, sniff, HOSTS; targets/out/done from argv
class Bucket:
    def __init__(s, rate): s.gap, s.next, s.l = 1.0 / rate, time.time(), threading.Lock()
    def take(s):
        with s.l:
            now = time.time(); w = max(0, s.next - now); s.next = max(now, s.next) + s.gap
        time.sleep(w)
def run(name, cids, rate, conc):
    b = Bucket(rate)
    def one(c):
        for attempt in range(5):
            b.take(); r = fetch(c, name)
            if r.get("status") != 429: break
            time.sleep(10 * (attempt + 1))
        r["attempts"] = attempt + 1
        with lock: out.write(json.dumps(r) + "\n"); out.flush()
        return r
    with cf.ThreadPoolExecutor(conc) as ex: res = list(ex.map(one, cids))
    ok = {r["cid"] for r in res if r.get("ok")}
    print(name, "tried", len(cids), "ok", len(ok), "429", sum(r.get("status") == 429 for r in res), flush=True)
    return ok
allc = [c for c, s in targets]
def lane2(name, rate, conc):
    run(name, [c for c in allc if (c, name) not in done], rate, conc)
ths = [threading.Thread(target=lane2, args=a) for a in (("filebase", 2, 8), ("ipfs-lens", 8, 8), ("pinata", 1, 8))]
for t in ths: t.start()
for t in ths: t.join()
print("still failing: all lanes done", flush=True)
