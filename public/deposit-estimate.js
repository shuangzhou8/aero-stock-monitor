const Q18=10n**18n;

// Shared by the local server and browser. Added principal dilutes its own
// active-liquidity share; APR is a 365-day, non-compounding extrapolation.
export function estimateDeposit({stakedU,minuteAero,minuteU,principalU,eligible}) {
 const principal=BigInt(principalU)*Q18;
 if(!eligible||stakedU===null||stakedU<=0n||minuteAero===null||principal<0n)return null;
 if(principal===0n)return {principal,sharePercent:0n,minuteAero:0n,minuteU:0n,annualU:0n,apr:null};
 const denominator=stakedU+principal;
 const personalAero=minuteAero*principal/denominator;
 const personalU=minuteU===null?null:minuteU*principal/denominator;
 return {principal,sharePercent:principal*100n*Q18/denominator,
  minuteAero:personalAero,minuteU:personalU,
  annualU:personalU===null?null:personalU*525600n,
  apr:minuteU===null?null:minuteU*525600n*100n*Q18/denominator};
}
export function parseFixed(value){
 if(value===null||value===undefined)return null;
 const match=/^(\d+)(?:\.(\d{0,18}))?$/.exec(String(value));
 return match?BigInt(match[1])*Q18+BigInt((match[2]||'').padEnd(18,'0')):null;
}
export function formatFixed(value){
 if(value===null||value===undefined)return null;
 return String(value/Q18)+'.'+((value%Q18).toString().padStart(18,'0').replace(/0+$/,'')||'0');
}
export function estimateRowDeposit(row,amount){
 if(!Number.isInteger(amount)||amount<0||amount>10000)return null;
 const result=estimateDeposit({stakedU:parseFixed(row.minStaked),minuteAero:parseFixed(row.perMinute),minuteU:parseFixed(row.minuteU),principalU:amount,eligible:row.rankingEligible});
 return result?Object.fromEntries(Object.entries(result).map(([key,value])=>[key,formatFixed(value)])):null;
}
