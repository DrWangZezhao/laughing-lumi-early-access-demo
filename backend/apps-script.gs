/* Bundle AFTER sheets-core.js with export keywords removed. Never serve this source to clients. */
function doPost(e) {
 var result={error:'unavailable'}, lock=LockService.getScriptLock();
 try {
  if(!e || !e.postData || e.postData.contents.length>8192)throw Error('Body limit');
  var envelope=JSON.parse(e.postData.contents), props=PropertiesService.getScriptProperties();
  var secret=props.getProperty('ADAPTER_SECRET'), notice=props.getProperty('PRIVACY_NOTICE_VERSION');
  if(!secret || secret.length<32 || envelope.secret!==secret || !notice || notice.indexOf('draft')===0 || props.getProperty('REGISTRATION_ENABLED')!=='true')throw Error('Disabled');
  if(!Number.isFinite(envelope.sent_at)||Math.abs(Date.now()-envelope.sent_at)>60000)throw Error('Expired');
  if(!lock.tryLock(10000))throw Error('Busy');
  var sheet=SpreadsheetApp.openById(SHEET_ID).getSheetByName('Registrations');
  if(!sheet)throw Error('Missing sheet');
  result=storeRegistration(envelope.data,{
   now:function(){return new Date();},id:function(){return Utilities.getUuid();},
   hash:function(email){return Utilities.computeHmacSha256Signature(email,secret).map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');},
   headers:function(){return sheet.getRange(1,1,1,HEADERS.length).getValues()[0];},
   consume:function(bucket,emailKey,perEmail,globalCap){
    var state=JSON.parse(props.getProperty('RATE_STATE')||'{}');
    if(state.bucket!==bucket)state={bucket:bucket,total:0,emails:{}};
    if(state.total>=globalCap||(state.emails[emailKey]||0)>=perEmail)return false;
    state.total++;state.emails[emailKey]=(state.emails[emailKey]||0)+1;
    // Separate properties avoid Apps Script's 9 KB per-value ceiling.
    props.setProperty('RATE_STATE',JSON.stringify({bucket:bucket,total:state.total,emails:{}}));
    var rateKey='RATE_'+emailKey, previous=JSON.parse(props.getProperty(rateKey)||'{}');
    if(previous.bucket===bucket&&previous.count>=perEmail)return false;
    props.setProperty(rateKey,JSON.stringify({bucket:bucket,count:previous.bucket===bucket?previous.count+1:1}));
    // Keep storage bounded; sweep expired per-email counters on each request.
    var all=props.getProperties();Object.keys(all).filter(function(k){return k.indexOf('RATE_')===0&&k!=='RATE_STATE';}).forEach(function(k){if(JSON.parse(all[k]).bucket!==bucket)props.deleteProperty(k);});
    return true;
   },
   hasEmail:function(email,escaped){if(sheet.getLastRow()<2)return false;return sheet.getRange(2,2,sheet.getLastRow()-1,1).getValues().some(function(row){return row[0]===email||row[0]===escaped;});},
   append:function(row){sheet.getRange(sheet.getLastRow()+1,1,1,row.length).setValues([row]);SpreadsheetApp.flush();}
  },notice);
 } catch(error) {result={error:'unavailable'};}
 finally {if(lock.hasLock())lock.releaseLock();}
 return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
