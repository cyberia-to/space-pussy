# spacepussy.ai — the canary of the bootloader, reborn

the deck of space-pussy in the house style (cyber.page · cyb.ai · cyb.money · bostrom.network): seven chapters, each a page —
`/` · `/rebirth` · `/balance` · `/story` · `/canary` (`/tokens`, `/bootloader` resolve) · `/graph` · `/next` (and `/<chapter>/<n>` for a slide inside).
flat navigation: every arrow, key, wheel and swipe on either axis moves one state. no calendar years on the page: the countdown carries the date.

- `index.html` · `deck.js` · `pussy.css` — the deck, derived from `bostrom/site` (same engine, pink, 13:37, the cat's facts); `style.css` is the house stylesheet (copy of `cyb/landing/style.css`)
- `graph.json` — 1,200 particles and 2,400 cyberlinks sampled from the recovered space-pussy graph (`snapshot` `cyberlinks_indexed.csv.gz`, 29,112 links); recipe in its `meta.method`
- the balance checker is the snapshot app's logic (`../snapshot/app/index.html`): name · address (a bostrom1 address is converted to its pussy twin) · mnemonic · private key · ledger, derived locally; data and `vendor.js` are read same-origin from the snapshot's files
- `music/portal.mp3` — the portal ambient of the old cat app (`ts/src/sounds/portalAmbient112.mp3`); on by default, starts on the first gesture
- the countdown targets `2026-11-05T13:37:00Z`, fifteen minutes after bostrom (kept in code only)

## deploy

deimos (`cyber@195.201.105.229:8333`), `/archive/snapshot-pussy/site/`; nginx maps the datasets and `vendor.js` onto
`/archive/snapshot-pussy/pub/` (the burial snapshot, still served as `/snapshot`), everything else is `try_files … /index.html`.
config: `cybernode/servers/deimos/nginx/spacepussy.ai`.

```sh
rsync -az -e "ssh -p 8333" site/ cyber@195.201.105.229:/archive/snapshot-pussy/site/
```

checks: `python3 ~/cyber/cyber/scripts/cdp.py https://spacepussy.ai/ --eval '…'` (no node).
