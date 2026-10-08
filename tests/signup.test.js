import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {validate,createHandler} from '../supabase/functions/signup/handler.js';
import {realSignupReady,sendSignup,redirectDestination} from '../js/signup-core.js';
const data={email:' Adult@Example.test ',role:'parent',interested_in_pilot:false,contact_consent:true,preferred_language:'EN',privacy_notice_version:'v1',website:'',elapsed_ms:3000};
const env={REAL_SIGNUP_ENABLED:'true',PRIVACY_READY:'true',PRIVACY_NOTICE_VERSION:'v1',SUPABASE_URL:'https://unit.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-test-key',ALLOWED_ORIGINS:'https://example.test'};
const c={REAL_SIGNUP_ENABLED:true,PRIVACY_READY:true,PRIVACY_NOTICE_VERSION:'v1',SIGNUP_ENDPOINT:'https://unit.supabase.co/functions/v1/signup',DEMO_REDIRECT_ENABLED:false,DEMO_REDIRECT_URL:'./demo/',TRUSTED_DEMO_ORIGINS:[]};
function req(body=data,extra={}){return new Request('https://unit.test',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:JSON.stringify(body),...extra});}
test('normalizes adults email and validates five languages and two roles',()=>{
 for(const language of ['EN','FI','ZH','SV','ES'])for(const role of ['parent','teacher'])assert.equal(validate({...data,preferred_language:language,role},'v1').p_email,'adult@example.test');
});
test('rejects invalid email, consent, roles, language, stale notice, bot and unexpected data',()=>{
 for(const patch of [{email:'bad'},{email:'a'.repeat(255)+'@a.test'},{role:'child'},{contact_consent:false},{contact_consent:'true'},{interested_in_pilot:'yes'},{preferred_language:'RU'},{privacy_notice_version:'old'},{website:'spam'},{elapsed_ms:1},{ip:'1.2.3.4'}])assert.equal(validate({...data,...patch},'v1'),null);
});
test('server fails closed if activation or privacy gates are missing',async()=>{
 for(const patch of [{REAL_SIGNUP_ENABLED:'false'},{PRIVACY_READY:'false'},{PRIVACY_NOTICE_VERSION:'draft-test'},{SUPABASE_SERVICE_ROLE_KEY:''}])assert.equal((await createHandler({...env,...patch})(req())).status,503);
});
test('origin, method, body type, malformed and oversized requests rejected',async()=>{
 const handle=createHandler(env,()=>{throw Error('must not reach database');});
 assert.equal((await handle(req(data,{headers:{origin:'https://evil.test'}}))).status,403);
 assert.equal((await handle(new Request('https://unit.test',{headers:{origin:'https://example.test'}}))).status,405);
 assert.equal((await handle(req(data,{headers:{origin:'https://example.test','content-type':'text/plain'}}))).status,415);
 assert.equal((await handle(req(data,{body:'broken'}))).status,400);
 assert.equal((await handle(req(data,{body:'x'.repeat(4097)}))).status,413);
 assert.equal((await handle(req({...data,contact_consent:false}))).status,400);
});
test('only database true gives successful storage; no records disclosed',async()=>{
 let payload;const handler=createHandler(env,async(url,options)=>{payload=JSON.parse(options.body);return Response.json(true);});
 for(let i=0;i<2;i++){const r=await handler(req());assert.equal(r.status,200);assert.deepEqual(await r.json(),{stored:true});}
 assert.deepEqual(Object.keys(payload).sort(),['p_email','p_language','p_notice','p_pilot','p_role']);
 for(const [reply,status] of [[Response.json(false),429],[Response.json(null),503],[Response.json({error:'private detail'},{status:500}),503]])assert.equal((await createHandler(env,async()=>reply)(req())).status,status);
 assert.equal((await createHandler(env,async()=>{throw Error('network');})(req())).status,503);
});
test('frontend requires explicit server storage confirmation and handles failures',async()=>{
 assert.equal(realSignupReady(c),true);
 for(const patch of [{REAL_SIGNUP_ENABLED:false},{PRIVACY_READY:false},{PRIVACY_NOTICE_VERSION:'draft-1'},{SIGNUP_ENDPOINT:'http://unit.test/functions/v1/signup'}])assert.equal(realSignupReady({...c,...patch}),false);
 for(const reply of [Response.json({stored:false}),Response.json({stored:true},{status:500}),new Response('bad')])await assert.rejects(()=>sendSignup(c,data,async()=>reply));
 assert.deepEqual(await sendSignup(c,data,async()=>Response.json({stored:true})),{stored:true});
});
test('redirect disabled by default; configured route respects project prefix and rejects untrusted or PII URLs',()=>{
 const base='https://example.test/laughing-lumi/';assert.equal(redirectDestination(c,base),null);
 assert.equal(redirectDestination({...c,DEMO_REDIRECT_ENABLED:true},base),base+'demo/');
 for(const url of ['https://evil.test/','javascript:alert(1)','./demo/?email=someone','https://user:pass@example.test/','./demo/#private'])assert.throws(()=>redirectDestination({...c,DEMO_REDIRECT_ENABLED:true,DEMO_REDIRECT_URL:url},base));
 assert.equal(redirectDestination({...c,DEMO_REDIRECT_ENABLED:true,DEMO_REDIRECT_URL:'https://demo.example.test/',TRUSTED_DEMO_ORIGINS:['https://demo.example.test']},base),'https://demo.example.test/');
});
test('published configuration has collection and redirect switched off',async()=>{
 const context={window:{}};vm.runInNewContext(await readFile(new URL('../js/config.js',import.meta.url),'utf8'),context);
 assert.equal(context.window.LUMI_CONFIG.REAL_SIGNUP_ENABLED,false);assert.equal(context.window.LUMI_CONFIG.DEMO_REDIRECT_ENABLED,false);
});
