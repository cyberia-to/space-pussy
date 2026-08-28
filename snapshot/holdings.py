#!/usr/bin/env python3
# space-pussy holdings: liquid + delegated + per-pool decomposition + pussy rates.
import json, csv, hashlib, urllib.request

OUT = "/archive/snapshot-pussy/pub"
LCD = "http://jupiter.cybernode.ai:46317"

# ibc labels from live denom traces
IBC = {}
d = json.load(urllib.request.urlopen(LCD + "/ibc/apps/transfer/v1/denom_traces?pagination.limit=500", timeout=30))
for t in d["denom_traces"]:
    h = "ibc/" + hashlib.sha256((t["path"] + "/" + t["base_denom"]).encode()).hexdigest().upper()
    IBC[h] = t["base_denom"]

def clean(base):
    m = {"pussy": "PUSSY", "liquidpussy": "LP", "boot": "BOOT", "hydrogen": "H",
         "milliampere": "A", "millivolt": "V", "tocyb": "TOCYB"}
    if base in m: return m[base]
    if base.startswith("u") and base[1:].isalpha(): return base[1:].upper()
    return base[:10]

def label(d):
    core = {"pussy": "PUSSY", "liquidpussy": "LP", "milliampere": "A", "millivolt": "V"}
    if d in core: return core[d]
    if d in IBC: return clean(IBC[d])
    if d.startswith("ibc/"): return "ibc:" + d[4:10]
    return d[:12]

liquid = {}
for r in csv.DictReader(open(f"{OUT}/balances.csv")):
    liquid.setdefault(r["address"], {})[r["denom"]] = int(r["amount"])

pools = {}
for p in json.load(open(f"{OUT}/pools.json")):
    pools[p["pool_coin_denom"]] = {
        "id": p["id"], "denoms": p["denoms"],
        "reserves": {k: int(v) for k, v in p["reserves"].items()},
        "supply": int(p["pool_coin_supply"])}

delegated = {}
for r in csv.DictReader(open(f"{OUT}/delegations.csv")):
    delegated[r["delegator"]] = delegated.get(r["delegator"], 0) + int(r["pussy"])

MIN_RESERVE = 1_000_000
def pool_rate(p, want, other):
    rw, ro = p["reserves"].get(want, 0), p["reserves"].get(other, 0)
    if rw < MIN_RESERVE or ro < MIN_RESERVE: return None
    return rw / ro

rates = {"pussy": 1.0}
lp_rate = None
for p in pools.values():
    if set(p["denoms"]) == {"pussy", "liquidpussy"}:
        lp_rate = pool_rate(p, "pussy", "liquidpussy")
rates["liquidpussy"] = lp_rate or 0.0
for p in pools.values():
    ds = p["denoms"]
    if "pussy" in ds:
        other = ds[0] if ds[1] == "pussy" else ds[1]
        rates.setdefault(other, pool_rate(p, "pussy", other) or 0.0)
for p in pools.values():
    ds = p["denoms"]
    if "liquidpussy" in ds and lp_rate:
        other = ds[0] if ds[1] == "liquidpussy" else ds[1]
        r = pool_rate(p, "liquidpussy", other)
        if r is not None:
            rates.setdefault(other, r * lp_rate)

json.dump({
    "note": "1 micro-unit of denom valued in micro-pussy, from snapshot pool reserves; liquidpussy-routed when no direct pussy pool",
    "pools": {p["id"]: {"denoms": p["denoms"], "labels": [label(d) for d in p["denoms"]]}
              for p in pools.values()},
    "rates": rates,
    "labels": {d: label(d) for d in rates},
}, open(f"{OUT}/prices.json", "w"), indent=1)
print("prices:", len(rates))

out = open(f"{OUT}/holdings.jsonl", "w")
n = 0
for addr in set(liquid) | set(delegated):
    lq = liquid.get(addr, {})
    tokens = {}
    def bucket(dn):
        return tokens.setdefault(dn, {"liquid": 0, "delegated": 0, "undelegating": 0, "pools": {}})
    for dn, amt in lq.items():
        if dn in pools:
            p = pools[dn]
            if p["supply"]:
                for rd, rv in p["reserves"].items():
                    bp = bucket(rd)["pools"]
                    bp[p["id"]] = bp.get(p["id"], 0) + amt * rv // p["supply"]
        else:
            bucket(dn)["liquid"] += amt
    if delegated.get(addr): bucket("pussy")["delegated"] += delegated[addr]
    rec = {}
    for dn, b in tokens.items():
        tot = b["liquid"] + b["delegated"] + b["undelegating"] + sum(b["pools"].values())
        if tot > 0:
            rec[dn] = {"label": label(dn), **b, "total": tot}
    if rec:
        out.write(json.dumps({"address": addr, "holdings": rec}, separators=(",", ":")) + "\n"); n += 1
out.close()
print("holdings:", n)

own = {}
for line in open(f"{OUT}/passports.jsonl"):
    p = json.loads(line)
    o = p.get("owner"); nick = (p.get("extension") or {}).get("nickname") or p.get("nickname")
    if o and nick: own.setdefault(o, []).append(nick)
json.dump(own, open(f"{OUT}/passports_by_owner.json", "w"), separators=(",", ":"))
print("owners:", len(own))
print("HOLDINGS-DONE")
