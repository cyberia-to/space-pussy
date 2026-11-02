"""probe particles over HTTP gateways (ours via --connect-to to the edge, three public ones) and IPNI routing. python stdlib only. LANES=ours,routing,... selects lanes.
usage: probe.py targets.tsv out.jsonl heads_dir
targets.tsv: cid<TAB>set  (set = archive-sample | not-archive)"""
import sys, os, json, ssl, socket, http.client, threading, time, concurrent.futures as cf
targets = [l.rstrip("\n").split("\t") for l in open(sys.argv[1]) if l.strip()]
out_path, heads = sys.argv[2], sys.argv[3]
os.makedirs(heads, exist_ok=True)
done = set()
if os.path.exists(out_path):
    for l in open(out_path):
        r = json.loads(l); done.add((r["cid"], r["host"]))
lock = threading.Lock(); out = open(out_path, "a")
CTX = ssl.create_default_context()
OURS = ("gateway.ipfs.cybernode.ai", "213.58.173.242")
HOSTS = {"ours": OURS, "pinata": ("gateway.pinata.cloud", None), "filebase": ("ipfs.filebase.io", None), "ipfs-lens": ("gw.ipfs-lens.dev", None)}
OUR_PEERS = {"12D3KooWDLfjhv9nu5kuzL2rPucZgkkCFpRCSQT6dvQZdGmZHbPd", "12D3KooWBpfaQbxwGfz6bpuWGK47tX3XvXGX1rkNkyX93a4kxFxU"}
class Conn(http.client.HTTPSConnection):
    def __init__(self, host, ip, timeout):
        super().__init__(host, 443, timeout=timeout, context=CTX); self.ip = ip
    def connect(self):
        s = socket.create_connection((self.ip or self.host, 443), self.timeout)
        self.sock = self._context.wrap_socket(s, server_hostname=self.host)
def sniff(b, ct):
    h = b[:16]
    if h.startswith(b"\x89PNG"): return "image/png"
    if h.startswith(b"\xff\xd8\xff"): return "image/jpeg"
    if h[:6] in (b"GIF87a", b"GIF89a"): return "image/gif"
    if h.startswith(b"RIFF") and b[8:12] == b"WEBP": return "image/webp"
    if h.startswith(b"%PDF"): return "pdf"
    if h[4:8] == b"ftyp": return "video/mp4"
    if h.startswith(b"\x1aE\xdf\xa3"): return "video/webm"
    if h.startswith(b"ID3") or h[:2] == b"\xff\xfb": return "audio/mpeg"
    if h.startswith(b"PK\x03\x04"): return "zip"
    if h.startswith(b"\x1f\x8b"): return "gzip"
    if h.startswith(b"\x00asm"): return "wasm"
    s = b[:4096].lstrip()
    low = s[:400].lower()
    if low.startswith(b"<svg") or (low.startswith(b"<?xml") and b"<svg" in low): return "image/svg"
    if low.startswith(b"<!doctype html") or low.startswith(b"<html") or b"<head" in low: 
        return "directory" if (ct or "").startswith("text/html") and b"index of" in b[:4096].lower() else "html"
    if s[:1] in (b"{", b"["):
        try: json.loads(b.decode()); return "json"
        except Exception: pass
    try:
        b[:4000].decode("utf-8"); return "text"
    except UnicodeDecodeError as e:
        if e.start > 3990: return "text"
    return "binary:" + (ct or "?")
def fetch(cid, name):
    host, ip = HOSTS[name]; t0 = time.time()
    r = {"cid": cid, "host": name}
    try:
        c = Conn(host, ip, int(os.environ.get("TIMEOUT", "15")))
        c.request("GET", f"/ipfs/{cid}", headers={"Range": "bytes=0-4095", "User-Agent": "cyber-pussy-content-audit/2026-11-02"})
        resp = c.getresponse(); r["status"] = resp.status
        if resp.status in (200, 206):
            b = resp.read(4096); cr = resp.getheader("Content-Range"); cl = resp.getheader("Content-Length")
            size = int(cr.rsplit("/", 1)[1]) if cr and cr.rsplit("/", 1)[1].isdigit() else (int(cl) if (cl and resp.status == 200) else None)
            ct = resp.getheader("Content-Type"); r.update(ok=True, size=size, ctype=ct, kind=sniff(b, ct), got=len(b))
            p = os.path.join(heads, cid)
            if not os.path.exists(p): open(p, "wb").write(b)
        else:
            r["ok"] = False; resp.read(2048)
        c.close()
    except Exception as e:
        r.update(ok=False, err=type(e).__name__)
    r["t"] = round(time.time() - t0, 2); return r
def route(cid):
    t0 = time.time(); r = {"cid": cid, "host": "routing"}
    try:
        c = Conn("delegated-ipfs.dev", None, 15)
        c.request("GET", f"/routing/v1/providers/{cid}", headers={"Accept": "application/json"})
        resp = c.getresponse(); r["status"] = resp.status; body = resp.read()
        provs = json.loads(body).get("Providers") or [] if resp.status == 200 else []
        ids = [p.get("ID") for p in provs]
        r.update(ok=True, providers=len(ids), ours=sum(i in OUR_PEERS for i in ids), others=sum(i not in OUR_PEERS for i in ids))
    except Exception as e:
        r.update(ok=False, err=type(e).__name__)
    r["t"] = round(time.time() - t0, 2); return r
def write(r):
    with lock: out.write(json.dumps(r) + "\n"); out.flush()
def lane(name):
    fn = route if name == "routing" else (lambda c: fetch(c, name))
    todo = [c for c, _ in targets if (c, name) not in done]
    with cf.ThreadPoolExecutor(8) as ex:
        for r in ex.map(fn, todo): write(r)
    print("lane done", name, len(todo), flush=True)
LANES = os.environ.get("LANES", ",".join(list(HOSTS) + ["routing"])).split(",")
ths = [threading.Thread(target=lane, args=(n,)) for n in LANES]
for t in ths: t.start()
for t in ths: t.join()
