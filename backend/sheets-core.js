export const SHEET_ID = '1q4K_eLaJj_sRhzFWi0rwvVjGn7jqjDCL0BWRPLF3WDM';
export const HEADERS = ['id','email','role','interested_in_pilot','contact_consent','consent_timestamp','privacy_notice_version','preferred_language','created_at','status'];
export function validateRegistration(data, notice) {
 const keys=['email','role','interested_in_pilot','contact_consent','preferred_language','privacy_notice_version','website','elapsed_ms'];
 if(!data || typeof data!=='object' || Array.isArray(data) || Object.keys(data).some(k=>!keys.includes(k)))return null;
 const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
 if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\u0000-\u001f\u007f]/.test(email))return null;
 if(!['parent','teacher'].includes(data.role)||typeof data.interested_in_pilot!=='boolean'||data.contact_consent!==true)return null;
 if(!['EN','FI','ZH','SV','ES'].includes(data.preferred_language)||data.privacy_notice_version!==notice)return null;
 if(data.website!==''||!Number.isFinite(data.elapsed_ms)||data.elapsed_ms<2000)return null;
 return {...data,email};
}
// Escape every text cell, including future fields, before using Sheets setValues.
export function safeCell(value) {return typeof value==='string' && /^[\s]*[=+@-]/.test(value)?"'"+value:value;}
// Adapter must hold its cross-request lock for the entire call, including rate state and append.
export function storeRegistration(data, io, notice) {
 const valid=validateRegistration(data,notice);if(!valid)return {error:'invalid'};
 if(JSON.stringify(io.headers())!==JSON.stringify(HEADERS))throw Error('Unexpected sheet schema');
 const now=io.now();
 // Persistent UTC hour counters: global cap bounds email rotation and total append work.
 const bucket=now.toISOString().slice(0,13);
 const emailKey=io.hash(valid.email);
 if(!io.consume(bucket,emailKey,5,500))return {error:'rate'};
 // Compare both literal and escaped representation; never overwrite original consent evidence.
 if(io.hasEmail(valid.email,safeCell(valid.email)))return {stored:true};
 const stamp=now.toISOString();
 io.append([io.id(),valid.email,valid.role,valid.interested_in_pilot,true,stamp,notice,valid.preferred_language,stamp,'new'].map(safeCell));
 return {stored:true};
}
