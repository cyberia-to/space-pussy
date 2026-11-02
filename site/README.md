# spacepussy.ai — the canary of the bootloader, reborn

the deck of space-pussy in the house style (cyber.page · cyb.ai · cyb.money · bostrom.network): seven chapters, each a page —
`/` · `/rebirth` · `/balance` · `/story` · `/canary` (`/tokens`, `/bootloader` resolve) · `/graph` · `/next` (and `/<chapter>/<n>` for a slide inside).
flat navigation: every arrow, key, wheel and swipe on either axis moves one state. no date on the page: the launch is a milestone — code that passes its gate.

- `index.html` · `deck.js` · `pussy.css` — the deck, derived from `bostrom/site` (same engine, pink, the chain's own facts); `style.css` is the house stylesheet (copy of `cyb/landing/style.css`)
- `graph.json` — 1,200 particles and 2,400 cyberlinks sampled from the recovered space-pussy graph (`snapshot` `cyberlinks_indexed.csv.gz`, 29,112 links); recipe in its `meta.method`
- the balance checker is the snapshot app's logic (`../snapshot/app/index.html`): name · address (a bostrom1 address is converted to its pussy twin) · mnemonic · private key · ledger, derived locally; data and `vendor.js` are read same-origin from the snapshot's files
- `music/portal.mp3` — the portal ambient of the old space-pussy app (`ts/src/sounds/portalAmbient112.mp3`); on by default, starts on the first gesture

- `explorer/` — the block explorer at `/explorer/`: `index.html` · `explorer.js` · `explorer.css`, static, no build. hash routes (`#/`, `#/blocks`, `#/block/<id|height>`, `#/signal/<id>` (old `#/tx/<id>` links redirect), `#/neuron/<id>`, `#/particle/<id>`, `#/card/<id>`, `#/epochs`, `#/epoch/<n>`, `#/staking`, `#/history`, `#/focus`); live: `/tip` once a second while the tab is visible (paused in hidden tabs), `/status` every 4 s and on each block, new blocks slide into the tables, ages tick, a hashing meter shows P(a block by now) = 1 − e^(−t/T) with T = the next block's expected hashes ÷ the hashrate, the epoch bar marks the next settlement; a dropped node shows `reconnecting…` at once and a banner after 10 s; data from the node's read API (cybernode `rs/src/node/chain_routes.rs`) at `/explorer/api/<path>` on the same origin, or `?api=<base>` for another node. `explorer/nginx-explorer.conf` is the vhost part: the page, the proxy to the node (`127.0.0.1:7783` = pussy-rc; `7781` = pussy at genesis), GET only, an allowlist of read paths, short timeouts, `limit_req` (its zone goes in `http{}`, see the file's head), `no-store` for moving reads, 10 s for blocks and transactions, and `/explorer/data/` (the indexer's files, `max-age=10`, gzip, a missing file is 404)
- `explorer/indexer/` — the history behind `#/history` and `#/staking`: `indexer.py` (python stdlib) walks every block from genesis on the local node, keeps `blocks.jsonl` (one line per block: height, id, prev, time, bits, work = 2^256/(target+1), txs, size, miner, fees, staking txs) under `/srv/edge/data/explorer/`, follows the tip, rewinds a reorg by comparing ids back from the tip, and every 30 s writes `history.json` (all / 1 day / 1 hour, ≤ 2,000 bins each with mean/min/max: hashrate, difficulty, block time, txs, active and total stake), `stakes.json` (every position joined with `/cards/<neuron>`, earned = Σ its card's payouts in `/epochs`, the settled epochs, the last 200 staking txs) and `summary.json` into the site's `explorer/data/`. `run` + `log/run` are its runit service `explorer-index` (user `cyber`). `particles_cids.py` turns the content audit's `audit/particles-cids.tsv` into `explorer/cids/<xx>.json`, 256 shards of `{particle: [cid, class]}`, read by the particle page, which previews the bytes from `gateway.ipfs.cybernode.ai` (text: the first 2 KB, images inline, else a link, or `bytes not found`)

## deploy

deimos (`cyber@195.201.105.229:8333`), `/archive/snapshot-pussy/site/`; nginx maps the datasets and `vendor.js` onto
`/archive/snapshot-pussy/pub/` (the burial snapshot, still served as `/snapshot`), everything else is `try_files … /index.html`.
config: `apparatus/servers/deimos/nginx/spacepussy.ai`.

```sh
rsync -az -e "ssh -p 8333" site/ cyber@195.201.105.229:/archive/snapshot-pussy/site/
```

checks: `python3 ~/cyber/cyber/scripts/cdp.py https://spacepussy.ai/ --eval '…'` (no node).

### the explorer

the deck moved with the burial sites to the edge (apparatus `audit/hetzner/retire-2026-10-27.md`: `/var/www/burial/`, vhost `burial.conf`); `<root>` below is the `root` of the `server_name spacepussy.ai` block there.

```sh
rsync -az --exclude nginx-explorer.conf --exclude indexer/ --exclude data/ site/explorer/ <edge>:<root>/explorer/
scp site/explorer/nginx-explorer.conf <edge>:/etc/nginx/snippets/nginx-explorer.conf
# once, in http{}:  limit_req_zone $binary_remote_addr zone=pussy_explorer:10m rate=10r/s;
# in the spacepussy.ai 443 server block:  include /etc/nginx/snippets/nginx-explorer.conf;
ssh <edge> 'nginx -t && nginx -s reload'
```

`explorer/data/` belongs to the indexer (owner `cyber`): a deploy never writes into it, hence `--exclude data/` (and in a deploy of the whole `site/`, `--exclude explorer/data/ --exclude explorer/indexer/`).

the indexer, once per edge (it survives container restarts: `/etc/service` is the volume's `sv/`, `boot.sh` recreates `cyber`):

```sh
ssh <edge> 'mkdir -p /srv/edge/sv/explorer-index/log /srv/edge/log/explorer-index /srv/edge/data/explorer <root>/explorer/data && chown cyber:cyber /srv/edge/data/explorer <root>/explorer/data'
scp site/explorer/indexer/run site/explorer/indexer/indexer.py <edge>:/srv/edge/sv/explorer-index/
scp site/explorer/indexer/log/run <edge>:/srv/edge/sv/explorer-index/log/run
# runsvdir picks the new directory up by itself; after an update: ssh <edge> 'sv restart explorer-index'
ssh <edge> 'sv status explorer-index; tail /srv/edge/log/explorer-index/current'
```

the first walk of 3,200 blocks takes seconds on the edge; it keeps up at one `/tip` every 2 s. for `pussy` at genesis: `--node http://127.0.0.1:7781` in `run`, a fresh `--data` dir. the CID map: `python3 site/explorer/indexer/particles_cids.py audit/particles-cids.tsv site/explorer/cids` once the audit lands, then deploy `explorer/cids/` with the page.

checks: `curl -s https://spacepussy.ai/explorer/api/tip` answers JSON; `curl -s https://spacepussy.ai/explorer/data/summary.json` answers the index's height; `/explorer/api/template` and `POST /explorer/api/tx/…` answer 404/403; the page: `python3 ~/cyber/cyber/scripts/cdp.py 'https://spacepussy.ai/explorer/#/' --shot /tmp/x.png`.
