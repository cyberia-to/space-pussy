---
title: pussy genesis particles — where their bytes are, 2026-11-02
tags: space-pussy, audit, genesis, particles, filecoin, ipfs
crystal-type: audit
crystal-domain: cyber
date: 2026-11-02
---

# pussy genesis particles — where their bytes are

The owner's question (2026-11-02): pussy's genesis has 16,273 particles — is
their content available, or was it lost with the old infrastructure?

Answer: 83.2 % of the particles that carry a legacy CID have their bytes in
our Filecoin particle archive and are served by our gateway today; 4.2 % are
reachable only on public IPFS; 4.8 % are announced by some public peer but no
gateway returned them; 7.8 % appear lost. By focus the picture is better:
the archive carries 76.6 % of all φ* (85 % of the φ* held by the top 1,000
particles), and 42 of the top 50 particles are retrievable now.

Every number below names its command; revisions and times are in the
provenance table. Measured 2026-11-02 11:39–13:40 UTC from the Mac.

## provenance

| input | revision / digest | when (UTC) |
|---|---|---|
| burial snapshot | `snapshot/manifest.json` at space-pussy origin/main `f23a3f4d` (file last changed `52b2c073`); inputs fetched by the tool into `~/.cache/cyber/pussy-genesis` | 11:39 |
| genesis tool | stand `candidate-20261101.66`, macOS arm64 `soft3` 0.10.0, sha256 `a58e5c60…2c74`, soft3 `d9a1613`, tru `464104c` | 11:39 |
| genesis export | `particles.tsv` sha256 `93fbde71…7f93`, `links.tsv` sha256 `78caedb0…1ed3` | 11:39 |
| Filecoin particle ledger | apparatus origin/master `0f51a4e`, `audit/filecoin/particles-ledger.jsonl` (305 rows, sha256 `e29cc87a…f753`) and `audit/filecoin/new-pins-2026-10-27.txt` (57 particles, sha256 `82c70eaa…b004`) | — |
| pack manifests | the dag-cbor root of each ledger row, fetched from `main.ezpdpz.net` / `pdp.lotus.dedyn.io` (122 MB, `~/.cache/cyber/pussy-content/roots/`) | 11:40 |
| bostrom availability audit | `missing_particles.txt.gz` sha256 `38301c24…91f8`, `particles_availability.json` (io flatfs presence, 2026-08-28) | — |
| focus | alpha node (agent-a, chain `pussy-rc`, genesis `5614749e…b713`, height 3,271), `GET /focus?top=16273` → epoch 13, digest `4454099711aa…0b5f`, 1,000 entries (the cap) — `content-availability-2026-11-02/focus-epoch13.json` | 12:30 |
| probes | `content-availability-2026-11-02/probes.jsonl.gz` (every request: host, status, size, sniffed kind, seconds) | 11:46–13:40 |

## 1. the particle list: 16,271 legacy CIDs + 2 passport particles

    soft3 genesis build --chain pussy --snapshot snapshot --out /tmp/pussy-x.tade \
      --cache ~/.cache/cyber/pussy-genesis --export /tmp/pussy-export

reports `particles 16271`, `l_frames 29113` (29,112 restored cyberlinks + 1
passport frame), file sha256 `ec7aee79…2d72`. `particles.tsv` holds 16,271
rows (particle, CID), all CIDv0, all distinct. `--chain pussy-rc --time
1793885820` gives the same 16,271.

The 16,273 that the chain reports (`/epochs`: `particles 16273`) are these
16,271 plus the two particles of the one passport frame
(`b2fd9d4b…e8f7e8` → `7d54a857…415a7c`), which have no legacy CID and so no
bytes to look for. `particles-cids.tsv` lists them with class `no-cid`.

## 2. classification

