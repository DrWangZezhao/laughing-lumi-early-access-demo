const allowedKeys = ['email','role','interested_in_pilot','contact_consent','preferred_language','privacy_notice_version','website','elapsed_ms'];
export function validate(data, notice) {
 if(!data || typeof data!=='object' || Array.isArray(data) || Object.keys(data).some(k=>!allowedKeys.includes(k)))return null;
 const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
 if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\u0000-\u001f\u007f]/.test(email))return null;
 if(!['parent','teacher'].includes(data.role) || typeof data.interested_in_pilot!=='boolean' || data.contact_consent!==true)return null;
 if(!['EN','FI','ZH','SV','ES'].includes(data.preferred_language) || data.privacy_notice_version!==notice)return null;
 if(data.website!=='' || !Number.isFinite(data.elapsed_ms) || data.elapsed_ms<2000)return null;
 return {p_email:email,p_role:data.role,p_pilot:data.interested_in_pilot,p_language:data.preferred_language,p_notice:notice};
}
export function createHandler(env, fetcher=fetch) {
 return async req=>{
  const origin=req.headers.get('origin');
  const origins=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  const respond=(status,error,extra={})=>new Response(JSON.stringify(error?{error}:extra),{status,headers});
  if(!origin||!origins.includes(origin))return respond(403,'Origin not allowed');
  Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return respond(405,'Method not allowed');
  if(env.REAL_SIGNUP_ENABLED!=='true'||env.PRIVACY_READY!=='true'||!env.PRIVACY_NOTICE_VERSION||env.PRIVACY_NOTICE_VERSION.startsWith('draft')||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return respond(503,'Registration unavailable');
  if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))return respond(415,'JSON required');
  let data;
  try{
   // Enforce actual bytes even when Content-Length is absent or dishonest.
   const reader=req.body?.getReader();if(!reader)return respond(400,'Missing body');
   const chunks=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return respond(413,'Request too large');}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   data=JSON.parse(new TextDecoder().decode(bytes));
  }catch{return respond(400,'Invalid JSON');}
  const record=validate(data,env.PRIVACY_NOTICE_VERSION);
  if(!record)return respond(400,'Invalid registration');
  try{
   const db=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/register_early_adopter',{
    method:'POST',headers:{'Content-Type':'application/json',apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY},
    body:JSON.stringify(record),signal:AbortSignal.timeout(10000),
   });
   if(!db.ok)return respond(503,'Registration unavailable');
   const stored=await db.json();
   if(stored===false){headers['Retry-After']='3600';return respond(429,'Please try later');}
   if(stored!==true)return respond(503,'Storage not confirmed');
   // Same reply for insert and duplicate prevents public email enumeration.
   return respond(200,null,{stored:true});
  }catch{return respond(503,'Registration unavailable');}
 };
}
