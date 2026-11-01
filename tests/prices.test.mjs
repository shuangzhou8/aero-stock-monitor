import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPricePools, computePrices, packReserves} from '../lib/prices.mjs';

const USDC = '0x0000000000000000000000000000000000000001';
const STOCK = '0x0000000000000000000000000000000000000002';
const CONNECTOR = '0x0000000000000000000000000000000000000003';
const Q18 = 10n ** 18n, Q6 = 10n ** 6n;
const tokens = [USDC, STOCK, CONNECTOR].map(address => ({address, decimals: 6}));
function pool(id, token0, token1, reserve0, reserve1, type = -1, extra = {}) {
  return {address: '0x' + String(id).padStart(40, '0'), chainId: 8453, token0, token1, type,
    reserve0: BigInt(reserve0) * Q6, reserve1: BigInt(reserve1) * Q6, ...extra};
}
function quote(pools, options = {}) {
  const config = {aeroConfig: {chains: {8453: {
    STABLE_TOKEN: tokens[0], CONNECTOR_TOKENS: [tokens[0], tokens[2]]
  }}}};
  const pricePools = buildPricePools({config, chainId: 8453, pools, tokens});
  const poolStates = new Map(pools.map(p => [p.address, {...p,
    price: p.type > 0 ? (p.sqrt ?? 1n << 96n) : packReserves(p.reserve0, p.reserve1)}]));
  return computePrices({pricePools, poolStates, resultDec: 18, ...options});
}

test('whole-token quotes account for decimals and select the deepest valid pool', () => {
  const prices = quote([pool(1, USDC, STOCK, 10000, 5000), pool(2, USDC, STOCK, 5000, 2500)]);
  assert.equal(prices.get(USDC).price, Q18);
  assert.equal(prices.get(STOCK).price, 2n * Q18);
});

test('thin pools and dust cannot price an otherwise unknown token', () => {
  assert.equal(quote([pool(1, USDC, STOCK, 999, 500)]).get(STOCK).price, 0n);
  assert.equal(quote([pool(1, USDC, STOCK, 10000, 0)]).get(STOCK).price, 0n);
});

test('outlier quotes do not displace a deeper consensus quote', () => {
  const prices = quote([pool(1, USDC, STOCK, 10000, 5000),
    pool(2, USDC, STOCK, 8000, 4000), pool(3, USDC, STOCK, 2000, 20)]);
  assert.equal(prices.get(STOCK).price, 2n * Q18);
});

test('connector paths propagate the limiting route depth and obey the hop budget', () => {
  const pools = [pool(1, USDC, CONNECTOR, 4000, 2000), pool(2, CONNECTOR, STOCK, 6000, 2000)];
  const prices = quote(pools);
  assert.equal(prices.get(CONNECTOR).price, 2n * Q18);
  assert.equal(prices.get(STOCK).price, 6n * Q18);
  assert.equal(prices.get(STOCK).weight, 4000n * Q18);
  assert.equal(quote(pools, {maxHops: 1}).get(STOCK).price, 0n);
});

test('balanced stable pools and an equal-decimal CL price produce one-unit quotes', () => {
  assert.equal(quote([pool(1, USDC, STOCK, 5000, 5000, 0)]).get(STOCK).price, Q18);
  assert.equal(quote([pool(2, USDC, STOCK, 5000, 5000, 10,
    {liquidity: 5000n * Q6, tick: 0})]).get(STOCK).price, Q18);
  assert.equal(quote([pool(2, USDC, STOCK, 5000, 5000, 10,
    {liquidity: 0n, tick: 0})]).get(STOCK).price, 0n);
});
