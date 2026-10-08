import { realSignupReady, sendSignup, redirectDestination } from './signup-core.js';
const config = window.LUMI_CONFIG;
const ready = realSignupReady(config);
const form = document.getElementById('demoForm');
const button = form.querySelector('[type=submit]');
const status = document.getElementById('signupStatus');
let busy = false, started = performance.now();
const copy = {
 en: {mode:'Simulation only — registration is not open. Please use a made-up email; nothing entered here is sent or saved.', real:'Adult parents, carers and educators only. Please read the privacy notice before agreeing.', submit:'Be among the first to try Lumi', pending:'Saving…', error:'We could not confirm your registration. Please try again later. You have not been redirected.', thanks:'Thank you! Your email is on our early-access list. The team will contact you about future testing opportunities. If you joined before, your existing registration is unchanged.', notice:'Privacy notice', consent:'I am an adult and agree to be contacted about Lumi early access and optional testing opportunities. I have read the privacy notice and understand I can withdraw consent at any time.', prompt:'First choose your role, enter a valid email and read the consent information.'},
 fi: {mode:'Vain simulaatio — ilmoittautuminen ei ole vielä avoinna. Käytä keksittyä sähköpostiosoitetta; mitään ei lähetetä tai tallenneta.',real:'Vain täysi-ikäisille vanhemmille, huoltajille ja opettajille. Lue tietosuojailmoitus ennen suostumusta.',submit:'Ole ensimmäisten joukossa kokeilemassa Lumia',pending:'Tallennetaan…',error:'Ilmoittautumista ei voitu vahvistaa. Yritä myöhemmin uudelleen. Sinua ei ohjattu muualle.',thanks:'Kiitos! Sähköpostisi on varhaiskäyttäjien listalla. Tiimi ottaa yhteyttä tulevista kokeiluista. Aiempi ilmoittautuminen säilyy ennallaan.',notice:'Tietosuojailmoitus',consent:'Olen täysi-ikäinen ja suostun yhteydenottoihin Lumin varhaisesta käytöstä ja vapaaehtoisista kokeiluista. Olen lukenut tietosuojailmoituksen ja voin perua suostumukseni milloin tahansa.',prompt:'Valitse roolisi, anna kelvollinen sähköpostiosoite ja lue suostumustiedot.'},
 zh: {mode:'仅为模拟演示——尚未开放注册。请使用虚构邮箱；填写的信息不会发送或保存。',real:'仅限成年家长、监护人和教育工作者。请先阅读隐私声明。',submit:'成为第一批试用 Lumi 的人',pending:'正在保存…',error:'无法确认注册成功。请稍后重试。未进行跳转。',thanks:'谢谢！你的邮箱已在早期体验名单中。团队将联系你介绍未来的测试机会。如果此前已注册，原有登记保持不变。',notice:'隐私声明',consent:'我已成年，并同意接收 Lumi 早期体验和自愿测试机会的联系。我已阅读隐私声明，理解可以随时撤回同意。',prompt:'请先选择身份、填写有效邮箱并阅读同意说明。'},
 sv: {mode:'Endast simulering — anmälan är inte öppen. Använd en påhittad e-postadress; ingenting skickas eller sparas.',real:'Endast för vuxna föräldrar, vårdnadshavare och pedagoger. Läs integritetsinformationen först.',submit:'Bli en av de första att prova Lumi',pending:'Sparar…',error:'Vi kunde inte bekräfta din anmälan. Försök igen senare. Du har inte omdirigerats.',thanks:'Tack! Din e-post finns på vår lista. Teamet kontaktar dig om framtida testmöjligheter. En tidigare anmälan ändras inte.',notice:'Integritetsinformation',consent:'Jag är vuxen och samtycker till kontakt om tidig tillgång till Lumi och frivilliga tester. Jag har läst integritetsinformationen och kan när som helst återkalla samtycket.',prompt:'Välj din roll, ange en giltig e-postadress och läs samtyckesinformationen.'},
 es: {mode:'Solo simulación — las inscripciones aún no están abiertas. Usa un correo inventado; no se envía ni guarda nada.',real:'Solo para madres, padres, tutores y docentes adultos. Lee el aviso de privacidad antes de aceptar.',submit:'Sé de los primeros en probar Lumi',pending:'Guardando…',error:'No pudimos confirmar tu inscripción. Inténtalo más tarde. No se ha realizado ninguna redirección.',thanks:'¡Gracias! Tu correo está en nuestra lista de acceso anticipado. El equipo te contactará sobre futuras pruebas. Si ya te inscribiste, tu registro no cambia.',notice:'Aviso de privacidad',consent:'Soy mayor de edad y acepto recibir comunicaciones sobre acceso anticipado a Lumi y pruebas opcionales. He leído el aviso de privacidad y entiendo que puedo retirar mi consentimiento en cualquier momento.',prompt:'Elige tu perfil, introduce un correo válido y lee la información de consentimiento.'},
};
const launchCopy={
 en:{mode:'Early-access registration opens soon. Meet Lumi and choose your role to discover how you can take part.',button:'Registration opens soon',fine:'We are preparing early-access invitations. Email registration is not open yet.',parent:'Bring more curiosity to everyday family life. Join other parents and carers in shaping a playful learning companion for children.',teacher:'Bring your classroom perspective to Lumi. Help shape playful learning experiences and hear about future educator feedback and pilot opportunities.',privacy:'How we handle your information',privacyBody:'Email registration is not open yet. No form entries are sent or stored. Read our privacy information below.'},
 fi:{mode:'Varhaisen käytön ilmoittautuminen avautuu pian. Tutustu Lumiin ja valitse roolisi.',button:'Ilmoittautuminen avautuu pian',fine:'Valmistelemme ensimmäisiä kutsuja. Sähköposti-ilmoittautuminen ei ole vielä avoinna.',parent:'Tuo lisää uteliaisuutta perheen arkeen. Auta muita vanhempia ja huoltajia luomaan lapsille leikkisä oppimiskaveri.',teacher:'Tuo opetuskokemuksesi Lumin kehitykseen. Auta muovaamaan leikkisää oppimista ja kuule tulevista palautekierroksista ja piloteista.',privacy:'Näin käsittelemme tietoja',privacyBody:'Sähköposti-ilmoittautuminen ei ole vielä avoinna. Lomakkeen tietoja ei lähetetä eikä tallenneta. Lue tietosuojatiedot alta.'},
 zh:{mode:'早期体验登记即将开放。先认识 Lumi，选择你的身份，了解如何参与。',button:'登记即将开放',fine:'我们正在筹备首批体验邀请，暂未开放邮箱登记。',parent:'让家庭日常多一点好奇与发现。和其他家长、监护人一起，为孩子打造有趣的学习伙伴。',teacher:'把你的教学经验带给 Lumi。参与打磨寓教于乐的学习体验，了解未来面向教育工作者的反馈与试点机会。',privacy:'我们如何处理你的信息',privacyBody:'邮箱登记尚未开放，表单内容不会发送或保存。请阅读下方隐私信息。'},
 sv:{mode:'Anmälan till tidig tillgång öppnar snart. Möt Lumi och välj din roll.',button:'Anmälan öppnar snart',fine:'Vi förbereder de första inbjudningarna. E-postanmälan är ännu inte öppen.',parent:'Ge familjens vardag mer nyfikenhet. Hjälp andra föräldrar och vårdnadshavare att forma en lekfull lärkompis för barn.',teacher:'Bidra med ditt pedagogiska perspektiv. Var med och forma lekfullt lärande och hör om framtida återkoppling och pilotprojekt.',privacy:'Så hanterar vi dina uppgifter',privacyBody:'E-postanmälan är ännu inte öppen. Formulärets uppgifter skickas eller sparas inte. Läs integritetsinformationen nedan.'},
 es:{mode:'La inscripción para acceso anticipado abrirá pronto. Conoce a Lumi y elige tu perfil.',button:'Inscripciones próximamente',fine:'Estamos preparando las primeras invitaciones. El registro por correo aún no está abierto.',parent:'Da más espacio a la curiosidad en familia. Ayuda a otras madres, padres y tutores a crear un compañero de aprendizaje lúdico para los niños.',teacher:'Aporta tu experiencia educativa a Lumi. Ayuda a diseñar experiencias de aprendizaje lúdico y conoce futuras oportunidades de feedback y pilotaje.',privacy:'Cómo tratamos tu información',privacyBody:'El registro por correo aún no está abierto. El formulario no envía ni guarda datos. Lee la información de privacidad a continuación.'}
};
function words(){return copy[lang] || copy.en;}
function refresh() {
 const t=words(),l=launchCopy[lang],role=form.querySelector('[name=role]:checked')?.value;
 // Keep the controls usable while signup is gated. Visitors can read the notice,
 // type an address, and tick consent; the submit handler still refuses to send it.
 document.getElementById('signupMode').textContent=ready?t.real:l.mode;
 document.getElementById('privacyLink').textContent=t.notice;
 document.getElementById('roleInvitation').textContent=role?l[role]:'';
 const labels={en:['Education · Design · Technology','Contact details coming soon','Future collaborations'],fi:['Kasvatus · Muotoilu · Teknologia','Yhteystiedot tulossa pian','Tulevat yhteistyömahdollisuudet'],zh:['教育 · 设计 · 技术','联系方式即将公布','未来合作机会'],sv:['Pedagogik · Design · Teknik','Kontaktuppgifter kommer snart','Framtida samarbeten'],es:['Educación · Diseño · Tecnología','Datos de contacto próximamente','Futuras colaboraciones']}[lang];
 ['card1b','card2b','card3b'].forEach((key,i)=>document.querySelector('[data-i18n='+key+']').textContent=labels[i]);
 button.textContent=ready?(busy?t.pending:t.submit):l.button;
 document.querySelector('[data-i18n=fine]').textContent=ready?t.real:l.fine;
 document.querySelector('[data-i18n=consent]').textContent=t.consent;
 document.querySelector('[data-nav=privacy]').textContent=ready?t.notice:l.privacy;
 document.querySelector('[data-nav=privacyText]').textContent=ready?t.real:l.privacyBody;
 document.querySelector('[data-nav=thanksBody]').textContent=t.thanks;
 if(!ready)document.querySelector('[data-i18n=signupText]').textContent=l.mode;
 I18N[lang].bForm=role?l[role]:l.mode;
}
form.querySelectorAll('[name=role]').forEach(input=>input.addEventListener('change',()=>{refresh();if(stage==='form')talk('bForm',true);}));
window.addEventListener('lumi:language',refresh); refresh();
function consentHint(){ if(stage==='form'&&!transitioning&&!drag){setPose('wave');talk('bConsent',true);} }
consent.closest('label').addEventListener('pointerenter',consentHint);
consent.closest('label').addEventListener('pointerdown',consentHint,{passive:true});
form.addEventListener('submit',async e=>{
 e.preventDefault(); if(busy)return; if(!ready){status.textContent=launchCopy[lang].fine;return;}
 status.textContent='';
 if(!form.checkValidity()){status.textContent=words().prompt;form.reportValidity();return;}
 busy=true;button.disabled=true;form.setAttribute('aria-busy','true');
 try {
   if(ready){
     button.textContent=words().pending;
     await sendSignup(config,{
       email:email.value.trim().toLowerCase(),role:form.querySelector('[name=role]:checked').value,
       interested_in_pilot:document.getElementById('pilot').checked,contact_consent:consent.checked,
       preferred_language:lang.toUpperCase(),privacy_notice_version:config.PRIVACY_NOTICE_VERSION,
       website:document.getElementById('website').value,elapsed_ms:Math.round(performance.now()-started),
     });
   }
   email.value='';
   document.getElementById('formFields').hidden=true;
   document.getElementById('success').classList.add('active');
   setPose('wave');talk('bThanks');refresh();
   // Only the confirmed server response reaches this block.
   if(ready && config.DEMO_REDIRECT_ENABLED){
     let destination=null;try{destination=redirectDestination(config,document.baseURI);}catch{/* Keep the confirmed thank-you state if configuration is unsafe. */}
     if(destination)window.location.assign(destination);
   }
 } catch {status.textContent=words().error;}
 finally {busy=false;button.disabled=false;form.removeAttribute('aria-busy');refresh();}
});
document.getElementById('reset').addEventListener('click',()=>{started=performance.now();status.textContent='';refresh();});
