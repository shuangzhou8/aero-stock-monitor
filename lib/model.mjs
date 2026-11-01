import {formatUnits} from 'ethers';
import {pairValue,valueOf,amountsAtRange,minimumBounds,Q18} from './math.mjs';
import {estimateDeposit} from './deposit-estimate.mjs';
export const AERO='0x3f5bf3edac59d650d8fdf9657a71f2f904a3a4ee',USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',WETH='0x4200000000000000000000000000000000000006';
export const lower=x=>String(x).toLowerCase();
export const fixed=x=>x===null||x===undefined?null:formatUnits(x,18);
export function tokenMeta(raw){return {...raw,address:lower(raw.tokenAddress||raw.address),decimals:Number(raw.decimals),tier:Number(raw.tier)};}
export function normalizePool(p,index){const n={...p,address:lower(p.lp||p.address),token0:lower(p.token0),token1:lower(p.token1),factory:lower(p.factory),gauge:lower(p.gauge),nfpm:lower(p.nfpm),emissionsToken:lower(p.emissionsToken),index,chainId:8453,type:Number(p.poolType??p.type),tick:Number(p.tick),fee:Number(p.poolFee??p.fee)};for(const k of ['liquidity','gaugeLiquidity','reserve0','reserve1','staked0','staked1','sqrtRatio','emissions','emissionsCap','unstakedFee','windowStart','windowEnd','windowVolume0','windowVolume1','windowFee0','windowFee1'])n[k]=BigInt(p[k]??0);return n;}
export function stockPool(p,tokens){const tier=t=>{const v=tokens.get(t)?.tier;return v===undefined||v===0?Infinity:v;};return Math.max(tier(p.token0),tier(p.token1))===50;}
export function rowFromPool(p,tokens,prices,source){
 const t0=tokens.get(p.token0),t1=tokens.get(p.token1);if(!t0||!t1)throw Error('代币元数据不完整');
 const bounds=minimumBounds(p.tick,p.type),full=pairValue(p.reserve0,p.reserve1,t0,t1,prices),minStake=bounds?pairValue(p.staked0,p.staked1,t0,t1,prices):null;
 const amounts=bounds?amountsAtRange(p.liquidity,p.sqrtRatio,bounds.lower,bounds.upper):null,minTotal=amounts?pairValue(...amounts,t0,t1,prices):null;
 const rewardKnown=p.emissionsToken===AERO,emissions=rewardKnown?(p.gaugeAlive?p.emissions:0n):null,price=prices.get(AERO)?.price,minute=emissions===null?null:emissions*60n,hour=emissions===null?null:emissions*3600n;
 const minuteU=minute===null?null:valueOf(minute,18,price),hourU=hour===null?null:valueOf(hour,18,price);
 const eligible=!!bounds&&p.gaugeAlive&&p.gaugeLiquidity>0n&&minStake!==null&&minStake>0n&&minute!==null;
 const ratio=eligible?minute*Q18/minStake:null,valueRatio=eligible&&minuteU!==null?minuteU*Q18/minStake:null;
 const scenario=principalU=>{const raw=estimateDeposit({stakedU:minStake,minuteAero:minute,minuteU,principalU,eligible});return raw?Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,fixed(v)])):null;};
 const deposit100=scenario(100),deposit1000=scenario(1000);
 const fees=pairValue(p.windowFee0,p.windowFee1,t0,t1,prices),volume=pairValue(p.windowVolume0/2n,p.windowVolume1/2n,t0,t1,prices);
 const widths={1:10n,10:50n,50:300n,100:500n,150:750n,200:1000n,250:1250n},year=31536000n;
 const approximateDenom=liquidity=>bounds?valueOf(liquidity*p.sqrtRatio*(widths[p.type]||300n)/((1n<<96n)*10000n),t1.decimals,prices.get(t1.address)?.price):pairValue(p.staked0,p.staked1,t0,t1,prices);
 const denom=approximateDenom(p.gaugeLiquidity),feesDenom=bounds?approximateDenom(p.liquidity):full;
 const annual=emissions===null?null:valueOf(emissions*year,18,price),elapsed=p.windowEnd-p.windowStart;
 const annualFees=fees===null||elapsed<=0n?null:fees*year/elapsed*(bounds?1000000n-p.unstakedFee:1000000n)/1000000n;
 const apr=annual===null||denom===null||denom<=0n?null:annual*100n*Q18/denom,feeApr=annualFees===null||feesDenom===null||feesDenom<=0n?null:annualFees*100n*Q18/feesDenom;
 const reason=!bounds?'基础池没有最小 tick 区间':!p.gaugeAlive?'Gauge 已停用':p.gaugeLiquidity===0n?'当前区间没有已质押流动性':minStake===null?'代币可靠报价不足':!rewardKnown?'奖励代币不是已核实的新 AERO':minStake===0n?'最小区间质押价值为零':null;
 return {address:p.address,pair:t0.symbol+'/'+t1.symbol,token0:t0,token1:t1,type:p.type,feePercent:p.fee/10000,factory:p.factory,gauge:p.gauge,nfpm:p.nfpm,active:!!p.gaugeAlive,tick:p.tick,bounds,
 source,raw:{reserve0:String(p.reserve0),reserve1:String(p.reserve1),staked0:String(p.staked0),staked1:String(p.staked1),liquidity:String(p.liquidity),stakedLiquidity:String(p.gaugeLiquidity),emissions:String(p.emissions),sqrtRatio:String(p.sqrtRatio)},
 tvl:fixed(full),minStaked:fixed(minStake),minTotal:fixed(minTotal),stakedNav:p.type<=0?{value:fixed(pairValue(p.staked0,p.staked1,t0,t1,prices)),complete:true,source,kind:'basic-pool-staked-share'}:null,
 perSecond:fixed(emissions),perMinute:fixed(minute),minuteU:fixed(minuteU),perHour:fixed(hour),hourU:fixed(hourU),ratio:fixed(ratio),valueRatio:fixed(valueRatio),linearAeroPer1000:ratio===null?null:fixed(ratio*1000n),linearUPer1000:valueRatio===null?null:fixed(valueRatio*1000n),aeroPer1000:deposit1000?.minuteAero??null,uPer1000:deposit1000?.minuteU??null,deposit100,deposit1000,apr100:deposit100?.apr??null,apr1000:deposit1000?.apr??null,
 volume48h:fixed(volume),fees48h:fixed(fees),aeroApr:fixed(apr),feesApr:fixed(feeApr),rankingEligible:eligible,reason,
 price0:fixed(prices.get(t0.address)?.price||null),price1:fixed(prices.get(t1.address)?.price||null),aeroPrice:fixed(price||null),depositUrl:'https://app.aero.xyz/deposit/8453-'+p.address,
 };}
