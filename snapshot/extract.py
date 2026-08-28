#!/usr/bin/env python3
# space-pussy final snapshot extraction — pure LCD, stdlib only.
import json, urllib.request, urllib.parse, csv, time, base64

LCD = "http://jupiter.cybernode.ai:46317"
OUT = "/archive/snapshot-pussy/pub"

def get(path, tries=4):
    for _ in range(tries):
        try: return json.load(urllib.request.urlopen(LCD + path, timeout=30))
        except Exception: time.sleep(1)
    raise RuntimeError(path)

def paged(path, key, limit=500):
    out, next_key = [], None
    while True:
        p = path + ("&" if "?" in path else "?") + f"pagination.limit={limit}"
        if next_key: p += "&pagination.key=" + urllib.parse.quote(next_key)
        d = get(p)
        out += d[key]
        next_key = d.get("pagination", {}).get("next_key")
        if not next_key: return out

# 1. supply
sup = paged("/cosmos/bank/v1beta1/supply", "supply")
json.dump(sup, open(f"{OUT}/supply.json", "w"), indent=1)
print("supply:", len(sup))

# 2. accounts + pubkeys
accs = paged("/cosmos/auth/v1beta1/accounts", "accounts", 100)
w = csv.writer(open(f"{OUT}/pubkeys.csv", "w"))
w.writerow(["address", "pubkey_type", "pubkey_base64"])
addrs = []
for a in accs:
    base = a.get("base_vesting_account", {}).get("base_account") or a.get("base_account") or a
    addr = base.get("address")
    if not addr: continue
    addrs.append(addr)
    pk = base.get("pub_key") or {}
    w.writerow([addr, pk.get("@type", ""), pk.get("key", "")])
print("accounts:", len(addrs))

# 3. balances per account
bw = csv.writer(open(f"{OUT}/balances.csv", "w"))
bw.writerow(["address", "denom", "amount"])
balances = {}
for i, addr in enumerate(addrs):
    coins = paged(f"/cosmos/bank/v1beta1/balances/{addr}", "balances")
    balances[addr] = {c["denom"]: int(c["amount"]) for c in coins}
    for c in coins: bw.writerow([addr, c["denom"], c["amount"]])
    if i % 200 == 0: print("balances", i, flush=True)
print("balances done")

# 4. validators + delegations
vals = paged("/cosmos/staking/v1beta1/validators?status=", "validators", 200)
json.dump(vals, open(f"{OUT}/validators.json", "w"), indent=1)
dw = csv.writer(open(f"{OUT}/delegations.csv", "w"))
dw.writerow(["delegator", "validator", "shares", "pussy"])
for v in vals:
    va = v["operator_address"]
    try: dels = paged(f"/cosmos/staking/v1beta1/validators/{va}/delegations", "delegation_responses", 200)
    except RuntimeError: continue
    for d in dels:
        dw.writerow([d["delegation"]["delegator_address"], va,
                     d["delegation"]["shares"], d["balance"]["amount"]])
print("validators:", len(vals))

# 5. pools + reserves
pools_raw = paged("/cosmos/liquidity/v1beta1/pools", "pools", 100)
supd = {s["denom"]: int(s["amount"]) for s in sup}
pools = []
for p in pools_raw:
    racc = p["reserve_account_address"]
    res = {d: balances.get(racc, {}).get(d, 0) for d in p["reserve_coin_denoms"]}
    pools.append({"id": p["id"], "type": "warp", "denoms": p["reserve_coin_denoms"],
                  "reserves": {k: str(v) for k, v in res.items()},
                  "reserve_account_address": racc,
                  "pool_coin_denom": p["pool_coin_denom"],
                  "pool_coin_supply": str(supd.get(p["pool_coin_denom"], 0))})
json.dump(pools, open(f"{OUT}/pools.json", "w"), indent=1)
print("pools:", len(pools))

# 6. passports
PASSPORT = "pussy1qyl0j7a24amk8k8gcmvv07y2zjx7nkcwpk73js24euh64hkja6esdnn3k6"
def smart(contract, q):
    qb = base64.b64encode(json.dumps(q).encode()).decode()
    return get(f"/cosmwasm/wasm/v1/contract/{contract}/smart/{qb}")["data"]
pf = open(f"{OUT}/passports.jsonl", "w")
toks = smart(PASSPORT, {"all_tokens": {"limit": 100}})["tokens"]
for t in toks:
    info = smart(PASSPORT, {"all_nft_info": {"token_id": t}})
    pf.write(json.dumps({"nickname": t,
        "owner": info["access"]["owner"],
        "extension": info["info"].get("extension"),
        "token_uri": info["info"].get("token_uri")}, separators=(",", ":")) + "\n")
pf.close()
print("passports:", len(toks))
print("EXTRACT-DONE")