| class | meaning | particles | share of 16,271 |
|---|---|---|---|
| archive | listed in the Filecoin particle archive (pack manifests of the ledger, 13,529, plus the 2026-10-27 new pins, 9) | 13,538 | 83.20 % |
| public | not archived; bytes returned by at least one public gateway | 679 | 4.17 % |
| announced | not archived, no gateway returned bytes, but IPNI/DHT lists a provider other than our two PDP providers | 782 | 4.81 % |
| lost | not archived, no gateway returned bytes, no provider announced | 1,272 | 7.82 % |

Command: `final.py ~/.cache/cyber/pussy-content /tmp/pussy-export ../apparatus ~/.cache/cyber/snapshots/bostrom audit/particles-cids.tsv`
(scripts in `content-availability-2026-11-02/`, python stdlib only).

How (a) was counted: the ledger maps index ranges of io's pin list to packs
but the list itself (`cids.txt`) lived on io only. Each pack's root is a
dag-cbor manifest of the particles that begin in it; `fetch_roots.py` +
`parse_roots.py` rebuilt the list from the 304 roots the providers serve:
3,217,835 distinct particles, every pack's `first` and count equal to the
ledger, equal to the 2026-10-17 receipt's total. Pack 304 (the 167 MB single
particle) answers 404 by root, as that receipt records; it re-packs index
3,217,833, which pack 303's range (3,215,450…3,217,834) already lists, so the
list is complete.

Of the 13,538 archived, 5,488 are particles bostrom's graph shares and 8,050
belong to pussy alone — pussy's content was on io's pins, not only bostrom's.

## 3. retrieval now

Probe set: 600 random archived particles (seed 20261102), every one of the
2,742 not in the pack manifests (2,733 + the 9 new pins), then 116 more
top particles on our gateway and routing only: 46 from a PageRank ranking of
`links.tsv` used while `/focus` was not yet computed, and the 70 of the φ*
top 100 not already probed. Each request: `GET /ipfs/<cid>` with
`Range: bytes=0-4095`, timeout 15 s, at most 8 concurrent per host, first
4 KiB kept in `~/.cache/cyber/pussy-content/heads/` (5.1 MB total), size
from `Content-Range`.

| host | archive sample (600) | not archived (2,733) |
|---|---|---|
| our gateway `gateway.ipfs.cybernode.ai` (DNS still points at `194.107.163.6`, which times out; reached with `--connect-to …:213.58.173.242:443`) | 600 ok (100 %) | 0 ok — 2,733 answered 500 |
| `gw.ipfs-lens.dev` | 172 ok of 430 tried | 524 ok |
| `ipfs.filebase.io` | 171 ok, 406 rate-limited (429) | 346 ok |
| `gateway.pinata.cloud` | 39 ok, 558 rate-limited | 58 ok, 2,272 rate-limited — partial coverage |
| IPNI/DHT `delegated-ipfs.dev/routing/v1/providers` | other providers for 238 | other providers for 1,459 |

Also: the 9 new pins and all 116 extra top particles returned through our
gateway. `ipfs.io` and `dweb.link` now answer only a service-worker notice
(429 body "switching to a service worker gateway only"),
`cloudflare-ipfs.com` does not resolve, `trustless-gateway.link` answers
5xx — none of them are usable for this.

The 192 lost particles inside the φ* top 1,000 were retried with 45 s
timeouts on all four hosts: 0 returned.

Content kinds (first-bytes sniff): the archive sample is 561 text (93.5 %),
23 jpeg, 6 png, 4 pdf, 3 mp4, 2 webp, 1 svg; 9.38 MB for 600, median 11
bytes, mean 15.6 KB, largest 2.29 MB — so the archived pussy particles weigh
about 13,538 × 15.6 KB ≈ 0.2 GB (a projection from the sample). The
public-only set is 348 text, 277 png, 35 jpeg, 7 mp4, 5 pdf, 4 zip,
2 webp, 1 mp3; 2.24 GB measured (median 15 KB; the six largest — four mp4,
two pdf — are 0.93 GB).

