# AGENTS.md — space-pussy

> the doctrine of the home is `~/cyber/AGENTS.md`; it applies here first.

this repository is one network: pussy. it holds what defines the network and what shows it, and no code of a node.

## what lives here

- `network.toml` — the network's identity and rules
- `genesis/` — the sources, the rules of distribution, the starting graph, the lock
- `endpoints.toml` — the site, the explorer, the peers
- `site/` — spacepussy.ai: the deck and the explorer; static files, no build, no Node
- `snapshot/` — the burial of the old chain: the manifest of pins, its tools, the balance checker
- `audit/` — receipts
- `docs/` — the story, the old chain, how to run a node

the node is cyberia-to/cybernode. a change to how a network runs goes there; a change to what this network is goes here.

## rules

- a value of `network.toml` is the node's value. it changes only together with the node, and the commit names the node's commit.
- `genesis/genesis.lock` changes only with a build receipt in `audit/`: two independent builds of the same inputs, the same bytes.
- `snapshot/manifest.json` is the genesis's source and is never edited: a new burial is a new manifest and a new lock.
- the genesis file and the snapshot's files are never committed; they are built and fetched.
- `docs/why-spacepussy.md` is the original text of 2022 and is kept as it was written.
- the old chain's code is on the branch `legacy/go-cyber` and does not come back to the default branch.

## checks before a commit

- `python3 -c "import tomllib,sys; [tomllib.load(open(f,'rb')) for f in sys.argv[1:]]" network.toml endpoints.toml genesis/sources.toml genesis/distribution.toml genesis/graph.toml genesis/genesis.lock`
- `shasum -a 256 snapshot/manifest.json` equals `manifest_sha256` in `genesis/sources.toml` and `source_manifest_sha256` in the lock
- the site opens from the files: `python3 ~/cyber/cyber/scripts/cdp.py file://$PWD/site/index.html`
