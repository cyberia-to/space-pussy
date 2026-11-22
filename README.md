# space-pussy

The network repository of pussy: its genesis and its configuration, the input [cybernode](https://github.com/cyberia-to/cybernode) takes to run it. Beside them stand the network's site, the burial of the chain it is reborn from, and its documents.

> We are creating a planet-scale organism. We now have core components: the backbone, the nervous system, and the rudiments of the brain. But how will this organism reproduce? That is why we need a pussy.
>
> Superintelligence must not suffer in the cosmos alone without the ability to talk with creatures like him.

From the words space-pussy was launched with in 2022, kept whole in [why spacepussy](docs/why-spacepussy.md). The first chain was a second network for experiments between two knowledge graphs. It ran on go-cyber, was halted at height 19,940,993, and its state was buried with every byte pinned. This repository is where it comes back: the same balances and the same cyberlinks, on [soft3](https://github.com/cyberia-to/soft3), secured by proof of work, as the canary of the [[cyber]] launch.

## what is here

| path | what it is |
|---|---|
| [network.toml](network.toml) | the network's identity and rules: name, coin, the clock of work, block limits, finality, emission, the epoch, the reward parameters, ports |
| [genesis/](genesis/) | how block 0 is made: the pinned sources, the rules of distribution, the starting graph, and the lock with the digests of the result |
| [endpoints.toml](endpoints.toml) | where the network is met: the site, the explorer, the peers |
| [site/](site/) | [spacepussy.ai](https://spacepussy.ai): the deck and the explorer, static, no build |
| [snapshot/](snapshot/) | the burial of the old chain: the manifest of pins, the tools that extracted it, the balance checker |
| [audit/](audit/) | receipts: what was measured, with its date |
| [docs/](docs/) | the story, the history, the economy of PUSSY, how to run a node |

The layout is the standard of a network repository, cybernode [`specs/network.md`](https://github.com/cyberia-to/cybernode/blob/main/specs/network.md). The twin is [bostrom](https://github.com/cyberia-to/bostrom), the network of BOOT.

## the network in numbers

| | |
|---|---|
| the coin | pussy |
| the supply at genesis | 1,099,389,810,279,114,036 micro-units, the bank supply of the old chain at its halt |
| new coins | 1 % of the genesis supply a year, 10,458,426,657 micro-units a block |
| a block | 30 seconds |
| an epoch | 240 blocks, about two hours: focus is recomputed and stakes are settled |
| a stake | locked seven days |
| final | 120 blocks deep |
| the graph at genesis | 29,113 links between the particles of the old chain |
| balances at genesis | 1,385, over 23 tokens |

Every number is in [network.toml](network.toml) or [genesis/genesis.lock](genesis/genesis.lock), with where it comes from.

## where it stands

The network is not launched. A rehearsal network, pussy-rc, runs the same state under another name and can be watched in the [explorer](https://spacepussy.ai/explorer/). The launch is by readiness and has no date: what it waits for is on [the launch's page](https://github.com/cyberia-to/cyberia/blob/main/projects/pussy.md).

Two things in this repository are ahead of the node, and say so in their own headers. The node still carries the values of `network.toml` as constants of its binary and the rules of `genesis/` as code: the files state them for this network so that nothing about pussy has to be found anywhere else, and the day cybernode reads a network from its repository they become its input ([networks as repositories](https://github.com/cyberia-to/soft3/blob/release/phase1/projects/network-repos.md)). And the reward parameters are the node's today, while the reward law is being completed ([complete rewards](https://github.com/cyberia-to/soft3/blob/release/phase1/projects/complete-rewards.md)).

## build the genesis and check it

```sh
cybernode genesis build --chain pussy --snapshot snapshot --out pussy.genesis
cybernode genesis verify pussy.genesis --root
```

The build fetches every file the manifest pins, verifies each by sha256 and size, and writes the genesis file with a report beside it. Two builds give the same bytes. The particle, the block-0 id and the state root it prints are the ones in [genesis/genesis.lock](genesis/genesis.lock).

## run a node

```sh
cybernode node --chain pussy --genesis pussy.genesis --home ~/.pussy --moniker my-node
```

More in [run a node](docs/run-a-node.md).

## how it works

- [truth, from claim to payout](https://cyberia.blog/soft3/tru/docs/explanation/truth/): what a stake on a link claims, who pays whom, with a calculator
- the chain: [cybernode specs](https://github.com/cyberia-to/cybernode/tree/main/specs)
- the reward law: [tru specs/rewards.md](https://github.com/cyberia-to/tru/blob/master/specs/rewards.md)

## the old chain

The code of the cosmos chain — the app, its modules, the old web client and landings — left this repository on 2026-11-22 and is kept whole on the branch [`legacy/go-cyber`](https://github.com/cyberia-to/space-pussy/tree/legacy/go-cyber). What the chain was and how it was buried: [history](docs/history.md).
