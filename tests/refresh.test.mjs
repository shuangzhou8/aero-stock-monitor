import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface} from 'ethers';
import {ReadRpc,batch} from '../lib/rpc.mjs';
import {Engine} from '../lib/engine.mjs';
const abi=new Interface(['function f() view returns(uint256)']);
const item={to:'0x0000000000000000000000000000000000000001',name:'f',abi};
test('background batches queue one chunk and stop immediately after a network failure',async()=>{
 let calls=0,rejectRead;const rpc={request:()=>{calls++;return new Promise((_,reject)=>{rejectRead=reject;});}};
 const job=batch(rpc,Array(12000).fill(item),'latest',{chunk:80,priority:2,failFast:true});
 assert.equal(calls,1);rejectRead(Error('public RPC timeout'));
 await assert.rejects(job,/timeout/);assert.equal(calls,1);
});
test('foreground requests can finish while a background read remains pending',async()=>{
 const rpc=new ReadRpc();let release;rpc.perform=async task=>task.priority>=2?await new Promise(r=>release=r):'fresh';
 const background=rpc.request('eth_call',[],2);
 assert.equal(await rpc.request('eth_blockNumber',[],0),'fresh');
 release('done');assert.equal(await background,'done');assert.equal(rpc.queue.length,0);
});
test('rate limiting cools only its endpoint, leaving a healthy endpoint available next time',async()=>{
 const rpc=new ReadRpc();const first=rpc.urls[0],visited=[];rpc.transport=async(url,method)=>{visited.push(url);if(url===first)throw Object.assign(Error('rate limit'),{throttle:true});return method==='eth_chainId'?'0x2105':'0x123';};
 await assert.rejects(rpc.request('eth_blockNumber',[],0),/rate limit/);
 assert.equal(await rpc.request('eth_blockNumber',[],0),'0x123');
 assert.equal(visited.filter(x=>x===first).length,1);assert.ok(rpc.health.get(first).until>Date.now());
});
test('registry rediscovery cannot hold the foreground refresh promise open',async()=>{
 const e=new Engine();let release,started=false,finished=false;
 e.rpc.request=async method=>method==='eth_blockNumber'?'0x123':{hash:'valid'};
 e.discover=async()=>{started=true;await new Promise(r=>release=r);};
 e.scheduleDiscovery();await new Promise(setImmediate);assert.equal(started,true);assert.equal(e.state.discoveryRefreshing,true);
 e.update=async()=>{finished=true;};await e.refresh();assert.equal(finished,true);assert.equal(e.state.discoveryRefreshing,true);
 release();await e.discoveryPending;assert.equal(e.state.discoveryRefreshing,false);
});
