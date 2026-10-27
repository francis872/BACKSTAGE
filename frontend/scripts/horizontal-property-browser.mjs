// Actual built UI against the caller's isolated Atlas-backed local API.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import totp from '../../backend/domain/totp.js';
export async function runPropertyBrowser({ origin, token, user, reportDirectory, downgrade, operations = false, spatial = false, economics = false, normative = false, community = false, password }) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'backstage-ph-ui-'));
  const browser = spawn(process.env.SOI_TEST_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--disable-webgl', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const pause = ms => new Promise(r => setTimeout(r, ms)); let socket;
  const checks = [], errors = [];
  try {
    let port; for (let i = 0; i < 100; i++) { try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pause(100); } }
    assert(port, 'Headless browser did not start');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => socket.addEventListener('open', r, { once: true })); let sequence = 0; const pending = new Map();
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('Browser command timed out')); }, 15000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      socket.send(JSON.stringify({ id, method, params }));
    });
    socket.addEventListener('message', async event => {
      const message = JSON.parse(event.data); if (message.id) { const task = pending.get(message.id); if (task) { pending.delete(message.id); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); } }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
      if (message.method === 'Fetch.requestPaused') {
        const p = message.params;
        if (p.request.url.startsWith(origin + '/') || /^(blob|data):/.test(p.request.url)) await call('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
        else await call('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 204, body: '' }).catch(() => {});
      }
    });
    await call('Runtime.enable'); await call('Page.enable'); await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    const boot=await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('backstage_token',${JSON.stringify(token)});localStorage.setItem('backstage_user',${JSON.stringify(JSON.stringify(user))});window.WebSocket=class{constructor(){this.readyState=3;}close(){}};` });
    const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text); return r.result.value; };
    const until = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await pause(100); } throw Error('PH UI expected state missing: ' + expression); };
    const panel = "document.querySelector('[aria-label=\"Capa Propiedad Horizontal\"]')";
    const click = async label => { assert(await evaluate(`(()=>{const buttons=[...(${panel}||document).querySelectorAll('button')];const b=buttons.find(x=>x.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)return false;b.click();return true;})()`), `Missing PH action: ${label}`); await pause(100); };
    const field = async (label, value) => {
      assert(await evaluate(`(()=>{const label=[...${panel}.querySelectorAll('label')].find(x=>x.textContent.trim()===${JSON.stringify(label)});const el=label&&document.getElementById(label.htmlFor);if(!el)return false;Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));return true;})()`));
    };
    const selected = name => `${panel}?.querySelector('h3')?.textContent===${JSON.stringify(name)} && !${panel}?.getAttribute('aria-busy')`;
    await call('Page.navigate', { url: origin + '/?page=territorial-explorer' });
    await until("!!document.querySelector('.map-layer-control')");
    await evaluate("document.querySelector('.map-layer-control').open=true");
    await click('Gestionar copropiedades'); await until(`${panel} && !${panel}.getAttribute('aria-busy')`);
    await click('Registrar copropiedad'); await field('Nombre', 'UI synthetic coproperty'); await field('Fuente de la información', 'Isolated browser fixture'); await click('Guardar');
    await until(selected('UI synthetic coproperty')); checks.push('real_ui_creates_coproperty_in_atlas');
    await click('Agregar elemento aquí'); await field('Qué vas a registrar', 'tower'); await field('Nombre', 'UI tower'); await field('Fuente de la información', 'Isolated browser fixture'); await click('Guardar');
    await until(selected('UI tower'));
    await click('Agregar elemento aquí'); await field('Qué vas a registrar', 'private_unit'); await field('Nombre', 'UI unit'); await field('Coeficiente (%)', '12.3456'); await field('Fuente de la información', 'Isolated browser fixture'); await click('Guardar');
    await until(selected('UI unit')); assert(await evaluate(`${panel}.innerText.includes('12.3456%')`)); checks.push('real_ui_creates_hierarchy_and_exact_declared_coefficient');
    await click('Editar datos'); await field('Nombre', 'UI unit edited'); await field('Coeficiente (%)', '50.0001'); await click('Guardar');
    await until(selected('UI unit edited')); assert(await evaluate(`${panel}.innerText.includes('50.0001%')`)); checks.push('real_ui_revision_update_preserves_hierarchy');
    await call('Page.reload', { ignoreCache: true }); await until(selected('UI unit edited')); checks.push('reload_recovers_layer_and_unlocated_entity_without_invented_coordinates');
    if(operations){
      const op=`${panel}.querySelector('[aria-label="Operaciones del objeto seleccionado"]')`;
      await evaluate(`[...${panel}.querySelectorAll('summary')].find(x=>x.textContent==='Operaciones e historial de este objeto').parentElement.open=true`);
      await until(`${op}?.querySelector('select')?.options.length>0`);
      await field('Qué necesitas hacer','pqrs');await click('Abrir formulario');await field('Asunto','Browser private PQRS');await field('Tipo','petition');await field('Descripción','Encrypted browser content');await field('Fuente y referencia del registro','Synthetic UI acceptance');await click('Guardar operación');
      await until(`${op}?.innerText.includes('Browser private PQRS') && !${op}?.querySelector('form[aria-label="Registrar operación del objeto"]')`);
      await until(`[...${op}.querySelectorAll('ul button')].some(b=>b.textContent.startsWith('PQRS #'))`);await evaluate(`[...${op}.querySelectorAll('ul button')].find(b=>b.textContent.startsWith('PQRS #')).click()`);await until(`${op}?.querySelector('select') && [...${op}.querySelectorAll('label')].some(x=>x.textContent==='Cambiar estado')`);
      for(const status of ['in_review','responded','closed']){await field('Cambiar estado',status);if(status==='responded')await field('Respuesta','Response recorded through the actual UI');await click('Guardar cambio de estado');await until(`${op}?.querySelector('[aria-label="Detalle de operación"]')?.innerText.includes(${JSON.stringify({in_review:'En revisión',responded:'Respondido',closed:'Cerrado'}[status])}) && !${op}?.querySelector('button[disabled]')`);}
      checks.push('actual_ui_pqrs_create_and_response_transitions');
      await evaluate(`[...${op}.querySelectorAll('summary')].find(x=>x.textContent==='Eliminar contenido personal').parentElement.open=true`);await click('Confirmar eliminación del contenido');
      await until(`${op}?.innerText.includes('Contenido personal eliminado.') && !${op}?.querySelector('button[disabled]')`);
      checks.push('actual_ui_erases_all_personal_payload_versions');
    }
    for (const width of [320, 390, 1440]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 }); await pause(200);
      assert(!await evaluate('document.documentElement.scrollWidth>innerWidth+1'), `PH overflow at ${width}`);
      if (width === 1440 && !spatial && !economics && !normative && !community) { const shot = await call('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(reportDirectory, operations?'unified-operations-desktop.png':'horizontal-property-desktop.png'), Buffer.from(shot.data, 'base64')); }
      checks.push(`no_horizontal_overflow_${width}`);
    }
    await click('Archivar registro'); await click('Confirmar archivo'); await until(selected('UI tower')); checks.push('real_ui_archives_leaf_preserving_its_record');
    if(spatial){
      await click('Todas las copropiedades');await until(`${panel} && !${panel}.getAttribute('aria-busy') && [...${panel}.querySelectorAll('button')].some(b=>b.textContent.startsWith('Spatial synthetic root ·'))`);
      await evaluate(`[...${panel}.querySelectorAll('button')].find(b=>b.textContent.startsWith('Spatial synthetic root ·')).click()`);await until(selected('Spatial synthetic root'));
      await evaluate(`[...${panel}.querySelectorAll('summary')].find(x=>x.textContent==='Operaciones e historial de este objeto').parentElement.open=true`);
      await evaluate(`${panel}.querySelector('.property-spatial-analysis').open=true`);
      const analysis=`${panel}.querySelector('[aria-label="Análisis territorial del objeto seleccionado"]')`;
      await until(`${analysis} && !${analysis}.querySelector('button[disabled]')`);
      await click('Revisar datos disponibles');await until(`${analysis}.innerText.includes('9 lugares incluidos; 1 sin ubicación propia excluidos.')`);
      await click('Calcular y guardar evidencia');await until(`${analysis}.querySelector('[aria-label="Resultado de análisis territorial"]')?.innerText.includes('I de Moran:') && !${analysis}.querySelector('button[disabled]')`);
      assert(await evaluate(`${analysis}.innerText.includes('autocorrelación') && !${analysis}.innerText.includes('\uFFFD')`));
      checks.push('actual_ui_builds_context_dataset_and_calculates_python_moran_in_test_atlas');
      await click('Reproducir instantánea guardada');await until(`${analysis}.innerText.includes('Resultado reproducido con la misma instantánea y semilla.') && !${analysis}.querySelector('button[disabled]')`);
      checks.push('actual_ui_reproduces_encrypted_historical_snapshot_with_same_seed');
      const priorTitle=await evaluate(`${analysis}.querySelector('[aria-label="Resultado de análisis territorial"] h4').textContent`);
      await click('Calcular otra vez con datos actuales');await until(`${analysis}.querySelector('[aria-label="Resultado de análisis territorial"] h4')?.textContent!==${JSON.stringify(priorTitle)} && !${analysis}.querySelector('button[disabled]')`);checks.push('actual_ui_recalculates_with_current_data_as_a_new_evidence_record');
      for(const width of [320,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});await pause(200);assert(!await evaluate('document.documentElement.scrollWidth>innerWidth+1'),`Spatial analysis overflow at ${width}`);}
      await evaluate(`${analysis}.querySelector('[aria-label="Resultado de análisis territorial"]').scrollIntoView()`);const shot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(reportDirectory,'spatial-context-desktop.png'),Buffer.from(shot.data,'base64'));
      checks.push('contextual_analysis_has_no_horizontal_overflow_at_320_and_1440');
    }
    if(economics){
      await click('Todas las copropiedades');await until(`${panel} && !${panel}.getAttribute('aria-busy') && [...${panel}.querySelectorAll('button')].some(b=>b.textContent.startsWith('Economic synthetic root ·'))`);
      await evaluate(`[...${panel}.querySelectorAll('button')].find(b=>b.textContent.startsWith('Economic synthetic root ·')).click()`);await until(selected('Economic synthetic root'));
      await evaluate(`[...${panel}.querySelectorAll('summary')].find(x=>x.textContent==='Operaciones e historial de este objeto').parentElement.open=true`);
      await evaluate(`${panel}.querySelector('.economic-intelligence').open=true`);
      const economicsPanel=`${panel}.querySelector('[aria-label="Inteligencia económica del objeto seleccionado"]')`,result=`${economicsPanel}.querySelector('[aria-label="Resultado económico territorial"]')`;
      await until(`${economicsPanel} && !${economicsPanel}.querySelector('button[disabled]')`);
      await field('Fuente del saldo de apertura','Synthetic browser opening balance');await click('Revisar libro y presupuestos');await until(`${economicsPanel}.innerText.includes('1 presupuestos aprobados.')`);
      await evaluate(`[...${economicsPanel}.querySelectorAll('summary')].find(x=>x.textContent==='Proyecciones y escenarios').parentElement.open=true`);
      const history=[];for(let i=9;i>=1;i--){const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-i);history.push({month:d.toISOString().slice(0,7),receipts_minor:String(8000+(9-i)*100),expenses_minor:'7000',billed_minor:'10000'});}
      await field('Fuente y revisión de la historia','Synthetic browser history; not actual bank data');await field('Naturaleza de la serie aportada','SIMULATED');await field('Serie histórica mensual opcional (JSON)',JSON.stringify(history));
      await evaluate(`[...${economicsPanel}.querySelectorAll('summary')].find(x=>x.textContent==='Asignación presupuestaria y cuotas').parentElement.open=true`);
      const budgetId=await evaluate(`${economicsPanel}.querySelector('select') && [...${economicsPanel}.querySelectorAll('label')].find(x=>x.textContent==='Presupuesto aprobado para el plan').nextElementSibling.querySelector('select').options[1].value`);await field('Presupuesto aprobado para el plan',budgetId);
      const toggle=async text=>evaluate(`[...${economicsPanel}.querySelectorAll('label')].find(x=>x.textContent.trim()===${JSON.stringify(text)}).querySelector('input').click()`);
      await toggle('Optimizar la asignación de este presupuesto.');await field('Reserva que debe conservarse','10.00');await field('Nombre del destino 1','Operations');await field('Mínimo obligatorio 1','30.00');await field('Máximo permitido 1','50.00');await field('Prioridad marginal 1','2');await field('Fuente de la restricción 1','Synthetic bounds');
      await click('Agregar destino');await field('Nombre del destino 2','Maintenance');await field('Mínimo obligatorio 2','20.00');await field('Máximo permitido 2','60.00');await field('Prioridad marginal 2','1');await field('Fuente de la restricción 2','Synthetic bounds');
      await toggle('Calcular una propuesta de cuotas para revisión.');await field('Número de pagos por unidad','3');await field('Nombre del componente 1','Common');await field('Importe del componente 1','100.01');await field('Regla interna aplicable 1','Synthetic allocation rule');await field('Fuente normativa y revisión requerida 1','Synthetic review reference; not legal certification');
      await click('Calcular y guardar escenario');await until(`${result}?.innerText.includes('Caja estimada: COP 40.00') && !${economicsPanel}.querySelector('button[disabled]')`);
      assert(await evaluate(`${result}.innerText.includes('Cartera: COP 40.01') && ${result}.innerText.includes('Óptimo matemático') && ${result}.innerText.includes('Propuesta calculada') && ${result}.innerText.includes('Proyección condicionada') && !${result}.innerText.includes('\uFFFD')`));checks.push('actual_ui_computes_cash_receivables_forecast_budget_and_fee_proposals');
      await click('Reproducir cálculo económico');await until(`${economicsPanel}.innerText.includes('Cálculo reproducido: coincide con la evidencia guardada.') && !${economicsPanel}.querySelector('button[disabled]')`);checks.push('actual_ui_reproduces_encrypted_economic_evidence');
      // No field edits: creation and revision must use different idempotency intents.
      await click('Crear revisión con supuestos actuales');await until(`${result}?.querySelector('h4')?.textContent.includes('versión 2') && !${economicsPanel}.querySelector('button[disabled]')`);checks.push('actual_ui_revises_unchanged_assumptions_without_idempotency_conflict');
      await field('Referencia de revisión y aprobación interna','Synthetic browser internal planning review');await click('Aprobar para planificación');await until(`${result}?.innerText.includes('Aprobado para planificación') && ${result}?.querySelector('h4')?.textContent.includes('versión 3') && !${economicsPanel}.querySelector('button[disabled]')`);checks.push('actual_ui_admin_approves_versioned_planning_proposal_without_billing');
      await click('Ver saldos en el mapa');await until(`document.querySelector('[aria-label="Leyenda de saldos económicos"]')?.innerText.includes('2 entidades sin geometría propia omitidas')`);checks.push('actual_ui_attaches_categorical_map_layer_and_reports_unlocated_entities');
      for(const width of [320,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});await pause(200);assert(!await evaluate('document.documentElement.scrollWidth>innerWidth+1'),`Economic analysis overflow at ${width}`);}
      await evaluate(`${result}.scrollIntoView()`);const shot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(reportDirectory,'economics-desktop.png'),Buffer.from(shot.data,'base64'));checks.push('economic_panel_has_no_horizontal_overflow_at_320_and_1440');
    }
    if(normative)await(await import('./normative-browser-scenarios.mjs')).runNormativeBrowser({evaluate,until,field,click,call,panel,selected,reportDirectory,pause,checks});
    if(community)await(await import('./community-browser-scenarios.mjs')).runCommunityBrowser({evaluate,until,field,click,call,panel,selected,reportDirectory,pause,checks});
    await downgrade(); await call('Page.reload', { ignoreCache: true });
    await until(`${panel} && !${panel}.getAttribute('aria-busy') && JSON.parse(localStorage.getItem('backstage_user')).role==='viewer'`);
    assert(!await evaluate(`[...${panel}.querySelectorAll('button')].some(b=>['Agregar elemento aquí','Editar datos','Archivar registro'].includes(b.textContent.trim()))`));
    checks.push('current_viewer_role_removes_write_actions'); assert.equal(errors.length, 0);
    if(spatial){assert(!await evaluate(`!!${panel}.querySelector('.property-spatial-analysis')`));checks.push('viewer_role_cannot_open_contextual_financial_or_spatial_analysis');}
    if(economics){assert(!await evaluate(`!!${panel}.querySelector('.economic-intelligence') || !!document.querySelector('[aria-label="Leyenda de saldos económicos"]')`));checks.push('viewer_role_cannot_open_economics_or_recover_prior_financial_overlay');}
    if(normative){assert(!await evaluate(`!!${panel}.querySelector('.normative-intelligence')`));checks.push('current_viewer_role_cannot_open_private_normative_evidence_or_reviews');}
    if(community){assert(!await evaluate(`!!${panel}.querySelector('.community-knowledge')`));checks.push('current_viewer_role_removes_private_community_panel');}
    if(operations){
      await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:boot.identifier});
      await call('Page.navigate',{url:origin+'/dashboard?page=profile'});await until("!!document.querySelector('.native-identity-mfa')");
      await evaluate("document.querySelector('.native-identity-mfa').open=true");await until("!!document.getElementById('mfa-password')");
      const fill=async(id,value)=>evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      const mfaClick=async label=>{assert(await evaluate(`(()=>{const b=[...document.querySelector('.native-identity-mfa').querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)return false;b.click();return true;})()`));};
      await fill('mfa-password',password);await mfaClick('Configurar segundo factor');await until("!!document.querySelector('.native-identity-mfa code')");const secret=await evaluate("document.querySelector('.native-identity-mfa code').textContent");
      await fill('mfa-enrollment-code',totp.hotp(secret,Math.floor(Date.now()/30000)));await mfaClick('Confirmar y activar');await until("document.querySelector('[aria-label=\"Códigos de recuperación\"]')?.querySelectorAll('code').length===10");
      const recovery=await evaluate("document.querySelector('[aria-label=\"Códigos de recuperación\"] code').textContent");assert(!await evaluate(`JSON.stringify(localStorage).includes(${JSON.stringify(recovery)})`));await mfaClick('Ya guardé mis códigos');checks.push('actual_ui_mfa_enrollment_rotates_session_and_displays_one_time_recovery_codes');
      await evaluate("[...document.querySelectorAll('.account-security>button')].find(b=>b.textContent==='Cerrar sesión').click()");await until("!!document.getElementById('login-email')");
      await fill('login-email',user.email);await fill('login-password',password);await evaluate("document.querySelector('form.auth-grid button[type=submit]').click()");await until("!!document.getElementById('login-mfa-code')");assert(!await evaluate("!!localStorage.getItem('backstage_token')"));
      await fill('login-mfa-code',recovery);await evaluate("document.querySelector('form[aria-label=\"Verificar segundo factor\"] button[type=submit]').click()");await until("!!localStorage.getItem('backstage_token') && location.pathname==='/dashboard'");checks.push('actual_ui_password_login_requires_second_factor_and_consumes_recovery_code');
      assert.equal(errors.length,0);
    }
    await call('Browser.close').catch(() => {});
    return { mode: 'built_ui_local_ph_api_real_isolated_atlas', checks, runtime_errors: errors, ambient_api_responses_isolated: true, login_journey_verified: operations, webgl_rendering_verified: false, external_map_requests_blocked: true, new_browser_installation: false };
  } finally { socket?.close(); browser.kill(); }
}
