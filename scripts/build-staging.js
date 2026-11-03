// Same canonical source; isolated review artifact only. Never changes js/config.js.
import './build.js';
import {readFile,writeFile} from 'node:fs/promises';
const output=process.env.LUMI_BUILD_DIR||'dist';
const file=output+'/js/config.js';let config=await readFile(file,'utf8');
config=config.replace('REAL_SIGNUP_ENABLED: true','REAL_SIGNUP_ENABLED: false');
await writeFile(file,config);
await writeFile(output+'/release-review.json',JSON.stringify({purpose:'Isolated review',realCollectionEnabled:false,liveSheetsVerified:false},null,2));

const copy={en:['Release review — registration disabled','This isolated review does not collect registrations. Do not enter real personal information. Google Sheets collection remains disabled until the controller, notice, retention and processing arrangements are approved and end-to-end persistence is verified.'],fi:['Julkaisun tarkastus — ilmoittautuminen pois käytöstä','Tämä tarkastusversio ei kerää ilmoittautumisia. Älä syötä oikeita henkilötietoja. Google Sheets -keruu odottaa hyväksyttyä tietosuojakäytäntöä ja tallennuksen testausta.'],zh:['发布审核版——登记已关闭','此独立审核版不收集报名。请勿填写真实个人信息。控制者、隐私告知、保留期限和处理安排经批准，且真实存储验证完成后，才会启用 Google Sheets 登记。'],sv:['Publiceringsgranskning — anmälan avstängd','Denna granskning samlar inte in anmälningar. Ange inga riktiga personuppgifter. Google Sheets väntar på godkända integritetsvillkor och verifierad lagring.'],es:['Revisión de publicación — registro desactivado','Esta revisión no recoge registros. No introduzcas datos personales reales. Google Sheets requiere condiciones de privacidad aprobadas y persistencia verificada.']};
await writeFile(output+'/privacy/index.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy · Laughing Lumi Release Review</title><style>body{max-width:760px;margin:40px auto;padding:24px;font:16px/1.7 system-ui;color:#183749;background:#fbf7ef}h1{font-size:30px}section{margin-block:32px}a{color:#1e6299}</style><a href="../">Laughing Lumi</a>'+Object.entries(copy).map(([l,[h,p]])=>'<section lang="'+l+'"><h1>'+h+'</h1><p>'+p+'</p></section>').join('')+'</html>');
