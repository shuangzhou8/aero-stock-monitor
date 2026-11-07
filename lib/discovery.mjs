import {normalizePool,tokenMeta,lower,fixed,AERO,poolCategory} from './model.mjs';
const ZERO='0x'+'0'.repeat(40);
export function facts(raw,tokens,source){
 const p=normalizePool(raw),known=p.emissionsToken===AERO,rate=known&&p.gaugeAlive?p.emissions:0n;
 return {address:p.address,pair:[p.token0,p.token1].map(a=>tokens.get(a)?.symbol||a).join('/'),token0:p.token0,token1:p.token1,
  category:poolCategory(p,tokens)||'other',type:p.type,feePercent:p.fee/10000,gauge:p.gauge,createdAt:Number(p.createdAt||0),
  gaugeAlive:!!p.gaugeAlive,emissionsToken:p.emissionsToken,perHour:fixed(rate*3600n),perSecond:fixed(rate),
  rewardStatus:rate>0n?'active':!p.gaugeAlive||p.gauge===ZERO?'inactive':known?'waiting':'other-token',
  source:{block:Number(source.block),hash:source.hash||null,timestamp:source.timestamp||null}};
}
export class DiscoveryBook{
 constructor(seedPools,seedTokens,source){
  this.data={version:1,chainId:8453,baseline:{block:Number(source.block),poolCount:seedPools.length},lastCheckedAt:null,source:null,known:{},events:[]};
  const tokens=new Map(seedTokens.map(t=>{const m=tokenMeta(t);return[m.address,m];}));
  for(const raw of seedPools){const p=facts(raw,tokens,source);this.data.known[p.address]={...p,baseline:true,everAeroActive:p.rewardStatus==='active'};}
 }
 restore(data){
  if(data?.version!==1||data.chainId!==8453||!data.baseline||!data.known||typeof data.known!=='object'||!Array.isArray(data.events))throw Error('新增池记录格式或网络不匹配');
  for(const [address,p] of Object.entries(data.known))if(address!==lower(p.address)||!/^0x[0-9a-f]{40}$/.test(address))throw Error('新增池地址记录不完整');
  if(data.events.some(e=>!['pool-added','aero-enabled'].includes(e.kind)||!data.known[e.address]||typeof e.id!=='string'))throw Error('新增池事件记录不完整');
  this.data=structuredClone(data);return this;
 }
 observe(pools,tokenRows,source,now=Date.now()){
  if(this.data.source&&Number(source.block)<this.data.source.block)return [];
  if(!/^0x[0-9a-f]{64}$/i.test(source.hash||'')||!Number.isFinite(Number(source.timestamp)))throw Error('新增池来源区块未完整核实');
  if(new Set(pools.map(p=>lower(p.lp||p.address))).size!==pools.length)throw Error('池地址重复，未更新新增记录');
  const tokens=new Map(tokenRows.map(t=>{const m=tokenMeta(t);return[m.address,m];})),next=structuredClone(this.data),events=[];
  for(const raw of pools){const p=facts(raw,tokens,source),prior=next.known[p.address],active=p.rewardStatus==='active';
   const kind=!prior?'pool-added':active&&(!prior.everAeroActive||prior.gauge!==p.gauge)?'aero-enabled':null;
   if(kind){const event={id:[p.address,kind,p.gauge].join(':'),kind,address:p.address,detectedAt:now,detectedBlock:Number(source.block)};
    if(!next.events.some(v=>v.id===event.id)){next.events.push(event);events.push(event);}}
   next.known[p.address]={...p,baseline:prior?.baseline??false,firstSeenAt:prior?.firstSeenAt??now,everAeroActive:!!prior?.everAeroActive||active};
  }
  next.lastCheckedAt=now;next.currentCount=pools.length;next.source={block:Number(source.block),hash:source.hash,timestamp:source.timestamp};this.data=next;return events;
 }
 snapshot(rows=[]){
  const fresh=new Map(rows.filter(r=>!r.stale&&!r.source?.seed).map(r=>[r.address,r]));
  const events=this.data.events.map(e=>{const p=this.data.known[e.address],r=fresh.get(e.address);return {...p,...e,
    ...(r&&r.source?.block>=p.source.block?{perSecond:r.perSecond,perHour:r.perHour,gauge:r.gauge,gaugeAlive:r.active,source:r.source,rewardStatus:!r.active?'inactive':r.perHour===null?'other-token':Number(r.perHour)>0?'active':'waiting'}:{}),
    depositUrl:'https://app.aero.xyz/deposit/8453-'+e.address};}).sort((a,b)=>b.detectedAt-a.detectedAt||b.createdAt-a.createdAt||a.address.localeCompare(b.address));
  return {baseline:this.data.baseline,checkedAt:this.data.lastCheckedAt,source:this.data.source,
   registeredCount:this.data.currentCount??Object.keys(this.data.known).length,addedCount:events.filter(e=>e.kind==='pool-added').length,
   enabledCount:events.filter(e=>e.kind==='aero-enabled').length,events};
 }
}
