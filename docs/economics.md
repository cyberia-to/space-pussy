# the economy of PUSSY

What PUSSY is for, what the node pays today, what is proposed and what is still open. The three are kept apart: a figure moves from proposed to running only when the node carries it.

## the job

PUSSY is the coin of pussy, the community network: wide, warm, fast. It is one of three coins with three jobs ([tokens](https://cyber.page/tokens/)):

| | CYB | BOOT | PUSSY |
|---|---|---|---|
| network | cyber | bostrom | pussy |
| job | root money | bootloader | community |
| purpose | hard money | small kernel | fast growth |

One policy cannot hold three opposite needs. The money of cyber must be as hard as arithmetic. The kernel must fit in a device and stay clean. The community must grow faster than it decays, so it can afford what the root money cannot.

## running: what the node carries today

The rules below are [`network.toml`](../network.toml)'s, and the rule values — the epoch, the seven-day lock, the pool's half, the cap on a position's reward — are the same for both networks. The supply at genesis is pussy's own, from [`genesis/genesis.lock`](../genesis/genesis.lock), and the subsidy is 1 % a year of it: a network with another burial has another figure.

| | |
|---|---|
| the supply at genesis | 1,099,389,810,279,114,036 micro-units, the bank supply of the old chain at its halt ([`genesis/genesis.lock`](../genesis/genesis.lock)) |
| new coins | 1 % of the genesis supply a year: 10,458,426,657 micro-units a block, constant |
| who receives them | the miner of a block, and the focus pool, which takes at most half |
| a stake | a position on a cyberlink, locked seven days |
| an epoch | 240 blocks: focus is recomputed, positions are settled |
| a position's reward | at most 1 % of the stake it added, in an epoch |
| surprise and karma | constants at launch |

The old resource tokens are carried as balances and have no function in the new network.

## proposed: the community's own policy

Proposed on 2026-09-27 and open until the genesis fixes it. None of it is in the node, and none of its figures is pinned in this repository: the table restates the external source below as it stood on that date.

| | proposed for PUSSY | for comparison, BOOT |
|---|---|---|
| the supply | up for years | up once |
| emission | nine times the base in the first year, then halving each year to a floor of 3 % a year | three times the base in the first year, then nothing |
| who receives | work, and serving bytes by particle | work |
| writing a link | a lock | a burn that grows with how full the graph is |
| a link lives | until unlocked | forever |
| capacity | no limit | 2²² links |
| a neuron's weight | the square root of its stake | capped at 5 % of the effective stake |
| dormant balances | after a year, burned and minted again to the subsidy: to work, never to heads | burned |
| the root fee | pays it in BOOT, for its name and its finality | receives it and burns it |
| registering a book | 2 % of the book's own premint | 10 % |
| parameters | by vote | fixed |

Why these: a community network wants many neurons and many books, so it locks where the kernel burns, mints for years where the kernel mints once, and prices a registration low. Emission goes only to work. The root fee is the one bond between the two networks.

The source of the proposal, with its notes: [tokens](https://cyber.page/tokens/).

## open: what the launch decides

The launch being prepared is this network's, so these are decided here first. Two projects of the launch replace the constant subsidy and the constant surprise.

- [the hybrid economy](https://github.com/cyberia-to/soft3/blob/release/phase1/projects/hybrid-economy-at-genesis.md): a budget that follows how much is staked, so that the reward for staking is high when little is staked and falls as the stake grows.
- [complete rewards](https://github.com/cyberia-to/soft3/blob/release/phase1/projects/complete-rewards.md): the surprise, karma and the losing side's payment, which close the loop from a stake to focus.

The law itself: [tru specs/rewards.md](https://github.com/cyberia-to/tru/blob/master/specs/rewards.md). How a stake on a link is settled, with a calculator: [truth, from claim to payout](https://cyberia.blog/soft3/tru/docs/explanation/truth/).

## before

The economy of the first chain is in [history](history.md).
