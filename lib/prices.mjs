// SPDX-License-Identifier: GPL-2.0-or-later
// Independent public-release engine: depth-filtered spot quotes from public pool state.
const Q96 = 1n << 96n, Q192 = Q96 * Q96, UINT256 = (1n << 256n) - 1n;
const lower = address => address.toLowerCase();
const units = decimals => 10n ** BigInt(decimals);
const min = (a, b) => a < b ? a : b;

export function packReserves(reserve0, reserve1) {
  for (const reserve of [reserve0, reserve1]) {
    if (typeof reserve !== 'bigint' || reserve < 0n || reserve > UINT256) {
      throw Error('Reserve must be an unsigned 256-bit integer');
    }
  }
  return (reserve0 << 256n) | reserve1;
}

export function buildPricePools({config, chainId, tokens, pools}) {
  const chain = config.aeroConfig.chains[chainId];
  const stable = lower(chain.STABLE_TOKEN.address);
  const connectors = new Set(chain.CONNECTOR_TOKENS.map(token => lower(token.address)));
  connectors.add(stable);
  const decimals = new Map(tokens.map(token => [lower(token.address), token.decimals]));
  for (const token of [chain.STABLE_TOKEN, ...chain.CONNECTOR_TOKENS]) {
    decimals.set(lower(token.address), token.decimals);
  }
  const wanted = new Set([...tokens.map(token => lower(token.address)), ...connectors]);
  const relevant = pools.filter(pool => pool.chainId === chainId &&
    decimals.has(lower(pool.token0)) && decimals.has(lower(pool.token1)) &&
    ((connectors.has(lower(pool.token0)) && wanted.has(lower(pool.token1))) ||
     (connectors.has(lower(pool.token1)) && wanted.has(lower(pool.token0)))));
  return {stable, connectors, decimals, tokens, pools: relevant};
}

// Whole quote tokens per whole target token, expressed at the requested scale.
function spotRatio(pool, state, targetIs0, decimals0, decimals1, scale) {
  if (pool.type > 0) {
    if (!state.price || !state.liquidity ||
        (state.tick !== undefined &&
         (state.tick < -887272 + pool.type || state.tick >= 887272 - pool.type))) return 0n;
    const squared = state.price * state.price;
    return targetIs0
      ? squared * units(decimals0) * scale / (Q192 * units(decimals1))
      : Q192 * units(decimals1) * scale / (squared * units(decimals0));
  }
  const reserve0 = state.reserve0 ?? (state.price >> 256n);
  const reserve1 = state.reserve1 ?? (state.price & UINT256);
  if (!reserve0 || !reserve1) return 0n;
  if (pool.type === 0) {
    // Stable invariant x*y*(x*x+y*y); its derivative gives the marginal price.
    const x = reserve0 * scale / units(decimals0), y = reserve1 * scale / units(decimals1);
    const numerator = 3n * x * x * y + y * y * y;
    const denominator = x * x * x + 3n * x * y * y;
    if (!numerator || !denominator) return 0n;
    return targetIs0 ? numerator * scale / denominator : denominator * scale / numerator;
  }
  return targetIs0
    ? reserve1 * units(decimals0) * scale / (reserve0 * units(decimals1))
    : reserve0 * units(decimals1) * scale / (reserve1 * units(decimals0));
}

function candidateQuote(pool, state, target, quote, quoteValue, decimals, scale) {
  if (!state) return null;
  const token0 = lower(pool.token0), is0 = target === token0;
  const d0 = decimals.get(token0), d1 = decimals.get(lower(pool.token1));
  const targetReserve = is0 ? state.reserve0 : state.reserve1;
  if (targetReserve === undefined || targetReserve < units(Math.floor(decimals.get(target) / 2))) return null;
  const ratio = spotRatio(pool, state, is0, d0, d1, scale);
  if (!ratio) return null;
  let quoteReserve = is0 ? state.reserve1 : state.reserve0;
  if (pool.type > 0) {
    const virtualQuoteReserve = is0 ? state.liquidity * state.price / Q96 : state.liquidity * Q96 / state.price;
    quoteReserve = min(quoteReserve, virtualQuoteReserve);
  }
  let weight = quoteReserve * quoteValue.price / units(decimals.get(quote));
  if (quoteValue.weight !== undefined) weight = min(weight, quoteValue.weight);
  return {price: ratio * quoteValue.price / scale, weight, pool: lower(pool.address)};
}

function chooseQuote(candidates, minWeight, tolerancePct) {
  const eligible = candidates.filter(row => row.price > 0n && row.weight >= minWeight && row.weight > 0n);
  if (!eligible.length) return {price: 0n, weight: 0n};
  eligible.sort((a, b) => a.price < b.price ? -1 : a.price > b.price ? 1 : 0);
  const halfway = (eligible.reduce((total, row) => total + row.weight, 0n) + 1n) / 2n;
  let cumulative = 0n, median = eligible[0].price;
  for (const row of eligible) {
    cumulative += row.weight;
    if (cumulative >= halfway) { median = row.price; break; }
  }
  const tolerance = BigInt(Math.round(tolerancePct * 1000));
  const retained = eligible.filter(row => {
    const difference = row.price > median ? row.price - median : median - row.price;
    return difference * 100000n <= median * tolerance;
  });
  // Select the deepest retained pool's spot price; ties use the pool address.
  retained.sort((a, b) => a.weight > b.weight ? -1 : a.weight < b.weight ? 1 : a.pool.localeCompare(b.pool));
  return {...retained[0], anchor: median};
}

export function computePrices({pricePools, poolStates, maxHops = 3,
  minWeight = 1000n * 10n ** 36n, tolerancePct = 33, dec = 36, resultDec = dec}) {
  const {stable, connectors, decimals, tokens, pools} = pricePools, scale = units(dec);
  const states = new Map([...poolStates].map(([key, value]) => [lower(key), value]));
  const prices = new Map([[stable, {price: scale, round: 0}]]);
  const allTargets = new Set([...tokens.map(token => lower(token.address)), ...connectors]);
  const quoteRound = (targets, round) => {
    const proposals = new Map();
    for (const pool of pools) {
      const left = lower(pool.token0), right = lower(pool.token1);
      for (const [target, quote] of [[left, right], [right, left]]) {
        if (!targets.has(target) || prices.get(target)?.price > 0n || !(prices.get(quote)?.price > 0n)) continue;
        const proposal = candidateQuote(pool, states.get(lower(pool.address)), target, quote, prices.get(quote), decimals, scale);
        if (proposal) { const list = proposals.get(target) ?? []; list.push(proposal); proposals.set(target, list); }
      }
    }
    let resolved = false;
    for (const [target, candidates] of proposals) {
      const chosen = chooseQuote(candidates, minWeight, tolerancePct);
      if (chosen.price > 0n) { prices.set(target, {...chosen, round}); resolved = true; }
    }
    return resolved;
  };
  let round = 1;
  for (; round < maxHops; round++) if (!quoteRound(connectors, round)) break;
  quoteRound(allTargets, round);
  for (const target of allTargets) if (!prices.has(target)) prices.set(target, {price: 0n, weight: 0n});
  const rescale = value => value === undefined ? undefined : resultDec < dec
    ? value / units(dec - resultDec) : value * units(resultDec - dec);
  return new Map([...prices].map(([token, value]) => [token, {
    ...value, price: rescale(value.price), weight: rescale(value.weight), anchor: rescale(value.anchor)
  }]));
}
