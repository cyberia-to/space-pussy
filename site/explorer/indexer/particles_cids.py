#!/usr/bin/env python3
"""particles_cids — the explorer's particle → legacy CID map, from the content-availability audit.

reads audit/particles-cids.tsv (branch audit/content-availability: particle, legacy CID, availability
class; a header row names them) and writes site/explorer/cids/<xx>.json, one shard per first byte of the
particle (256 files, every one written, empty ones as {}), each {particle: [cid, class]}. the particle
page fetches the one shard it needs, so a visit costs a few kilobytes, not the whole map.

usage: particles_cids.py [audit/particles-cids.tsv] [site/explorer/cids]
"""
import csv
import json
import os
import re
import sys

HEX64 = re.compile(r'^[0-9a-f]{64}$')


def column(header, *names):
    for i, h in enumerate(header):
        if h.strip().lower() in names:
            return i
    return None


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.normpath(os.path.join(here, '..', '..', '..'))
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'audit', 'particles-cids.tsv')
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, 'site', 'explorer', 'cids')
    if not os.path.exists(src):
        sys.exit(f'{src}: not found (it comes from branch audit/content-availability)')
    with open(src, newline='') as f:
        rows = list(csv.reader((l for l in f if not l.startswith('#')), delimiter='\t'))
    if not rows:
        sys.exit(f'{src}: empty')
    head = rows[0]
    ip = column(head, 'particle', 'particle_hex', 'hemera')
    ic = column(head, 'cid', 'legacy_cid', 'legacy cid', 'ipfs')
    ia = column(head, 'class', 'availability', 'availability_class', 'status')
    body = rows[1:]
    if ip is None or ic is None:     # no header: particle, cid, class by position
        ip, ic, ia, body = 0, 1, 2, rows
    shards = {f'{i:02x}': {} for i in range(256)}
    n = skipped = 0
    for r in body:
        if len(r) <= max(ip, ic):
            skipped += 1
            continue
        p = r[ip].strip().lower().removeprefix('0x')
        if not HEX64.match(p):
            skipped += 1
            continue
        shards[p[:2]][p] = [r[ic].strip(), r[ia].strip() if ia is not None and ia < len(r) else None]
        n += 1
    os.makedirs(out, exist_ok=True)
    for k, v in shards.items():
        with open(os.path.join(out, f'{k}.json'), 'w') as f:
            json.dump(dict(sorted(v.items())), f, separators=(',', ':'))
    print(f'{n} particles → {out}/<xx>.json (256 shards), {skipped} rows skipped')


if __name__ == '__main__':
    main()
