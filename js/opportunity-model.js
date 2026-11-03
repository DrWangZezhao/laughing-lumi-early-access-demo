// Public planning assumptions, Budget v4.0 (23 October 2026), not current vendor quotes.
export const BASELINE = Object.freeze({monthlyPrice:9.9,annualPrice:99,vat:0.255,channelFee:0.15,fx:1.1205,personnel:141750,technology:45000,safety:25000,pilots:23250,usageEnvelope:11500,reserve:15000});
export const DEFAULTS = Object.freeze({paying:1000,plan:'annual',conversion:0.25,minutes:40,architecture:'hybrid',channelFee:0.15,pose:0,scaleOverhead:null});
export const LIMITS = Object.freeze({paying:[0,500000],conversion:[0.01,1],minutes:[0,90],channelFee:[0,0.30],pose:[0,0.75],scaleOverhead:[0,100]});
export const SOURCES = Object.freeze({budget:'Budget v4.0, 23 October 2026, English pp. 16–30; compiled report pp. 37–51',pitch:'EDILO OY-preseed2026.pptx, read 3 November 2026',sourceDate:'2026-10-23'});
const llm = (400*0.25+120*2)/1e6;
const modular = 0.25*0.39/60+75*0.05/1000+llm;
export function deliveryCost(active, minutes, architecture='hybrid', pose=0) {
 if(!Number.isFinite(active)||active<0||!Number.isFinite(minutes)||minutes<0||!Number.isFinite(pose)||pose<0)throw new RangeError('Invalid delivery assumptions');
 const m=active*minutes;
 const usd={full:99+Math.max(0,m-1238)*0.08+m*llm,modular:m*modular,hybrid:m*(0.35*modular+0.20*(0.08+llm)),hybridPro:99+Math.max(0,0.2*m-1238)*0.08+0.2*m*llm+0.35*m*modular}[architecture];
 if(usd===undefined)throw new RangeError('Unknown architecture');
 return usd/BASELINE.fx+25+active*(0.25+pose);
}
export function scenario(input={}) {
 const a={...DEFAULTS,...input};
 for(const [key,[lo,hi]] of Object.entries(LIMITS))if(!(key==='scaleOverhead'&&a[key]===null)&&(!Number.isFinite(a[key])||a[key]<lo||a[key]>hi))throw new RangeError('Invalid '+key);
 if(!Number.isInteger(a.paying)||!['monthly','annual'].includes(a.plan))throw new RangeError('Invalid subscription');
 const active=a.paying/a.conversion;
 const annualGross=a.paying*(a.plan==='annual'?BASELINE.annualPrice:BASELINE.monthlyPrice*12);
 const monthlyGross=annualGross/12;
 const annualNet=annualGross/(1+BASELINE.vat)*(1-a.channelFee);
 const delivery=deliveryCost(active,a.minutes,a.architecture,a.pose);
 // Replace, rather than add to, the budget's complete overlapping voice/cloud envelope.
 const fixedAnnual=BASELINE.personnel+BASELINE.technology-BASELINE.usageEnvelope+BASELINE.safety+BASELINE.pilots;
 const scaleAnnual=a.scaleOverhead===null?null:Math.max(0,active-200)*a.scaleOverhead*12;
 const annualOperating=active>200&&scaleAnnual===null?null:fixedAnnual+delivery*12+(scaleAnnual||0);
 const contribution=annualNet-delivery*12;
 return {assumptions:a,active,monthlyGross,annualGross,annualNet,monthlyNet:annualNet/12,delivery,contribution,fixedAnnual,scaleAnnual,annualOperating,operatingResult:annualOperating===null?null:annualNet-annualOperating,upfrontGross:a.plan==='annual'?annualGross:monthlyGross,technicalBreakEven:Math.ceil(delivery/(annualNet/a.paying/12||((a.plan==='annual'?BASELINE.annualPrice/12:BASELINE.monthlyPrice)/(1+BASELINE.vat)*(1-a.channelFee)))),scaleRequiresReview:active>200};
}
export function formatMoney(value,locale='en') {return new Intl.NumberFormat(locale,{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value);}
export function formatCount(value,locale='en') {return new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(value);}
export function resetScenario() {return {...DEFAULTS};}

// Stable axes within each household band make plan/fee and customer changes comparable.
export function salesSensitivity(input={}) {
 const a={...DEFAULTS,...input};const xMax=[1000,10000,100000,500000].find(n=>n>=a.paying)||500000;
 const yMax=xMax*BASELINE.monthlyPrice*12/(1+BASELINE.vat);
 const point=n=>{const y=scenario({...a,paying:n}).annualNet;return {x:20+960*n/xMax,y:125-110*y/yMax};};
 const points=Array.from({length:9},(_,i)=>point(Math.round(xMax*i/8)));
 const line=points.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ');
 return {xMax,yMax,line,area:line+' L980 125 L20 125 Z',dot:point(a.paying),endNet:scenario({...a,paying:xMax}).annualNet};
}
