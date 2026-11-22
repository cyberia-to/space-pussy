# run a node

What it takes to stand a node of pussy, to mine on it and to look at it. The network is not launched; the same steps with `--chain pussy-rc` and the rehearsal's genesis join the rehearsal network.

## the binary

The node is [cybernode](https://github.com/cyberia-to/cybernode), one binary for every network. From a checkout of it:

```sh
cargo install --path rs
```

## the genesis

The node needs the genesis file of the network it joins. Build it from this repository and check it against the lock:

```sh
cybernode genesis build --chain pussy --snapshot snapshot --out pussy.genesis
cybernode genesis verify pussy.genesis --root
```

The particle `verify` prints is the chain id in [genesis/genesis.lock](../genesis/genesis.lock). A file with another particle is another network.

## the node

```sh
cybernode node --chain pussy --genesis pussy.genesis --home ~/.pussy \
  --bind 127.0.0.1:7781 --radio 0.0.0.0:7791 --peers peers.toml --moniker my-node
```

- `--bind` is the node's API, kept on the machine.
- `--radio` is the wire to other nodes, UDP, open to the network.
- `--peers` is a file of the endpoint ids of nodes to meet; `cybernode node id --home ~/.pussy` prints this node's own.

The node's state is under `--home`. The defaults of the ports are in [network.toml](../network.toml).

## mining

```sh
cybernode mine --address NEURON --chain pussy --node http://127.0.0.1:7781
cybernode mine bench
```

`--address` is the neuron the block's reward goes to. `bench` measures what this machine does on each of its backends.

## looking at it

- the node's own API: `curl http://127.0.0.1:7781/status`
- the [explorer](https://spacepussy.ai/explorer/): blocks, signals, neurons, particles, epochs, stakes; `?api=<base>` points it at another node

## what the rules are

- the chain, the wire and their conformance: [cybernode specs](https://github.com/cyberia-to/cybernode/tree/main/specs)
- this network's values: [network.toml](../network.toml)
