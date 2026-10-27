/** Isolated UI fixtures. No real emails, Atlas mutations or provider requests. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function accountSecurityFixture(user){
  const requests=[];let used=false;
  return {requests,reply(path,method,raw){
    const body=raw?JSON.parse(raw):{};
    if(!path.startsWith('/auth/'))return null;
    requests.push({path,method,body});
    if(path==='/auth/capabilities')return {status:200,body:{password_recovery_email:false,email_verification:false,password_change:true,session_management:true}};
    if(path==='/auth/sessions')return {status:200,body:{data:[{id:'a'.repeat(64),current:true,started_at:'2026-10-25T10:00:00Z',expires_at:'2026-10-25T18:00:00Z'}],legacy_sessions_may_exist:true}};
    if(path==='/auth/reset-password'){if(used)return {status:410,body:{error:'El enlace venció, ya se usó o fue reemplazado. Solicita uno nuevo.'}};used=true;return {status:200,body:{message:'Tu contraseña cambió. Inicia sesión con la nueva contraseña.',requires_login:true}};}
    if(path==='/auth/verify-email')return {status:200,body:{message:'Tu correo quedó verificado.'}};
    if(path==='/auth/change-password')return body.current_password==='incorrect-fixture'?{status:403,body:{error:'La contraseña actual no coincide.'}}:{status:200,body:{message:'Contraseña guardada.',requires_login:true}};
    if(path==='/auth/sessions/revoke-all')return {status:200,body:{requires_login:true,current_session_closed:true}};
    if(path==='/auth/logout')return {status:200,body:{current_session_closed:true}};
    if(path==='/auth/me')return {status:200,body:user};
    return null;
  }};
}
export async function runAccountSecurityScenarios({call,evaluate,until,pause,origin,errors,user,fixture,bootScript}){
 const checks=[],screenshots=[];
 const directory=fileURLToPath(new URL('../../docs/evidence/account-security-ui/',import.meta.url));await fs.mkdir(directory,{recursive:true});
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:bootScript.identifier});
 let navigation=0;
 const navigate=async path=>{const target=new URL(path,origin);target.searchParams.set('ui_case',String(++navigation));await call('Page.navigate',{url:target.href});await until(`document.readyState==='complete'&&location.search===${JSON.stringify(target.search)}`);await pause(100);};
 const fill=async(id,value)=>evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
 const submit=async selector=>evaluate(`(()=>{document.querySelector(${JSON.stringify(selector)}).requestSubmit();return true;})()`);
 const capture=async name=>{const result=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(directory,name),Buffer.from(result.data,'base64'));screenshots.push(name);};
 await navigate('/login');await until("!!document.getElementById('login-password')");
 assert(await evaluate("!!document.querySelector('a[href=\"/recover-account\"]')"));
 const colors=await evaluate("[...document.querySelectorAll('.auth-screen,.access-frame,input,button')].map(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopColor})).filter(row=>row.background!=='rgba(0, 0, 0, 0)')");
 for(const row of colors){const rgb=row.background.match(/\d+/g)?.slice(0,3).map(Number);if(rgb?.length===3)assert(Math.max(...rgb)-Math.min(...rgb)<18,`Auth background has a color cast: ${row.background}`);}
 checks.push('login_recovery_link','authentication_backgrounds_are_neutral');await capture('login-desktop.png');
 await navigate('/recover-account');await until("document.body.innerText.includes('todavía no está configurado')");
 assert(await evaluate("document.querySelector('form button').disabled"));assert.equal(fixture.requests.filter(r=>r.path==='/auth/forgot-password').length,0);checks.push('missing_mail_provider_is_explicit_and_request_disabled');
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await capture('recovery-mobile.png');
 await navigate('/reset-password');await until("document.body.innerText.includes('Falta el enlace')");assert(await evaluate("document.querySelector('form button').disabled"));checks.push('missing_link_disables_password_reset');
 const token='u'.repeat(43);
 await navigate('/reset-password#token='+token);await until("!!document.getElementById('recovery-password')");
 assert.equal(await evaluate('location.hash'),'');assert.equal(await evaluate("document.querySelector('meta[name=referrer]').content"),'no-referrer');
 assert(!(await evaluate('JSON.stringify(localStorage)')).includes(token));checks.push('token_removed_from_url_and_not_persisted');
 await fill('recovery-password','isolated-new-password');await fill('recovery-confirmation','different-password');await submit('form');await until("document.body.innerText.includes('no coinciden')");assert.equal(fixture.requests.filter(r=>r.path==='/auth/reset-password').length,0);checks.push('confirmation_validated_before_request');
 await fill('recovery-confirmation','isolated-new-password');await submit('form');await until("document.body.innerText.includes('Tu contraseña cambió')");assert.equal(fixture.requests.find(r=>r.path==='/auth/reset-password').body.token,token);assert.equal(await evaluate("localStorage.getItem('backstage_token')"),null);checks.push('reset_submits_captured_token_and_returns_to_login');await capture('reset-confirmed-mobile.png');
 await navigate('/reset-password#token='+token);await until("!!document.getElementById('recovery-password')");await fill('recovery-password','isolated-new-password');await fill('recovery-confirmation','isolated-new-password');await submit('form');await until("document.body.innerText.includes('ya se usó')");checks.push('used_link_error_is_readable');
 await navigate('/verify-email#token='+token);await until("document.body.innerText.includes('Verificar mi correo')");assert.equal(fixture.requests.filter(r=>r.path==='/auth/verify-email').length,0);await submit('form');await until("document.body.innerText.includes('Tu correo quedó verificado')");checks.push('verification_requires_explicit_confirmation');
 const signIn=async()=>{await evaluate(`localStorage.setItem('backstage_token','isolated-fixture');localStorage.setItem('backstage_user',${JSON.stringify(JSON.stringify(user))});true`);await navigate('/dashboard?page=profile');await until("document.body.innerText.includes('Seguridad y sesiones')");};
 await signIn();assert(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Enviar enlace de verificación')).disabled"));checks.push('account_does_not_offer_unconfigured_mail');
 await evaluate("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Cambiar mi contraseña').click();true");await fill('security-current-password','incorrect-fixture');await fill('security-new-password','isolated-new-password');await fill('security-confirm-password','isolated-new-password');await submit('.account-security form');await until("document.body.innerText.includes('La contraseña actual no coincide')");assert.equal(await evaluate("localStorage.getItem('backstage_token')"),'isolated-fixture');checks.push('wrong_current_password_keeps_user_signed_in');
 assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await capture('account-security-mobile.png');
 await fill('security-current-password','correct-fixture');await submit('.account-security form');await until("!!document.getElementById('login-password')");assert.equal(await evaluate("localStorage.getItem('backstage_token')"),null);checks.push('successful_password_change_clears_browser_session');
 await signIn();await evaluate("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Mis sesiones abiertas').click();[...document.querySelectorAll('summary')].find(e=>e.textContent==='Cerrar todas mis sesiones').click();true");await fill('security-revoke-password','correct-fixture');await submit('.account-security details details form');await until("!!document.getElementById('login-password')");assert.equal(await evaluate("localStorage.getItem('backstage_token')"),null);checks.push('revoke_all_closes_current_browser');
 assert.deepEqual(errors,[]);
 const report={checked_at:new Date().toISOString(),mode:'isolated_ui_with_api_fixtures',passed:checks,screenshots,runtimeErrors:errors.length,real_email_delivery:false,real_atlas_mutations:false};
 await fs.writeFile(fileURLToPath(new URL('../../docs/evidence/account-security-browser.json',import.meta.url)),JSON.stringify(report,null,2));console.log(JSON.stringify(report));return report;
}
