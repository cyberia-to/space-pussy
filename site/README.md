# spacepussy.ai — the canary of the bootloader, reborn

the deck of space-pussy in the house style (cyber.page · cyb.ai · cyb.money · bostrom.network): seven chapters, each a page —
`/` · `/rebirth` · `/balance` · `/story` · `/canary` (`/tokens`, `/bootloader` resolve) · `/graph` · `/next` (and `/<chapter>/<n>` for a slide inside).
flat navigation: every arrow, key, wheel and swipe on either axis moves one state. no date on the page: the launch is a milestone — code that passes its gate.

- `index.html` · `deck.js` · `pussy.css` — the deck, derived from `bostrom/site` (same engine, pink, the chain's own facts); `style.css` is the house stylesheet (copy of `cyb/landing/style.css`)
- `graph.json` — 1,200 particles and 2,400 cyberlinks sampled from the recovered space-pussy graph (`snapshot` `cyberlinks_indexed.csv.gz`, 29,112 links); recipe in its `meta.method`
- the balance checker is the snapshot app's logic (`../snapshot/app/index.html`): name · address (a bostrom1 address is converted to its pussy twin) · mnemonic · private key · ledger, derived locally; data and `vendor.js` are read same-origin from the snapshot's files
- `music/portal.mp3` — the portal ambient of the old space-pussy app (`ts/src/sounds/portalAmbient112.mp3`); on by default, starts on the first gesture

- `explorer/` — the block explorer at `/explorer/`: `index.html` · `explorer.js` · `explorer.css`, static, no build. hash routes (`#/`, `#/blocks`, `#/block/<id|height>`, `#/tx/<id>`, `#/neuron/<id>`, `#/particle/<id>`, `#/card/<id>`, `#/epochs`, `#/epoch/<n>`, `#/focus`); data from the node's read API (cybernode `rs/src/node/chain_routes.rs`) at `/explorer/api/<path>` on the same origin, or `?api=<base>` for another node. `explorer/nginx-explorer.conf` is the vhost part: the page, the proxy to the node (`127.0.0.1:7783` = pussy-rc; `7781` = pussy at genesis), GET only, an allowlist of read paths, short timeouts, `limit_req` (its zone goes in `http{}`, see the file's head), `no-store` for moving reads, 10 s for blocks and transactions

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
rsync -az --exclude nginx-explorer.conf site/explorer/ <edge>:<root>/explorer/
scp site/explorer/nginx-explorer.conf <edge>:/etc/nginx/snippets/nginx-explorer.conf
# once, in http{}:  limit_req_zone $binary_remote_addr zone=pussy_explorer:10m rate=10r/s;
# in the spacepussy.ai 443 server block:  include /etc/nginx/snippets/nginx-explorer.conf;
ssh <edge> 'nginx -t && nginx -s reload'
```

checks: `curl -s https://spacepussy.ai/explorer/api/tip` answers JSON; `/explorer/api/template` and `POST /explorer/api/tx/…` answer 404/403; the page: `python3 ~/cyber/cyber/scripts/cdp.py 'https://spacepussy.ai/explorer/#/' --shot /tmp/x.png`.
