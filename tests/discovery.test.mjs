import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Interface,formatUnits} from 'ethers';
import {DiscoveryBook} from '../lib/discovery.mjs';
import {normalizePool,tokenMeta,stockPool,watchedPool,poolCategory,AERO} from '../lib/model.mjs';
import {Engine} from '../lib/engine.mjs';
const fixture=JSON.parse(await readFile(new URL('../data/registry.json',import.meta.url))),tokenFixture=JSON.parse(await readFile(new URL('../data/tokens.json',import.meta.url)));
const tokens=new Map(tokenFixture.tokens.map(t=>{const m=tokenMeta(t);return[m.address,m];})),base=fixture.pools.find(p=>p.lp.toLowerCase()==='0x66dcd42e6314b287110922ae36cb2a8bdeecc153');
const H='0x'+'12'.repeat(32),source={block:10,hash:H,timestamp:1000},next={block:20,hash:H,timestamp:2000};
const seed={...base,gaugeAlive:false,emissions:'0'},added={...base,lp:'0x'+'11'.repeat(20),gaugeAlive:false,emissions:'0'};
test('gold is included without classifying it as stock, including a listed ETH counterparty',()=>{
 const p=fixture.pools.find(p=>p.lp.toLowerCase()==='0x108c5c97155d35847c61683f1a254d9c0470a591'),gold=normalizePool(p);
 assert.equal(stockPool(gold,tokens),false);assert.equal(watchedPool(gold,tokens),true);assert.equal(poolCategory(gold,tokens),'gold');
 assert.equal(watchedPool({...gold,token0:'0x4200000000000000000000000000000000000006'},tokens),true);
 assert.equal(watchedPool({...gold,token0:'0x'+'99'.repeat(20)},tokens),false);
});
test('new registration and first reward activation are separate and retain exact hourly units',()=>{
 const book=new DiscoveryBook([seed],tokenFixture.tokens,source),active={...seed,gaugeAlive:true,emissionsToken:AERO,emissions:'1234567890123456789'};
 book.observe([active,added],tokenFixture.tokens,next,3000);const s=book.snapshot();
 assert.equal(s.addedCount,1);assert.equal(s.enabledCount,1);assert.equal(s.events.find(e=>e.kind==='pool-added').perHour,'0.0');
 assert.equal(s.events.find(e=>e.kind==='aero-enabled').perHour,formatUnits(1234567890123456789n*3600n,18));
 book.observe([active,added],tokenFixture.tokens,{...next,block:21},4000);assert.equal(book.snapshot().events.length,2);
});
test('a newly recorded pool can activate later, without repeat alerts when an epoch resumes',()=>{
 const book=new DiscoveryBook([seed],tokenFixture.tokens,source);book.observe([seed,added],tokenFixture.tokens,next);
 const active={...added,gaugeAlive:true,emissionsToken:AERO,emissions:'100000000000000'};
 book.observe([seed,active],tokenFixture.tokens,{...next,block:21});assert.equal(book.snapshot().enabledCount,1);
 book.observe([seed,{...active,emissions:'0'}],tokenFixture.tokens,{...next,block:22});book.observe([seed,active],tokenFixture.tokens,{...next,block:23});assert.equal(book.snapshot().enabledCount,1);
});
test('persisted discoveries survive reload without manufacturing new pools',()=>{
 const book=new DiscoveryBook([seed],tokenFixture.tokens,source);book.observe([seed,added],tokenFixture.tokens,next);
 const other=new DiscoveryBook([],[],source).restore(JSON.parse(JSON.stringify(book.data)));other.observe([seed,added],tokenFixture.tokens,{...next,block:21});
 assert.equal(other.snapshot().addedCount,1);assert.equal(other.snapshot().baseline.poolCount,1);
 assert.throws(()=>other.restore({...book.data,chainId:1}),/网络/);
});
test('older, duplicate or unanchored registry observations cannot replace accepted history',()=>{
 const book=new DiscoveryBook([seed],tokenFixture.tokens,source);book.observe([seed,added],tokenFixture.tokens,next);const before=JSON.stringify(book.data);
 book.observe([seed],tokenFixture.tokens,source);assert.equal(JSON.stringify(book.data),before);
 assert.throws(()=>book.observe([added,added],tokenFixture.tokens,{...next,block:21}),/重复/);
 assert.throws(()=>book.observe([seed],tokenFixture.tokens,{...next,block:21,hash:null}),/未完整/);assert.equal(JSON.stringify(book.data),before);
});
test('only a fresh later pool snapshot can replace discovery reward rates',()=>{
 const book=new DiscoveryBook([seed],tokenFixture.tokens,source);book.observe([seed,added],tokenFixture.tokens,next);
 const row={address:added.lp,active:true,gauge:added.gauge,perSecond:'1.0',perHour:'3600.0',source:{block:21,timestamp:2100}};
 assert.equal(book.snapshot([row]).events[0].perHour,'3600.0');
 assert.equal(book.snapshot([{...row,stale:true}]).events[0].perHour,'0.0');
 assert.equal(book.snapshot([{...row,source:{...row.source,seed:true}}]).events[0].perHour,'0.0');
});
test('a non-AERO reward is never labeled as AERO emission',()=>{
 const book=new DiscoveryBook([],tokenFixture.tokens,source);book.observe([{...added,gaugeAlive:true,emissions:'1000000000000000000',emissionsToken:base.token0}],tokenFixture.tokens,next);
 assert.equal(book.snapshot().events[0].perHour,'0.0');assert.equal(book.snapshot().events[0].rewardStatus,'other-token');
});
test('incomplete pool or token pagination and a reorg do not commit discovery',async()=>{
 const abis=JSON.parse(await readFile(new URL('../data/abis.json',import.meta.url))),sugar=new Interface([...abis.pool,...abis.token]);
 const tuple=(name,row)=>sugar.getFunction(name).outputs[0].arrayChildren.components.map(c=>row[c.name]);
 for(const mode of ['pool','token','reorg']){
  const e=new Engine();e.sugar=sugar;let committed=false;e.setRegistry=()=>{committed=true;};
  const ts=tokenFixture.tokens.slice(0,2);e.call=async name=>name==='count'?[mode==='pool'?2n:1n]:name==='tokenCount'?[mode==='token'?3n:2n]:name==='tokens'?[ts.map(t=>tuple('tokens',t))]:[[tuple('all',base)]];
  e.rpc.request=async()=>({hash:'0x'+'34'.repeat(32),timestamp:'0x7d0'});
  await assert.rejects(e.discover('0x14',H),mode==='reorg'?/区块变化/:/未完整/);assert.equal(committed,false);
 }
});
