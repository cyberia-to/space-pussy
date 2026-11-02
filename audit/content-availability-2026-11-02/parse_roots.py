"""decode the dag-cbor root of every Filecoin particle pack into the archived particle list.
usage: parse_roots.py ROOTS_DIR particles-ledger.jsonl OUT_TSV   (OUT: legacy CID <TAB> pack)"""
import sys, os, glob, json
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
def b58(b):
    n = int.from_bytes(b, "big"); s = ""
    while n: n, r = divmod(n, 58); s = B58[r] + s
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + s
import base64
def cidstr(b):
    if len(b) == 34 and b[:2] == b"\x12\x20": return b58(b)
    return "b" + base64.b32encode(b).decode().lower().rstrip("=")
class R:
    def __init__(s, d): s.d, s.i = d, 0
    def head(s):
        ib = s.d[s.i]; s.i += 1; mt, ai = ib >> 5, ib & 31
        if ai < 24: v = ai
        else:
            n = {24:1,25:2,26:4,27:8}[ai]; v = int.from_bytes(s.d[s.i:s.i+n], "big"); s.i += n
        return mt, v
    def item(s):
        mt, v = s.head()
        if mt == 0: return v
        if mt == 2: b = s.d[s.i:s.i+v]; s.i += v; return b
        if mt == 3: b = s.d[s.i:s.i+v]; s.i += v; return b.decode()
        if mt == 4: return [s.item() for _ in range(v)]
        if mt == 5: return {s.item(): s.item() for _ in range(v)}
        if mt == 6:
            x = s.item(); return ("tag", v, x)
        if mt == 7 and v == 22: return None
        raise ValueError(mt)
ledger = {json.loads(l)["pack"]: json.loads(l) for l in open(sys.argv[2])}
out = open(sys.argv[3], "w"); total = 0; bad = 0
for p in sorted(glob.glob(os.path.join(sys.argv[1], "pack*.cbor"))):
    m = R(open(p, "rb").read()).item()
    L = ledger[m["pack"]]
    m["particles"] = m["particles"] or []
    if m["first"] != L["first"] or len(m["particles"]) != L["particles"]: bad += 1; print("MISMATCH", p)
    for t in m["particles"]:
        assert t[0] == "tag" and t[1] == 42 and t[2][0] == 0
        out.write(f"{cidstr(t[2][1:])}\t{m['pack']}\n"); total += 1
print("packs", len(glob.glob(os.path.join(sys.argv[1], "pack*.cbor"))), "particles", total, "mismatch", bad)
