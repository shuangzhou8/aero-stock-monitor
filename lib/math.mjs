// SPDX-License-Identifier: GPL-2.0-or-later
// sqrtAtTick adapts Uniswap v3-core TickMath.getSqrtRatioAtTick. See THIRD_PARTY_NOTICES.md.
// Integer TickMath port; constants from official verified Sugar TickMath (Uniswap v3, GPL-2.0-or-later).
export function sqrtAtTick(tick){if(!Number.isInteger(tick)||Math.abs(tick)>887272)throw Error('Tick out of range');const n=Math.abs(tick);let r=(n&1)?0xfffcb933bd6fad37aa2d162d1a594001n:1n<<128n;
if(n&0x2)r=r*0xfff97272373d413259a46990580e213an>>128n;
if(n&0x4)r=r*0xfff2e50f5f656932ef12357cf3c7fdccn>>128n;
if(n&0x8)r=r*0xffe5caca7e10e4e61c3624eaa0941cd0n>>128n;
if(n&0x10)r=r*0xffcb9843d60f6159c9db58835c926644n>>128n;
if(n&0x20)r=r*0xff973b41fa98c081472e6896dfb254c0n>>128n;
if(n&0x40)r=r*0xff2ea16466c96a3843ec78b326b52861n>>128n;
if(n&0x80)r=r*0xfe5dee046a99a2a811c461f1969c3053n>>128n;
if(n&0x100)r=r*0xfcbe86c7900a88aedcffc83b479aa3a4n>>128n;
if(n&0x200)r=r*0xf987a7253ac413176f2b074cf7815e54n>>128n;
if(n&0x400)r=r*0xf3392b0822b70005940c7a398e4b70f3n>>128n;
if(n&0x800)r=r*0xe7159475a2c29b7443b29c7fa6e889d9n>>128n;
if(n&0x1000)r=r*0xd097f3bdfd2022b8845ad8f792aa5825n>>128n;
if(n&0x2000)r=r*0xa9f746462d870fdf8a65dc1f90e061e5n>>128n;
if(n&0x4000)r=r*0x70d869a156d2a1b890bb3df62baf32f7n>>128n;
if(n&0x8000)r=r*0x31be135f97d08fd981231505542fcfa6n>>128n;
if(n&0x10000)r=r*0x9aa508b5b7a84e1c677de54f3e99bc9n>>128n;
if(n&0x20000)r=r*0x5d6af8dedb81196699c329225ee604n>>128n;
if(n&0x40000)r=r*0x2216e584f5fa1ea926041bedfe98n>>128n;
if(n&0x80000)r=r*0x48a170391f7dc42444e8fa2n>>128n;
if(tick>0)r=((1n<<256n)-1n)/r;return (r>>32n)+(r% (1n<<32n)?1n:0n);}
export function amountsAtRange(liquidity,sqrt,lower,upper){const l=BigInt(liquidity),s=BigInt(sqrt),a=sqrtAtTick(lower),b=sqrtAtTick(upper),q=1n<<96n;return [s<b?l*q*(b-(s>a?s:a))/(b*(s>a?s:a)):0n,s>a?l*((s<b?s:b)-a)/q:0n];}
export function minimumBounds(tick,spacing){if(!Number.isInteger(spacing)||spacing<=0)return null;const lower=Math.floor(tick/spacing)*spacing;return {lower,upper:lower+spacing};}
export const Q18=10n**18n;
export function valueOf(amount,decimals,price){return BigInt(amount)===0n?0n:price===null||price===undefined||BigInt(price)<=0n?null:BigInt(amount)*BigInt(price)/10n**BigInt(decimals);}
export function pairValue(a,b,t0,t1,prices){const x=valueOf(a,t0.decimals,prices.get(t0.address.toLowerCase())?.price),y=valueOf(b,t1.decimals,prices.get(t1.address.toLowerCase())?.price);return x===null||y===null?null:x+y;}
