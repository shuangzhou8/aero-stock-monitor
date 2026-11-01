# Third-party sources and notices

## TickMath

`lib/math.mjs` contains a JavaScript adaptation of `getSqrtRatioAtTick` and its integer constants from [Uniswap v3-core TickMath.sol](https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/TickMath.sol), whose file-specific license is `GPL-2.0-or-later`.

Original project: Uniswap v3-core, Copyright (c) 2021 Uniswap Labs. The adaptation uses JavaScript BigInt and exposes the operations needed for this read-only monitor. The GPL v2 license text is included in `LICENSE`; the project is distributed under GPL v2 or any later version.

## Quote implementation

The public release's `lib/prices.mjs` is an independently written implementation of pool spot-ratio calculations, depth filtering and route propagation. It does not bundle Aero's downloaded or minified frontend worker. It selects a single retained pool quote rather than reproducing the earlier local monitor's frontend-derived weighted average.

## Runtime dependencies

Dependencies are downloaded by `npm ci` and are not vendored in this repository. Their upstream notices remain in the installed packages:

- [ethers](https://github.com/ethers-io/ethers.js): MIT.
- [undici](https://github.com/nodejs/undici): MIT.
- Transitive packages and versions are recorded in `package-lock.json`.

## Public data and token icons

`data/abis.json`, `data/registry.json` and `data/tokens.json` contain contract interfaces and public Base chain data read through Aero's Sugar contract. They contain no user wallet credentials or private account records. See `docs/DATA_SOURCES.md` for provenance.

Token icons are requested at runtime from [SmolDapp/tokenAssets](https://github.com/SmolDapp/tokenAssets) and are not copied into this repository. Token names, logos, and protocol trademarks remain the property of their respective owners; the source-code license does not grant trademark rights.