Of the 2,733 not archived, 912 were present as blocks on io's flatfs on
2026-08-28 (bostrom's availability audit) but were not among io's recursive
pins, so `particle-pack` never packed them: 340 of them are public now, 507
announced, 65 lost. io answers no ssh (88.99.105.146:8333 timed out at
12:5x UTC); its services were stopped 2026-10-27 (apparatus
`audit/hetzner/retire-2026-10-27.md`).

25,752 of the 29,112 restored cyberlinks (88.5 %) have bytes held or
reachable at both ends.

## 4. focus

`/focus?top=N` caps at 1,000 entries; those carry 89.80 % of all φ* at
epoch 13. By class: archive 76.56 %, lost 12.61 %, announced 0.47 %,
public 0.16 % of the total. The top 50 hold 50.20 %: archive 46.59 %
(42 particles, every one retrieved through our gateway today), lost 3.61 %
(8 particles).

| φ* rank | particle | legacy CID | φ* % | class | kind | bytes | first bytes |
|---|---|---|---|---|---|---|---|
| 1 | `b302a53669f6` | `QmbdH2WBamyKLPE5zu4mJ9v49qvY8BFfoumoVPMR5V4Rvx` | 8.479 | archive | text | 5 | tweet |
| 2 | `963df8538eee` | `QmPGWEL1ct271FGRfF8uuKwcZ4rn55T8Gcgz5Lcz2T4qXD` | 8.296 | archive | text | 7 | Love it |
| 3 | `2e575e5a1165` | `QmPSgZm64uoEnPzRLHdrW4yVhVpej2L912urBjbsA2iKM4` | 2.832 | archive | text | 18 | ambassador program |
| 4 | `deac7bbb2f01` | `QmPLSA5oPqYxgc8F7EwrM8WS9vKrr1zPoDniSRFh8HSrxx` | 2.747 | archive | text | 6 | follow |
| 5 | `7b3519f051cd` | `Qmcs4uUdoXg7m9oovh7HLjmTEuXyTK2upe3sxdNCod7zWp` | 1.311 | archive | image/jpeg | 176,386 |  |
| 6 | `f96e631a4a6a` | `QmPG2wNKpJT85Ud6dhKYsaghNDTQW7rqs22fmHVp5TqaMQ` | 1.287 | archive | text | 5 | pussy |
| 7 | `8c3cb5959769` | `QmZk92gKaLM2R4f5ut3VMoQLxSBFdQZ1YmFRZK89wBeTa6` | 1.083 | archive | text | 48 | How to interact if you don't want to |
| 8 | `8d572c221e4b` | `Qma7Dd514Xf4qvS8zkGt8ZHZGUkBGPnmaryBsciQcVBvnb` | 1.073 | archive | text | 5 | music |
| 9 | `bf9932af4fba` | `Qmf89bXkJH9jw4uaLkHmZkxQ51qGKfUPtAMxA8rTwBrmTs` | 0.994 | archive | text | 6 | avatar |
| 10 | `670e43c5bab0` | `QmaqvcSektvdF5QBxmz1oSJREjYx9wfp7BmVYRhaadssYD` | 0.993 | archive | text | 17 | What's happening? |
| 11 | `8ee29baaa8df` | `QmTnPMMgN8y1GYgn2gB28jwZEniWCps6zxtkdybQTQbU7V` | 0.880 | archive | text | 68 | How to eat pussy without wasting you |
| 12 | `cfb00d6e6531` | `QmbvAV2oQKt7T1o4ghqbsXu1WU63YXoargoMGzMinYN8eA` | 0.880 | archive | text | 61 | The best position to always satisfy  |
| 13 | `48ed70db55c1` | `QmWkUTrFQdMxYaay7SrEDvMqzAK9Yak477Zgi5jKSd14MG` | 0.869 | archive | text | 3 | Kat |
| 14 | `5a34b50c4858` | `QmdF4NW6S8exxeTTQgGEEGFQR27MprjQ8y9HfJfR7WkCUw` | 0.851 | archive | text | 30 | Tips for visiting a strip club |
| 15 | `648eb4626485` | `QmfKcn3myK1b7uu6KcaTpM5CPLDkncVXBA1oaStiHvGCEk` | 0.788 | archive | text | 48 | baddeepbeat validator in bostrom and |
| 16 | `6fb77cf3753f` | `QmSJPkZQJZqmh6AutuBP1iL6VM4in7wLk11uTydm8V87un` | 0.788 | archive | text | 54 | brought several validators to bostro |
| 17 | `ec0b3125c939` | `QmfU7tx2Wx41qbBdiKdHa4N6b1yP1vDfEHDczTxXXVPGwj` | 0.783 | archive | text | 5 | books |
| 18 | `e01d4d82660a` | `QmZd92NsvvuPX63dDhvqbEmLDra75bheP5cmaKNDsDCt1Q` | 0.772 | archive | text | 292 | Sit at the bar and generously tip th |
| 19 | `7b483f39c4d2` | `QmfGChsfcpGU3PhM9otyVP9dMYwnyK3qDYfi69Hjpvm1iY` | 0.725 | lost | - | - |  |
| 20 | `7bc1c4167cd2` | `QmZf5YnpLGXFfmzb4t3nfZL62wMmfmcoo1h5mBJkmUQ4oj` | 0.682 | archive | text | 17 | adult entertainer |
| 21 | `27f68b590300` | `QmXzh9V6AmNdgz7FyBxiyTpDjJZ25EYe8E5RMqcza8asEw` | 0.669 | archive | text | 513 | Gently push up on the clitoral hood, |
| 22 | `74760dedf6b7` | `QmPnuA8dPrpxasHBiE2aL8yahVnGjmyZNqQZKUfUHkKdcs` | 0.669 | archive | text | 1,143 | This position requires  you to have  |
| 23 | `37cca8b461e1` | `QmTemrnwMtrMqjCqKfqcrUDuez9Ji5ZWuGvnjnM4WLuUeo` | 0.656 | archive | text | 11 | test flight |
| 24 | `3a92482d5413` | `QmUMv8VoDD97Pfs5XxgdU7yLE9VdKidgTqUH9sAdoQ8LSX` | 0.588 | archive | text | 4 | noun |
| 25 | `3995f34e20ea` | `QmY6f7UFNsS9h1o6jan9ctBcGwqkFRAD28PaH4D2q4hGAt` | 0.551 | archive | text | 7 | S&P 500 |
| 26 | `543096223108` | `QmTfnA75oTRXdvVaCLSAoWh1hfwWVn8EdMMZCNMbcsKG9Z` | 0.521 | archive | text | 26 | Female Adult Entertainer A |
| 27 | `2a93114d0e9e` | `QmdWnJ8QdqY8ykhcmHMpqfi2ByZ8YQuPW5DYyNePh8JsmS` | 0.484 | lost | - | - |  |
| 28 | `986d0353a228` | `QmbJgD45adqrmgwcQdQhYLWGLCfTbLyxeFL7XHxeJCoJAT` | 0.483 | archive | text | 44 | cyber1latzme6xf6s8tsrymuu6laf2ks2hum |
| 29 | `b5f24773a225` | `QmRPBRKLb3d8uwx4MFX3oer94j8CJc6THWhtTbtghwPW3W` | 0.483 | lost | - | - |  |
| 30 | `5be024132eec` | `QmdBJcmBCeSWew91vvJDYemF8REhV3wrXgweGsHUugrCD3` | 0.444 | lost | - | - |  |
| 31 | `a052963090bb` | `QmTS9U2qjLjrSA4TxYUtd7eFDL4HWm9h8rRKQgndg1W66B` | 0.434 | archive | image/jpeg | 79,853 |  |
| 32 | `5ea858b02ab9` | `QmYz9nWUmWLebL6Ux1DMLGcApyrbb4ZLRg4Pa9vKxesqDn` | 0.433 | archive | image/jpeg | 34,996 |  |
| 33 | `d906bd114bdc` | `QmTNiarKJsKicGbSSZxj76MizhanVB7xZ1R5LhCkyy4yMA` | 0.433 | archive | image/jpeg | 63,398 |  |
| 34 | `2f5b05885914` | `QmZZems7X1kBkKPmHwwfyYxcZ3pH8FEVFTZEL4wfH3wVNg` | 0.433 | lost | - | - |  |
| 35 | `8f23fd15eade` | `QmcDrzAzb6c8c6w1P6voizUGzYvEEt3xQz8YRSkFxApmkq` | 0.433 | archive | image/jpeg | 59,898 |  |
| 36 | `ebf36fb5c82b` | `QmXLob2HGQGTxiPVauvubo3xF1XJQK3R1xAuw2kcvDU1z3` | 0.433 | archive | image/jpeg | 185,284 |  |
| 37 | `a6fac0fd073d` | `QmTwL1fvjDPzrxj9jPMbZCUCViPgyQViJCwMtxtiRMT9ng` | 0.421 | archive | text | 3 | sex |
| 38 | `a0fd85896aa1` | `QmTtQYJCu4Wf3mHogi648sVYwrtVMujfHrtiZGdFJypKPg` | 0.397 | archive | text | 37 | teach by creating links in cybergrap |
| 39 | `6c98a93705b4` | `QmPvHfJMk78dzE9RFNxTWueCmuFQy4PML5Qzp3EgP3SPmP` | 0.369 | lost | - | - |  |
| 40 | `a6d37972fb9b` | `QmP3CtBbykBoFCiNRqhWdTWGiomszKyt5iZZQHMWvBYoxz` | 0.359 | archive | text | 18 | # Glad to be home. |
| 41 | `f7cb2dbf81b0` | `QmZufaFHizAnqkGjKC3pP99gFDTSFGb1yXpZxBYQztTfxw` | 0.359 | lost | - | - |  |
| 42 | `063dc2bd083a` | `QmckPXjgpgG3tpAq1Rqt15wrEF5MbY91eZbgee7DRZEp78` | 0.359 | archive | text | 30 | Poemas e imagenes desoladoras |
| 43 | `0cdbdd744dba` | `QmdYmLW3yVwjPJJGoCtxQnap5CmZ1tZCZQjzGjGCaN1Whp` | 0.355 | archive | text | 4 | verb |
| 44 | `4dd342490b74` | `QmXxWpkWrFGrUmAeyZ7sE7WJPT9ShSmX2MV5Da661FUfCR` | 0.355 | archive | text | 1,869 | ## Faculty of Sex  Welcome to the Fa |
| 45 | `68b5cbcc416f` | `QmVLf4ZZ4AEetj82s6XMsYrGk1wBV9D23H2iuGNwk1eQMr` | 0.347 | archive | text | 11 | cunnilingus |
| 46 | `62323f4788d9` | `QmXAqJAeRoY3XJHVhE3poVsim1zxGs4FqgoVoVfVAguDNr` | 0.347 | archive | text | 10 | Kama-Sutra |
| 47 | `3561ae9ec57f` | `QmW5CbUpj7NK2k6azvQkJpggTvdwS65zaQVobGy3D9Qz7a` | 0.329 | archive | text | 6 | galaxy |
| 48 | `297e3af1dc4c` | `QmbRkQeSvBLjNbWastiwkQzwK6M3rQL7GsdWXftg1ex4Jx` | 0.319 | archive | text | 6 | crimea |
| 49 | `1fac6d08e823` | `QmV36z3W94xoKev9TU1RZPHgDg89oq1jjWsDPhLzfZLnqu` | 0.314 | lost | - | - |  |
| 50 | `4e1c7d553133` | `QmUkbW8Li27tALt794qLL7bQBWHpt9Gp2DygVi3ZMbxHfJ` | 0.314 | archive | text | 6 | Avatar |

## 5. rescue

- public only, 679 particles, 2.24 GB measured: fetch each whole through
  `gw.ipfs-lens.dev` / `ipfs.filebase.io` (paced, the per-CID list is the
  `public` rows of `particles-cids.tsv`), check the CID of what arrives, add
  to the particle archive as one more pack with `particle-pack` (`files` or
  `run` mode over a local Kubo) in data sets 1738/1739. At ≈ $2.5 per TiB
  per month per copy that is under $0.02 a month for two copies plus one
  piece fee; the work is a few hours of paced fetching. Not started.
- announced, 782 particles: a provider exists but no gateway returned them
  in 15 s (192 of the lost were also retried at 45 s). A Kubo node fetching
  over bitswap with long timeouts is the next try; size unknown — at the
  public set's mean (3.3 MB) up to ~2.6 GB, at its median ~12 MB. Open.
- io's flatfs: if the box still exists and boots, its disk held 912 of the
  non-archived particles on 2026-08-28, including 65 now lost and 507 only
  announced. Booting a dedicated server that is due for cancellation is the
  owner's hand (Hetzner Robot).
- lost, 1,272 particles (1,157 pussy-only): no copy found anywhere probed.
  12.6 % of φ* sits on them; their cyberlinks stay in the graph with
  particle identities but without bytes.

## files

- `audit/particles-cids.tsv` — `particle, cid, class, kind, bytes` for all
  16,273 particles (kind and bytes only where retrieved); the map an
  explorer needs to show previews: legacy CID → `https://gateway.ipfs.cybernode.ai/ipfs/<cid>` for class `archive`.
- `audit/content-availability-2026-11-02/` — `targets.py`, `rank.py`, `fetch_roots.py`,
  `parse_roots.py`, `probe.py`, `pub.py`, `final.py`, `probes.jsonl.gz`,
  `focus-epoch13.json`.

## commands

    # the archived particle list
    python3 fetch_roots.py ../apparatus/audit/filecoin/particles-ledger.jsonl ~/.cache/cyber/pussy-content/roots
    python3 parse_roots.py ~/.cache/cyber/pussy-content/roots ../apparatus/audit/filecoin/particles-ledger.jsonl \
      ~/.cache/cyber/pussy-content/filecoin-particles.tsv      # packs 304 particles 3217835 mismatch 0
    # probe set, probes
    python3 targets.py /tmp/pussy-export ~/.cache/cyber/pussy-content     # 600 2742
    python3 probe.py targets.tsv probe.jsonl heads                         # all lanes; public lanes hit 429
    python3 pub.py targets-pub.tsv pub.jsonl heads                         # the 2,733, paced public lanes
    # targets-pub: the not-archive rows minus the 9 new pins; targets-top: rank.py top 52 not yet probed;
    # targets-phi: φ* top 100 not yet probed; targets-retry: lost particles in the φ* top 1,000
    python3 rank.py /tmp/pussy-export/links.tsv /tmp/pussy-export/particles.tsv rank.tsv
    LANES=ours,routing python3 probe.py targets-top.tsv probe-top.jsonl heads
    LANES=ours,routing python3 probe.py targets-phi.tsv probe-phi.jsonl heads
    TIMEOUT=45 LANES=ours,ipfs-lens,filebase,pinata python3 probe.py targets-retry.tsv retry.jsonl heads
    # focus
    ssh -F apparatus/local/ssh_config agent-a 'curl -s "127.0.0.1:7783/focus?top=16273"' > focus-epoch13.json
    # classes, tables, the map
    python3 final.py ~/.cache/cyber/pussy-content /tmp/pussy-export ../apparatus ~/.cache/cyber/snapshots/bostrom audit/particles-cids.tsv

At 11:48 UTC `/focus` answered `focus_not_computed`; φ* appeared with epoch
13's settlement and was read at 12:30 UTC.
