import {validateRegistration} from './sheets-core.js';
export function createSheetsProxy(env, fetcher=fetch) {
 return async req=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  const respond=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  const origin=req.headers.get('origin');
  if(!origin || !(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean).includes(origin))return respond(403,{error:'Origin not allowed'});
  Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return respond(405,{error:'Method not allowed'});
  if(env.REAL_SIGNUP_ENABLED!=='true'||env.PRIVACY_READY!=='true'||!env.PRIVACY_NOTICE_VERSION||env.PRIVACY_NOTICE_VERSION.startsWith('draft')||!env.ADAPTER_SECRET||env.ADAPTER_SECRET.length<32||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(env.SHEETS_ADAPTER_URL||''))return respond(503,{error:'Registration unavailable'});
  if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))return respond(415,{error:'JSON required'});
  let data, timer, reader;
  try {
   reader=req.body?.getReader();if(!reader)return respond(400,{error:'Missing body'});
   const bytes=await Promise.race([(async()=>{
    const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){void reader.cancel();throw Error('large');}chunks.push(value);}
    const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}return joined;
   })(),new Promise((_,reject)=>{timer=setTimeout(()=>{void reader.cancel();reject(Error('timeout'));},5000);})]);
   data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch(error){return respond(error.message==='large'?413:error.message==='timeout'?408:400,{error:'Invalid request'});}
  finally{clearTimeout(timer);}
  if(!validateRegistration(data,env.PRIVACY_NOTICE_VERSION))return respond(400,{error:'Invalid registration'});
  try {
   const upstream=await fetcher(env.SHEETS_ADAPTER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.ADAPTER_SECRET,sent_at:Date.now(),data}),signal:AbortSignal.timeout(12000),redirect:'follow'});
   if(!upstream.ok)return respond(503,{error:'Registration unavailable'});
   const result=await upstream.json();
   if(result.error==='rate'){headers['Retry-After']='3600';return respond(429,{error:'Please try later'});}
   if(result.stored!==true)return respond(503,{error:'Storage not confirmed'});
   return respond(200,{stored:true});
  }catch{return respond(503,{error:'Registration unavailable'});}
 };
}
