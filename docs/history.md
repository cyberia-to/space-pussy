# the history of space-pussy

space-pussy was first a cosmos chain: the second network built on go-cyber, beside bostrom, launched in 2022 so that two knowledge graphs could talk to each other. The words it was launched with are in [why spacepussy](why-spacepussy.md).

## what it was

| | |
|---|---|
| the software | go-cyber: a cosmos chain with a graph module, a rank computed on graphics cards, bandwidth, liquid staking |
| the coin | PUSSY, with a genesis supply of one exa and a drop to the cosmos communities |
| its end | halted at height 19,940,993, on 2026-06-14 at 08:36:41 UTC |
| what it left | 1,099,389,810,279,114,036 micro-units of the native coin in the bank, 23 tokens in all, and 29,112 cyberlinks recovered from its blocks |

## its tokens

It mirrored bostrom's structure of four tokens. The supply at genesis was one exa PUSSY: 18 heroes received 0.1 % each, and the rest stood in a community pool meant as gifts to the most active cosmos communities ([why spacepussy](why-spacepussy.md)).

The names are the burial's, as [`snapshot/holdings.py`](../snapshot/holdings.py) labels the tokens it carries.

| token | its name on the old chain | role |
|---|---|---|
| PUSSY | `pussy` | consensus and governance |
| LP | `liquidpussy` | the liquid form of staked PUSSY |
| A | `milliampere` | focus: the weight of a neuron's links in the rank |
| V | `millivolt` | will: the room to write cyberlinks |

The resource tokens do not return: what they priced, the new network prices with a stake on the link itself. The planned economy is in [economics](economics.md).

## how it was buried

Nothing was thrown away. The state at the halt was extracted on 2026-08-28 into files, every file was pinned by its content address, its sha256 and its size, and the list of pins is [`snapshot/manifest.json`](../snapshot/manifest.json). The tools that made it are beside it: `extract.py`, `holdings.py`, `graph_sample.py`. The burial is served at [pussy.bostrom.network](https://pussy.bostrom.network), and the page in [`snapshot/app/`](../snapshot/app/) checks a balance from a name, an address, a mnemonic, a key or a ledger, on the visitor's machine.

A later audit asked how much of the graph's content can still be fetched: [`audit/content-availability-2026-11-02.md`](../audit/content-availability-2026-11-02.md).

## how it comes back

The burial is the genesis of the new network. The balances are carried as they stood, delegated and unbonding coins return to their owners, liquidity positions are dissolved into their reserves, and every cyberlink is carried with its author and its place. The rules are in [`genesis/`](../genesis/), and the result is pinned in [`genesis/genesis.lock`](../genesis/genesis.lock).

An owner of the old chain is the same owner on the new one: a key that signed on the old chain controls the same balances, and an account that never signed claims its own through the legacy bridge.

## where its code is

The app, its modules, the proto files, the old web client and the two landings are on the branch [`legacy/go-cyber`](https://github.com/cyberia-to/space-pussy/tree/legacy/go-cyber), as they stood on 2026-11-22. They were removed from the default branch that day: this repository is now the network's genesis and configuration.
