import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {HEADERS,SHEET_ID,validateRegistration,safeCell,storeRegistration} from '../backend/sheets-core.js';
import {createSheetsProxy} from '../backend/sheets-proxy.js';
const data={email:' Adult@Example.test ',role:'parent',interested_in_pilot:false,contact_consent:true,preferred_language:'EN',privacy_notice_version:'v1',website:'',elapsed_ms:3000};
const env={ALLOWED_ORIGINS:'https://example.test',REAL_SIGNUP_ENABLED:'true',PRIVACY_READY:'true',PRIVACY_NOTICE_VERSION:'v1',ADAPTER_SECRET:'synthetic-test-secret-32-characters',SHEETS_ADAPTER_URL:'https://script.google.com/macros/s/test/exec'};
const req=(body=data,options={})=>new Request('https://unit.test',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:JSON.stringify(body),...options});
test('Sheets validation keeps existing adult-only consent contract and rejects client timestamps',()=>{
 for(const role of ['parent','teacher'])for(const preferred_language of ['EN','FI','ZH','SV','ES'])assert.equal(validateRegistration({...data,role,preferred_language},'v1').email,'adult@example.test');
 for(const patch of [{consent_timestamp:'fake'},{contact_consent:false},{role:'investor'},{email:'bad'},{preferred_language:'RU'},{privacy_notice_version:'old'},{website:'spam'},{elapsed_ms:1}])assert.equal(validateRegistration({...data,...patch},'v1'),null);
});
test('formula escaping covers all Sheets formula prefixes and leading whitespace',()=>{
 for(const value of ['=cmd()','+a@b.test','-a@b.test','@a@b.test','  =1'])assert.equal(safeCell(value),"'"+value);
 assert.equal(safeCell('adult@example.test'),'adult@example.test');assert.equal(safeCell(true),true);
});
test('server stamps consent, fixes destination schema, and preserves original duplicate evidence',()=>{
 const rows=[];let allowed=true;
 const io={headers:()=>HEADERS,now:()=>new Date('2026-11-03T12:00:00Z'),id:()=> 'server-id',hash:()=> 'hash',consume:()=>allowed,hasEmail:(email,escaped)=>rows.some(row=>row[1]===email||row[1]===escaped),append:row=>rows.push(row)};
 assert.deepEqual(storeRegistration(data,io,'v1'),{stored:true});
 assert.deepEqual(storeRegistration({...data,role:'teacher'},io,'v1'),{stored:true});
 assert.equal(rows.length,1);assert.equal(rows[0][2],'parent');assert.equal(rows[0][5],'2026-11-03T12:00:00.000Z');assert.equal(rows[0][8],rows[0][5]);assert.equal(rows[0].length,HEADERS.length);
 allowed=false;assert.deepEqual(storeRegistration(data,io,'v1'),{error:'rate'});
 assert.throws(()=>storeRegistration(data,{...io,headers:()=>['wrong']},'v1'));
});
test('proxy origin, method, activation, type and actual body bytes are bounded',async()=>{
 const handle=createSheetsProxy(env,()=>{throw Error('must not call');});
 for(const [request,status] of [[req(data,{headers:{origin:'https://evil.test'}}),403],[req(data,{method:'GET',body:undefined}),405],[req(data,{headers:{origin:'https://example.test','content-type':'text/plain'}}),415],[req(data,{body:'x'.repeat(4097)}),413],[req(data,{body:'broken'}),400],[req({...data,contact_consent:false}),400]])assert.equal((await handle(request)).status,status);
 for(const patch of [{REAL_SIGNUP_ENABLED:'false'},{PRIVACY_READY:'false'},{ADAPTER_SECRET:''},{PRIVACY_NOTICE_VERSION:'draft-1'},{SHEETS_ADAPTER_URL:'https://evil.test/exec'}])assert.equal((await createSheetsProxy({...env,...patch})(req())).status,503);
});
test('proxy acknowledges only durable adapter confirmation and hides internal failures',async()=>{
 let envelope;const handle=createSheetsProxy(env,async(url,options)=>{assert.equal(url,env.SHEETS_ADAPTER_URL);envelope=JSON.parse(options.body);return Response.json({stored:true});});
 const result=await handle(req());assert.deepEqual(await result.json(),{stored:true});assert.equal(envelope.secret,env.ADAPTER_SECRET);assert.equal(typeof envelope.sent_at,'number');
 for(const [reply,status] of [[Response.json({stored:false}),503],[Response.json({error:'rate'}),429],[Response.json({private:'detail'},{status:500}),503],[new Response('broken'),503]])assert.equal((await createSheetsProxy(env,async()=>reply)(req())).status,status);
 assert.equal((await createSheetsProxy(env,async()=>{throw Error('secret');})(req())).status,503);
});
test('real Apps Script adapter serializes writes, rejects lock contention, persists rate caps, validates secret and schema',async()=>{
 const core=(await readFile(new URL('../backend/sheets-core.js',import.meta.url),'utf8')).replace(/^export /gm,'');
 const adapter=await readFile(new URL('../backend/apps-script.gs',import.meta.url),'utf8');
 const props={ADAPTER_SECRET:env.ADAPTER_SECRET,PRIVACY_NOTICE_VERSION:'v1',REGISTRATION_ENABLED:'true'};
 const rows=[Array.from(HEADERS)];let locked=false,contention=false;
 const sheet={getLastRow:()=>rows.length,getRange:(row,col,num=1,width=1)=>({getValues:()=>rows.slice(row-1,row-1+num).map(r=>r.slice(col-1,col-1+width)),setValues:values=>{assert.equal(locked,true);rows[row-1]=values[0];}})};
 const context={Date,Number,JSON,Object,LockService:{getScriptLock:()=>({tryLock:()=>{if(contention)return false;locked=true;return true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>{assert.equal(locked,true);props[k]=v;},getProperties:()=>({...props}),deleteProperty:k=>delete props[k]})},SpreadsheetApp:{openById:id=>{assert.equal(id,SHEET_ID);assert.equal(locked,true);return {getSheetByName:name=>{assert.equal(name,'Registrations');return sheet;}};},flush:()=>assert.equal(locked,true)},Utilities:{getUuid:()=> 'server-id',computeHmacSha256Signature:email=>Array.from(email).map(c=>c.charCodeAt(0))},ContentService:{MimeType:{JSON:'json'},createTextOutput:body=>({setMimeType:()=>JSON.parse(body)})}};
 vm.createContext(context);vm.runInContext(core+'\n'+adapter,context);
 const post=(patch={})=>context.doPost({postData:{contents:JSON.stringify({secret:env.ADAPTER_SECRET,sent_at:Date.now(),data,...patch})}});
 for(let i=0;i<5;i++)assert.equal(post().stored,true);
 assert.equal(rows.length,2);assert.equal(post().error,'rate');assert.equal(locked,false);
 assert.equal(post({secret:'wrong'}).error,'unavailable');assert.equal(post({sent_at:0}).error,'unavailable');
 contention=true;assert.equal(post().error,'unavailable');contention=false;
 assert.equal(post({data:{...data,email:'another@example.test'}}).stored,true);assert.equal(rows.length,3);
 rows[0][0]='wrong';assert.equal(post({data:{...data,email:'third@example.test'}}).error,'unavailable');
 rows[0][0]=HEADERS[0];
 props.RATE_STATE=JSON.stringify({bucket:new Date().toISOString().slice(0,13),total:500,emails:{}});
 assert.equal(post({data:{...data,email:'fresh@example.test'}}).error,'rate');assert.equal(rows.length,3);
 props.RATE_STATE=JSON.stringify({bucket:'2000-01-01T00',total:500,emails:{}});
 props.RATE_old=JSON.stringify({bucket:'2000-01-01T00',count:5});
 assert.equal(post({data:{...data,email:'fresh@example.test'}}).stored,true);assert.equal(props.RATE_old,undefined);
});
