/** Isolated UI test: all API and external map responses are fixtures, never real operations. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {createRequire} from 'node:module';
import {evaluateComparison} from '../../shared/comparison.mjs';
const require=createRequire(import.meta.url);
const{RESOURCES,CAPABILITIES}=require('../../backend/soi/sanitary.contract');
const capabilities=['assets','operations','fleet','incidents','imports','trips',...CAPABILITIES];
const sanitaryRecords=[];
const assets=[{asset_id:'platform:1',location_id:1,origin:'platform',name:'General fixture',type:'equipment',latitude:0,longitude:0},{asset_id:'soi:1',location_id:null,origin:'soi',name:'Sanitary fixture',type:'plant',latitude:1,longitude:2}];
const snapshots=[];
const feedPosts=[];
const originTest=process.argv.includes('--origin');
const accountSecurityTest=process.argv.includes('--account-security');
const {accountSecurityFixture}=await import('./account-security-scenarios.mjs');
let securityFixture;
let originGeocodeUnavailable=false;
const usability=process.argv.includes('--usability');
const spatial=process.argv.includes('--spatial');
const engines=process.argv.includes('--engines')||spatial;
const phase5=process.argv.includes('--phase5')||engines;
const phase4=accountSecurityTest||originTest||usability||phase5||process.argv.includes('--phase4');
const phase3=phase4||process.argv.includes('--phase3');
const members=[{user_id:9991,organization_id:9992,name:'Fixture owner',email:'fixture@example.invalid',role:'admin'},{user_id:9993,organization_id:9992,name:'Fixture member',email:'member@example.invalid',role:'analyst'}];
const invitations=[];
let profileStatus=200;
const phase2=phase3||process.argv.includes('--phase2');
const projects=[];
let assetReply='normal';
let projectReply='normal';
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const siteArgument=process.argv.indexOf('--site-url');
const remoteSite=siteArgument>=0?process.argv[siteArgument+1]:null;
if(siteArgument>=0&&(!remoteSite||!/^https:\/\/[^/]+\.vercel\.app\/?$/.test(remoteSite)))throw new Error('Explicit HTTPS Vercel site URL required.');
const browser = process.env.SOI_TEST_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'backstage-soi-ui-'));
const server = http.createServer(async (req, res) => {
  try {
    let target = path.resolve(dist, `.${new URL(req.url, 'http://local').pathname}`);
    if (!target.startsWith(path.resolve(dist) + path.sep)) target = path.join(dist, 'index.html');
    try { if (!(await fs.stat(target)).isFile()) target = path.join(dist, 'index.html'); } catch { target = path.join(dist, 'index.html'); }
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
    res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
    res.end(await fs.readFile(target));
  } catch { res.statusCode = 500; res.end(); }
});
server.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const origin = remoteSite?.replace(/\/$/,'')||`http://127.0.0.1:${server.address().port}`;
const processBrowser = spawn(browser, ['--headless=new', '--disable-gpu', ...(originTest?['--disable-webgl']:[]), '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pause(100); } }
  assert.ok(port, 'Headless browser did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const tasks = new Map(), errors = [];
  let cancelledRequests = 0;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timeout=setTimeout(()=>{tasks.delete(key);reject(Error(`CDP timeout: ${method}`));},15000);timeout.unref();
    tasks.set(key, { resolve:value=>{clearTimeout(timeout);resolve(value);}, reject:error=>{clearTimeout(timeout);reject(error);} });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  socket.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);
    if (message.id) { const task = tasks.get(message.id); tasks.delete(message.id); if (message.error?.message==='Invalid InterceptionId.') {cancelledRequests++;task?.resolve({cancelled:true});} else if (message.error) task?.reject(Error(message.error.message)); else task?.resolve(message.result); return; }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        let body = {}, status = 200;
        const endpoint = url.pathname.replace('/api', '');
        const securityReply=accountSecurityTest?securityFixture.reply(endpoint,request.method,request.postData):null;
        if(securityReply){body=securityReply.body;status=securityReply.status;}
        else if(originTest&&endpoint==='/auth/me'&&request.method==='PATCH'){Object.assign(user,JSON.parse(request.postData));body=user;}
        else if(originTest&&endpoint==='/analysis/projects'&&request.method==='POST'){const input=JSON.parse(request.postData);const project={analysis_run_id:projects.length+1,organization_id:user.organization_id,project_name:input.project_name,city:input.city,status:'pending',metadata:{analysis_type:'operational_project',territory:input.territory,analysis_context:input.analysis_context}};projects.push(project);body=project;status=201;}
        else if(originTest&&endpoint==='/spatial/geocode'){if(originGeocodeUnavailable){body={error:'Error interno del servidor.'};status=503;}else body=[{id:'declared-fixture',name:'Geographic fixture',displayName:'Declared geographic fixture, not real Quibdó',coordinates:[0,0],country:'Fixture',source:{name:'Declared test provider',license:'Fixture only'}}];}
        else if(originTest&&endpoint==='/feed'&&request.method==='POST'){const input=JSON.parse(request.postData);const row={...input,operational_event_id:feedPosts.length+1,created_at:new Date().toISOString(),author_name:user.name,comments:[]};feedPosts.unshift(row);body=row;status=201;}
        else if(originTest&&endpoint==='/feed'){body={data:feedPosts};}
        else if (endpoint === '/auth/me'){body=profileStatus===200?user:{error:'Access revoked (fixture)'};status=profileStatus;}
        else if(endpoint==='/users')body=members;
        else if(endpoint==='/users/invitations'&&request.method==='POST'){
          const input=JSON.parse(request.postData);const row={...input,invitation_id:'00000000-0000-4000-8000-'+String(invitations.length+1).padStart(12,'0'),status:'pending',expires_at:'2026-10-29T12:00:00Z'};invitations.push(row);body={invitation:row,token:'a'.repeat(43)};status=201;
        }
        else if(endpoint==='/users/invitations')body={data:invitations};
        else if(endpoint.startsWith('/users/invitations/')&&request.method==='DELETE'){const row=invitations.find(row=>row.invitation_id===endpoint.split('/').at(-1));row.status='revoked';body={status:'revoked'};}
        else if(/^\/users\/\d+$/.test(endpoint)&&request.method==='PUT'){const row=members.find(row=>row.user_id===Number(endpoint.split('/').at(-1)));Object.assign(row,JSON.parse(request.postData));body=row;}
        else if(/^\/users\/\d+$/.test(endpoint)&&request.method==='DELETE'){const index=members.findIndex(row=>row.user_id===Number(endpoint.split('/').at(-1)));members.splice(index,1);body={message:'revoked'};}
        else if(endpoint==='/auth/invitations/accept'){Object.assign(user,{organization_id:7777,organization_name:'Inviting fixture organization',role:'analyst',memberships:[...user.memberships,{organization_id:7777,organization_name:'Inviting fixture organization',role:'analyst'}]});body={token:'accepted-fixture',user};}
        else if(endpoint==='/audit-logs/chain-status')body={enabled:true,complete:true,valid:true,checked:1,hashed_rows:1};
        else if(endpoint==='/audit-logs')body=[{audit_log_id:1,organization_id:9992,user_id:9991,action:'member.updated',resource_type:'identity_memberships',resource_id:'9993',created_at:'2026-10-22T12:00:00Z',event_hash:'fixture-hash'}];
        else if(endpoint==='/assets'&&request.method==='POST'){if(phase2)await pause(600);const input=JSON.parse(request.postData);const id=assets.length+1;const row={...input,asset_id:`platform:${id}`,location_id:id,origin:'platform'};assets.push(row);body={data:row};status=201;}
        else if(endpoint==='/assets'){
          const reply=assetReply;
          if(reply==='delay')await pause(500);
          if(reply==='fail'){status=503;body={error:'Inventario temporalmente no disponible (fixture).'};}
          else {const rows=reply==='empty'?[]:assets;body={data:rows,pagination:{total:rows.length,offset:0,limit:50,next:null}};}
        }
        else if(endpoint==='/comparisons'&&request.method==='POST'){const input=JSON.parse(request.postData);const row={comparison_id:snapshots.length+1,project_name:input.project_name,input,result:evaluateComparison(input)};snapshots.push(row);body={data:row};status=201;}
        else if(/^\/comparisons\/\d+\/project$/.test(endpoint)&&request.method==='POST'){
          const snapshot=snapshots.find(row=>row.comparison_id===Number(endpoint.split('/')[2]));
          if(!snapshot){status=404;body={error:'Comparison unavailable'};}
          else {let project=projects.find(row=>row.analysis_run_id===snapshot.project_analysis_run_id);
            if(!project){const input=JSON.parse(request.postData);const first=snapshot.input.candidates[0];project={organization_id:user.organization_id,analysis_run_id:projects.length+1,project_name:snapshot.project_name,status:'pending',metadata:{analysis_type:'operational_project',territory:input.territory||{name:first.name,coordinates:[first.lng,first.lat]},comparison_snapshot_id:snapshot.comparison_id,comparison_candidates:snapshot.input.candidates,selected_assets:snapshot.input.candidates.map(candidate=>assets.find(asset=>asset.asset_id===candidate.id)).filter(Boolean).map(asset=>({...asset,source_record_id:Number(asset.asset_id.split(':')[1])})),map_context:{center:[first.lng,first.lat],zoom:12}}};projects.push(project);snapshot.project_analysis_run_id=project.analysis_run_id;}
            body={data:project};}
        }
        else if(endpoint==='/comparisons')body={data:snapshots};
        else if(endpoint.startsWith('/comparisons/'))body={data:snapshots.find(row=>row.comparison_id===Number(endpoint.split('/').at(-1)))};
        else if(endpoint==='/clean-com/cases')body=[];
        else if(endpoint==='/spatial/status')body={provider:'isolated-fixture',persistent:false,atlasConfigured:false};
        else if(endpoint.startsWith('/geography/')||endpoint==='/spatial/live-context'){body={error:'External provider unavailable in isolated UI fixture.'};status=503;}
        else if (endpoint === '/soi/catalog') body = { data: { sectors: ['general','water'], capabilities, assetTypes: ['other','building','plant'] } };
        else if (endpoint === '/soi/configuration') body = { data: { sector: 'general', capabilities } };
        else if (endpoint === '/soi/summary') body = { data: { assets: 0, active_operations: 0, vehicles: 0 } };
        else if (endpoint === '/soi/trips/policy') body = { retentionDays: 30 };
        else if (endpoint === '/soi/bsie/validate') body = { data: { operation:'validate',validation:{valid:true,accepted:4},duration_ms:1 } };
        else if(endpoint==='/soi/sanitary/catalog')body={data:{identity:'Operaciones de Inteligencia Sanitaria',resources:RESOURCES}};
        else if(endpoint==='/soi/sanitary/dashboard')body={data:{calculated_at:new Date().toISOString(),capabilities,metrics:{waste_mass_kg_by_kind:{simulated:0},open_alerts:0,maintenance_due_networks:0,sanitation_inspections:0,emissions_kgco2e_by_scope_and_kind:{}},sensor_status:[]}};
        else if(endpoint==='/soi/sanitary/resources/waste-categories'&&request.method==='POST'){const row={...JSON.parse(request.postData),record_id:1,revision:1,created_at:new Date().toISOString()};sanitaryRecords.push(row);body={data:row};status=201;}
        else if(endpoint==='/soi/sanitary/resources/waste-categories')body={data:sanitaryRecords,pagination:{total:sanitaryRecords.length,limit:50,offset:0}};
        else if(endpoint==='/soi/sanitary/resources/measurements')body={data:[{record_id:10,sensor_id:9,value:3,unit:'test-unit',observed_at:'2026-10-21T12:00:00Z',data_kind:'simulated',quality:'unassessed'},{record_id:11,sensor_id:9,value:5,unit:'test-unit',observed_at:'2026-10-21T13:00:00Z',data_kind:'simulated',quality:'unassessed'},{record_id:12,sensor_id:9,value:999,unit:'test-unit',observed_at:'2026-10-21T14:00:00Z',data_kind:'simulated',quality:'invalid'}],pagination:{total:3,limit:50,offset:0}};
        else if (endpoint.startsWith('/soi/')) body = { data: [] };
        else if (endpoint === '/recommendation/example') body = { message: 'Isolated UI fixture' };
        else if(endpoint==='/analysis')body=projects;
        else if(/^\/analysis\/\d+$/.test(endpoint)&&projectReply==='fail'){status=503;body={error:'Temporary fixture failure'};}
        else if(/^\/analysis\/\d+$/.test(endpoint)){body=projects.find(row=>row.analysis_run_id===Number(endpoint.split('/').at(-1)));if(!body){status=404;body={error:'Project unavailable'};}}
        else if(endpoint==='/analysis/operations'||/\/analysis\/\d+\/candidates$/.test(endpoint))body=[];
        else if (['/locations','/real-estate/properties','/retail-zones','/territorial/units','/insights/opportunities','/risk-assessments','/spatial/sources','/spatial/jobs'].includes(endpoint)) body = [];
        await call('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
      } else if (!request.url.startsWith(origin)) await call('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      else await call('Fetch.continueRequest', { requestId });
    }
  });
  const user = { user_id: 9991, organization_id: 9992, role: 'admin', name: 'Isolated UI fixture', email: 'fixture@example.invalid', organization_name: 'Isolated fixture', memberships: [{ organization_id: 9992, role: 'admin', organization_name: 'Isolated fixture' }] };
  securityFixture=accountSecurityFixture(user);
  await call('Runtime.enable'); await call('Page.enable');
  await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  const isolatedSocket = phase4 ? `window.WebSocket=class {constructor(){this.readyState=3;this.timer=setTimeout(()=>this.onerror?.(new Event('error')),0);}close(){clearTimeout(this.timer);}};` : '';
  const bootScript=await call('Page.addScriptToEvaluateOnNewDocument', { source: `${isolatedSocket}localStorage.setItem('backstage_token','isolated-fixture');localStorage.setItem('backstage_user',${JSON.stringify(JSON.stringify(user))});` });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async (expression) => { for (let i = 0; i < 100; i++) { if (await evaluate(`document.body && document.readyState!=='loading' && (${expression})`)) return; await pause(100); } throw Error(`UI timeout: ${expression}\n${await evaluate("document.body?.innerText.slice(0,2000)||'Document loading'")}\n${errors.join('\n')}`); };
  const click = async (label) => {
    console.log(`UI: ${label}`);
    const success = await evaluate(`(() => { const b = [...document.querySelectorAll('.soi-workspace button'),...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
    assert.equal(success, true, `Button missing: ${label}`);
    await pause(200);
  };
  const press = async (key,modifiers=0) => {
    const keyCode={Tab:9,Enter:13,Escape:27}[key];
    await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:keyCode,modifiers,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:keyCode,modifiers});
  };
  if(originTest){const {runOriginScenarios}=await import('./origin-browser-scenarios.mjs');await runOriginScenarios({call,evaluate,until,pause,origin,errors,user,setGeocodeUnavailable:value=>{originGeocodeUnavailable=value;}});}
  else if(accountSecurityTest){const {runAccountSecurityScenarios}=await import('./account-security-scenarios.mjs');await runAccountSecurityScenarios({call,evaluate,until,pause,origin,errors,user,fixture:securityFixture,bootScript});}
  else{
  await call('Page.navigate', { url: `${origin}/dashboard?page=soi` });
  await until("document.body.innerText.includes('Sector') || document.body.innerText.includes('Crear operación')");
  await click('Activos');
  await until("document.body.innerText.includes('Registrar activo')");
  await evaluate("(() => { const input = document.querySelector('.soi-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Draft isolated fixture'); input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await click('SOI Route Intelligence');
  await until("document.body.innerText.includes('Origen, paradas y destino')");
  await click('Cargar caso Miami–Los Ángeles');
  assert.equal(await evaluate("document.querySelectorAll('.soi-waypoint input')[0].value"), 'Miami');
  await evaluate('history.back()');
  await until("document.body.innerText.includes('Crear operación')");
  await click('Activos');
  await until("document.querySelector('.soi-form input')?.value === 'Draft isolated fixture'");
  await click('Configuración');
  await until("document.body.innerText.includes('Sector y capacidades')");
  await click('Estadística espacial');
  await until("document.body.innerText.includes('Backstage Spatial Intelligence Engine')");
  const bsieFile=path.join(profile,'isolated-analytics.geojson');
  await fs.writeFile(bsieFile,JSON.stringify({type:'FeatureCollection',features:[0,1,2,3].map(i=>({type:'Feature',id:String(i),geometry:{type:'Point',coordinates:[-74+i*.001,4]},properties:{value:i}}))}));
  const documentNode=await call('DOM.getDocument');
  const inputNode=await call('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'.bsie-panel input[type=file]'});
  await call('DOM.setFileInputFiles',{nodeId:inputNode.nodeId,files:[bsieFile]});
  await until("document.body.innerText.includes('4 observaciones cargadas')");
  await click('Analizar');
  await until("document.body.innerText.includes('Validación: válida')");
  await evaluate("(() => { const select=[...document.querySelectorAll('.bsie-panel select')].find(s=>[...s.options].some(o=>o.value==='regression'));select.value='regression';select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  await until("document.body.innerText.includes('Spatial Lag (SAR)') && document.body.innerText.includes('diagnósticos LM')");
  await evaluate("(() => { const select=[...document.querySelectorAll('.bsie-panel select')].find(s=>[...s.options].some(o=>o.value==='temporal'));select.value='temporal';select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  await until("document.body.innerText.includes('Ventana en días') && document.body.innerText.includes('intercambiar las etiquetas')");
  await click('Centro sanitario');
  await until("document.querySelector('.sanitary-workspace') && document.body.innerText.includes('Categorías de residuos')");
  await evaluate("(() => { const details=document.querySelector('.sanitary-workspace details');details.open=true;const form=details.querySelector('form');const inputs=form.querySelectorAll('input[type=text]');['Isolated UI category','UI-FIXTURE'].forEach((value,i)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[i],value);inputs[i].dispatchEvent(new Event('input',{bubbles:true}));}); })()");
  await pause(150);await click('Guardar registro');
  await until("document.querySelector('.sanitary-detail')?.innerText.includes('Isolated UI category')");
  assert.equal(sanitaryRecords.length,1,'Sanitary form must submit its data');
  await evaluate("(() => { const select=document.querySelector('.sanitary-toolbar select');select.value='optimization';select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  await until("document.body.innerText.includes('Proponer una operación logística') && document.body.innerText.includes('Matriz de desplazamientos')");
  await evaluate("(() => { const select=document.querySelector('.sanitary-toolbar select');select.value='predictive';select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  await until("document.querySelector('.sanitary-workspace input[type=file]') && document.body.innerText.includes('Horizonte')");
  assert.equal(await evaluate("[...document.querySelectorAll('.sanitary-workspace select option')].some(option=>option.value==='simulated')"),true);
  await evaluate("(() => { const select=document.querySelector('.sanitary-toolbar select');select.value='monitoring';select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  await click('Mediciones ambientales');
  await until("document.querySelectorAll('.sanitary-workspace svg circle').length===2");
  await evaluate("(() => { const select=document.querySelector('.sanitary-toolbar select');select.value='carbon';select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  await click('Factores de emisión');
  await evaluate("document.querySelector('.sanitary-workspace details').open=true");
  await until("document.querySelector('.sanitary-workspace input[type=url]') && document.body.innerText.includes('kgCO₂e por unidad')");
  await click('Comparador inteligente');
  await until("document.body.innerText.includes('Comparador de ubicaciones') && document.body.innerText.includes('3. Resultados')");
  await click('Criterios configurables');
  await until("document.body.innerText.includes('Criterios y evidencia')");
  for(const asset of assets){
    await click('+ Añadir candidato');
    await until("document.querySelector('#comparison-existing-location')?.options.length===2");
    await evaluate(`(() => {const select=document.getElementById('comparison-existing-location');select.value=${JSON.stringify(asset.asset_id)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await click('Añadir ubicación');
  }
  await evaluate(`(() => {
    const fields=[['name','Cost'],['definition','Fixture quoted cost'],['unit','test-unit'],['source','Isolated UI fixture']];
    for(const [field,value] of fields){const input=document.querySelector('input[id^="criterion:"][id$="-'+field+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}
    const direction=document.querySelector('select[id$="-direction"]');direction.value='cost';direction.dispatchEvent(new Event('change',{bubbles:true}));
    const values=[...document.querySelectorAll('input[id$="-value"]')];
    values.forEach(input=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,input.id.startsWith('platform:1-')?'1':'2');input.dispatchEvent(new Event('input',{bubbles:true}));});
  })()`);
  await until("!document.querySelector('button')?.disabled && document.body.innerText.includes('Guardar resultado en BACKSTAGE')");
  await click('Guardar resultado en BACKSTAGE');
  await until("document.body.innerText.includes('Comparación guardada en la organización activa.')");
  assert.equal(snapshots.length,1);assert.equal(snapshots[0].result.ranking[0].id,'platform:1');
  await evaluate("document.querySelector('summary').parentElement.open=true");
  await click('Cargar comparación #1');
  await until("document.body.innerText.includes('Comparación #1 recuperada.')");

  // Recovery flows exercise the global shell separately from the sanitary workspace.
  await click('Centro de operaciones');
  await until("document.querySelector('h1') && document.body.innerText.includes('Centro de Operaciones')");
  assert.equal(await evaluate("!!document.querySelector('.soi-workspace')"),false);
  await click('Activos');
  await until("document.body.innerText.includes('General fixture') && document.body.innerText.includes('Sanitary fixture')");
  await click('Portafolio inmobiliario');
  await until("document.querySelector('section[aria-label=\"Activos de BACKSTAGE\"] > h2')?.textContent==='Activos' && document.body.innerText.includes('Añadir activo')");
  await click('Inventario general');
  await click('Registrar activo general');
  await evaluate("(() => { const input=document.querySelector('form[aria-label=\"Registrar activo general\"] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Registered general fixture');input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await click('Guardar activo general');
  if(phase2)assert.equal(await evaluate("!!document.querySelector('form[aria-label=\"Registrar activo general\"] button[aria-busy=true]:disabled')"),true,'Save button must declare busy and reject duplicate submissions');
  await until("document.body.innerText.includes('Activo registrado en el inventario general.') && document.querySelector('table')?.innerText.includes('Registered general fixture')");
  assert.equal(assets.filter(row=>row.name==='Registered general fixture').length,1);
  await click('Ver activo en mapa');
  await until("document.querySelector('[aria-label=\"Mapa territorial WebGL\"]') && document.body.innerText.includes('Explorador territorial')");
  await click('AirHeart');
  await until("document.body.innerText.includes('AirHeart — Inteligencia Territorial')");
  await click('Proyectos');
  await until("[...document.querySelectorAll('h2')].some(h=>h.textContent==='Proyectos')");
  await click('Activos');
  await until("document.body.innerText.includes('Inventario general')");
  await click('Clean Com');
  await until("document.getElementById('cleancom-title')?.textContent==='Clean Com · archivo histórico' && document.body.innerText.includes('Todavía no hay casos disponibles')");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('page')"),'clean-com');
  await evaluate('history.back()');await until("document.body.innerText.includes('Inventario general')");
  await evaluate('history.forward()');await until("!!document.getElementById('cleancom-title')");

  const viewports=[];
  const screenshotDirectory=fileURLToPath(new URL(`../../docs/backstage-2.0/evidence/${usability?'usability':spatial?'phase-5-spatial-local':engines?'phase-5-engines-local':phase5?'phase-5-local':`phase-${phase4?4:phase3?3:phase2?2:1}`}-ui/`,import.meta.url));
  const designChecks=[];
  if(!remoteSite){
    await fs.mkdir(screenshotDirectory,{recursive:true});
    const captureNamed=async name=>{
      const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await fs.writeFile(path.join(screenshotDirectory,name),Buffer.from(capture.data,'base64'));
    };
    if(usability){
      await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
      await call('Page.navigate',{url:origin+'/dashboard?page=mission-control'});
      await until("document.querySelectorAll('.quick-start__options article').length===3");
      for(const[label,page]of [['Abrir el mapa','territorial-explorer'],['Ver mis proyectos','portfolio-projects'],['Comparar opciones','portfolio-comparator']]){
        await click(label);await until(`new URLSearchParams(location.search).get('page')===${JSON.stringify(page)}`);
        assert(await evaluate("!!document.querySelector('.workspace-guide h2')?.textContent && !!document.querySelector('.workspace-guide p')?.textContent"));
        await click('Inicio');await until("!!document.querySelector('.quick-start')");
      }
      await click('Ver mis proyectos');await until("document.activeElement===document.querySelector('.workspace-guide h2')");
      await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Ayuda para esta pantalla').focus()");await press('Enter');
      await until("!!document.querySelector('dialog.workspace-help[open]:modal')");
      assert(await evaluate("document.querySelector('dialog.workspace-help').textContent.includes('Proyecto') && document.querySelector('dialog.workspace-help').contains(document.activeElement)"));
      await press('Escape');await until("!document.querySelector('dialog.workspace-help[open]')");
      assert.equal(await evaluate('document.activeElement.textContent.trim()'),'Ayuda para esta pantalla');
      await click('Inicio');await until("!!document.querySelector('.quick-start')");
      await click('Lectura cómoda');assert.equal(await evaluate('document.documentElement.dataset.reading'),'comfortable');
      assert(await evaluate("parseFloat(getComputedStyle(document.querySelector('.quick-start p')).fontSize)>=18"));
      await call('Page.navigate',{url:origin+'/dashboard?page=mission-control'});await until("document.documentElement.dataset.reading==='comfortable' && !!document.querySelector('.quick-start')");
      for(const width of [320,360,390,768,1024,1440,1920]){
        await call('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await pause(150);
        assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`Guided home overflow at ${width}`);
        assert(await evaluate("[...document.querySelectorAll('.quick-start button')].every(b=>b.getBoundingClientRect().height>=44)"));
        await evaluate("document.querySelector('.quick-start').scrollIntoView({behavior:'instant',block:'start'})");await captureNamed(`guided-start-${width}.png`);viewports.push({width,page:'guided-start-comfortable',horizontalOverflow:false,screenshot:`guided-start-${width}.png`});
      }
      await call('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:false});
      await click('Ayuda para esta pantalla');await until("!!document.querySelector('dialog.workspace-help[open]')");
      assert(await evaluate("document.querySelector('dialog.workspace-help').getBoundingClientRect().width<=innerWidth"));await captureNamed('plain-language-help-390.png');await press('Escape');
      await click('Lectura cómoda');assert.equal(await evaluate('document.documentElement.dataset.reading'),'standard');
      await call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
      designChecks.push('three_task_choices_preserve_real_navigation','page_title_and_purpose','navigation_focus_announced','keyboard_contextual_help_and_focus_return','comfortable_reading_saved_across_reload','readable_controls_seven_widths_including_320','help_fits_mobile');
    }
    if(phase2){
      await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      if(phase3){
        await click('Activos');
        await until("document.body.innerText.includes('Inventario general') && document.body.innerText.includes('Analizar activo')");
        await click('Analizar activo');
        await until("document.body.innerText.includes('Criterios y evidencia')");
        assert.equal(await evaluate("document.querySelectorAll('input[id$=\"-value\"]').length"),1,'New asset analysis must start with one candidate');
        assert.equal(await evaluate("[...document.querySelectorAll('input[id$=\"-value\"]')].every(input=>input.value==='')"),true,'New analysis must not reuse old measurements');
        await click('+ Añadir candidato');
        await until("!!document.querySelector('#comparison-existing-location')");
        await evaluate("(() => {const select=document.getElementById('comparison-existing-location');select.value='soi:1';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
        await click('Añadir ubicación');
        await evaluate(`(() => {
          for(const [field,value] of [['name','Cost'],['definition','Fixture quoted cost'],['unit','test-unit'],['source','Isolated workflow fixture']]){const input=document.querySelector('input[id^=\"criterion:\"][id$=\"-'+field+'\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}
          const direction=document.querySelector('select[id$=\"-direction\"]');direction.value='cost';direction.dispatchEvent(new Event('change',{bubbles:true}));
          [...document.querySelectorAll('input[id$=\"-value\"]')].forEach((input,i)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(i+1));input.dispatchEvent(new Event('input',{bubbles:true}));});
        })()`);
        await until("document.body.innerText.includes('Guardar resultado en BACKSTAGE')");
        await click('Guardar resultado en BACKSTAGE');
        await until("document.body.innerText.includes('Comparación guardada en la organización activa.') && document.body.innerText.includes('Crear proyecto desde este análisis')");
        await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent==='Crear proyecto desde este análisis').closest('.form-section').scrollIntoView()");
        await captureNamed('workflow-analysis.png');
        await click('Crear proyecto desde este análisis');
        await until("document.body.innerText.includes('Proyectos operativos') && document.body.innerText.includes('Análisis guardado #2')");
        assert.equal(projects.length,1);
        assert.deepEqual(projects[0].metadata.territory.coordinates,[0,0]);
        assert.deepEqual(projects[0].metadata.selected_assets.map(asset=>asset.asset_id),['platform:1','soi:1']);
        await evaluate("[...document.querySelectorAll('article.card')].find(card=>card.textContent.includes('Análisis guardado #2')).scrollIntoView()");
        await captureNamed('workflow-project.png');
        await click('Recuperar análisis');
        await until("document.body.innerText.includes('Comparación #2 recuperada.') && document.body.innerText.includes('Resultado guardado #2')");
        assert.equal(await evaluate("new URLSearchParams(location.search).get('project')"),'1');
        assert.equal(await evaluate("new URLSearchParams(location.search).get('comparison')"),'2');
        await call('Page.reload');
        await until("document.body.innerText.includes('Comparación #2 recuperada.') && document.body.innerText.includes('Resultado guardado #2')");
        assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('backstage_operational_context:9991:9992')).territory.coordinates"),[0,0]);
        await evaluate('history.back()');
        await until("document.body.innerText.includes('Proyectos operativos') && document.body.innerText.includes('Análisis guardado #2')");
        await evaluate('history.forward()');
        await until("document.body.innerText.includes('Comparación #2 recuperada.')");
        // Edited measurements cannot create a project from the stale saved result.
        await evaluate("(() => {const input=document.querySelector('input[id$=\"-value\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'42');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
        await until("![...document.querySelectorAll('button')].some(button=>button.textContent==='Crear proyecto desde este análisis')");
        projectReply='fail';await call('Page.reload');
        await until("document.body.innerText.includes('Volver a recuperar proyecto')");
        assert.equal(await evaluate("JSON.parse(localStorage.getItem('backstage_operational_context:9991:9992')).analysis_run_id"),1,'Temporary project failure must preserve the recoverable reference');
        projectReply='normal';await click('Volver a recuperar proyecto');
        await until("!document.body.innerText.includes('Volver a recuperar proyecto') && JSON.parse(localStorage.getItem('backstage_operational_context:9991:9992')||'null')?.asset_id==='platform:1'");
        // Recover from the shareable URL with no stored workspace or browser history frame.
        await evaluate("localStorage.removeItem('backstage_operational_context:9991:9992')");
        await call('Page.navigate',{url:`${origin}/dashboard?page=portfolio-comparator&project=1&comparison=2`});
        await until("document.body.innerText.includes('Comparación #2 recuperada.') && document.body.innerText.includes('Resultado guardado #2')");
        await until("JSON.parse(localStorage.getItem('backstage_operational_context:9991:9992')||'null')?.asset_id==='platform:1'");
        await click('Crear proyecto desde este análisis');
        await until("document.body.innerText.includes('Proyectos operativos')");
        assert.equal(projects.length,1,'Reopening a linked analysis must not duplicate its project');
        for(const width of [390,1440]){
          await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(350);
          const layout=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');
          assert(layout.scroll<=width+1,`Project overflow at ${width}: ${JSON.stringify(layout)}`);
          await evaluate("[...document.querySelectorAll('article.card')].find(card=>card.textContent.includes('Análisis guardado #2')).scrollIntoView()");
          await captureNamed(`workflow-project-${width}.png`);
        }
        await click('Recuperar análisis');
        await until("document.body.innerText.includes('Resultado guardado #2')");
        await evaluate("(() => {const input=document.querySelector('input[id$=\"-value\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'3');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
        await click('Guardar resultado en BACKSTAGE');
        await until("document.body.innerText.includes('Resultado guardado #3')");
        assert.equal(await evaluate("new URLSearchParams(location.search).get('project')"),null,'New snapshot must not inherit the previous project link');
        await call('Page.reload');
        await until("document.body.innerText.includes('Comparación #3 recuperada.') && document.body.innerText.includes('Resultado guardado #3')");
        assert.equal(projects.length,1);assert.equal(snapshots[1].project_analysis_run_id,1);assert.equal(snapshots[2].project_analysis_run_id,undefined);
      }
      if(phase4){
        const captureCore = async (name,selector) => {
          for(const width of [390,1440]){
            await call('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await pause(100);
            assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,`${name}: horizontal overflow at ${width}`);
            await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView()`);
            await captureNamed(`${name}-${width}.png`);
          }
        };
        await click('Organización');await until("document.body.innerText.includes('Configuración de organización')");
        await click('Miembros y roles');await until("document.body.innerText.includes('member@example.invalid')");
        await click('Invitar miembro');
        await evaluate("(() => {const form=document.querySelector('form[aria-label=\"Crear invitación\"]');const input=form.querySelector('input[type=email]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'recipient@example.invalid');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
        await click('Generar invitación');
        await until("document.body.innerText.includes('Invitación creada.')");
        assert.equal(invitations.length,1);
        assert.equal(await evaluate("[...document.querySelectorAll('input')].some(input=>input.value.includes('#invitation='))"),true);
        await captureCore('core-invitation','form[aria-label="Crear invitación"]');
        await evaluate("[...document.querySelectorAll('details')].find(item=>item.textContent.includes('Invitaciones de la organización')).open=true");
        await click('Revocar invitación');await until("document.body.innerText.includes('Invitación revocada.')");
        await evaluate("[...document.querySelectorAll('article.card')].find(card=>card.textContent.includes('member@example.invalid')).querySelector('button').click()");
        await until("!!document.querySelector('#member-role')");
        await evaluate("(() => {const select=document.querySelector('#member-role');select.value='viewer';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
        await click('Actualizar rol');await until("document.body.innerText.includes('Miembro actualizado.')");
        assert.equal(members.find(row=>row.user_id===9993).role,'viewer');
        await evaluate("window.confirm=()=>true;[...document.querySelectorAll('article.card')].find(card=>card.textContent.includes('member@example.invalid')).querySelectorAll('button')[1].click()");
        await until("document.body.innerText.includes('Acceso del miembro revocado')");assert.equal(members.length,1);
        await click('Auditoría');await until("document.querySelector('.audit-table')?.innerText.includes('member.updated')");
        assert.equal(await evaluate("document.querySelector('.audit-table').innerText.includes('identity_memberships #9993')"),true);
        await until("document.body.innerText.includes('Cadena hash íntegra')");
        await captureCore('core-audit','.audit-workspace');
        const originalUser=structuredClone(user);
        user.role='viewer';await evaluate("window.dispatchEvent(new Event('focus'))");
        await until("document.querySelector('.identity-role')?.innerText.includes('Consulta') && !document.body.innerText.includes('Miembros y roles')");
        profileStatus=403;await evaluate("window.dispatchEvent(new Event('focus'))");
        await until("!!document.getElementById('auth-heading') && localStorage.getItem('backstage_token')===null");
        profileStatus=200;Object.assign(user,originalUser);
        await call('Page.navigate',{url:`${origin}/dashboard?page=organization-settings#invitation=${'b'.repeat(43)}`});
        await until("!!document.querySelector('form[aria-label=\"Aceptar invitación\"]')");
        await click('Aceptar invitación');await until("document.querySelector('.identity-role')?.innerText.includes('Analista') && document.body.innerText.includes('Inviting fixture organization')");
        assert.equal(await evaluate('location.hash'),'');
        await captureCore('core-accepted','form[aria-label="Aceptar invitación"]');
        Object.assign(user,originalUser);
        await call('Page.navigate',{url:`${origin}/dashboard?page=mission-control`});
        await until("document.querySelector('.identity-role')?.innerText.includes('Administrador') && document.body.innerText.includes('Centro de Operaciones')");
      }
      console.log('UI: design system accessibility and failure states');
      await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      assetReply='delay';await click('Activos');
      await until("document.querySelector('[role=status]')?.textContent.includes('Consultando activos') || [...document.querySelectorAll('[role=status]')].some(e=>e.textContent.includes('Consultando activos'))");
      await captureNamed('state-loading.png');
      await until("document.querySelector('table')?.innerText.includes('Registered general fixture')");
      assetReply='fail';await evaluate("window.dispatchEvent(new Event('backstage:data-changed'))");
      await until("document.querySelector('[role=alert]')?.textContent.includes('No se pudo consultar el inventario')");
      assert.equal(await evaluate("document.querySelector('table')?.innerText.includes('Registered general fixture')"),true,'A temporary failure must retain the last successful inventory');
      await captureNamed('state-error.png');
      assetReply='normal';await click('Volver a consultar inventario');await until("!document.querySelector('[role=alert]')");
      assetReply='empty';await evaluate("window.dispatchEvent(new Event('backstage:data-changed'))");
      await until("document.body.innerText.includes('No hay activos en esta página del inventario.')");
      await captureNamed('state-empty.png');
      assetReply='normal';await evaluate("window.dispatchEvent(new Event('backstage:data-changed'))");
      await until("document.querySelector('table')?.innerText.includes('Registered general fixture')");
      await click('Registrar activo general');
      assert.equal(await evaluate("(() => {const input=document.querySelector('#general-asset-form input');return !!input.id&&document.querySelector('label[for=\"'+input.id+'\"]')?.textContent==='Nombre'&&parseFloat(getComputedStyle(input).fontSize)>=16;})()"),true,'Form controls need visible labels and readable mobile text');
      await captureNamed('asset-form.png');
      await evaluate("document.querySelector('#general-asset-form').requestSubmit()");
      assert.equal(await evaluate("document.querySelector('#general-asset-form input').validity.valueMissing"),true);
      assert.equal(assets.length,3,'Invalid form must not send an asset');
      await click('Registrar activo general');
      designChecks.push('loading_state','busy_save_prevents_duplicate_submission','recoverable_error_preserves_inventory','empty_state','associated_form_labels','native_required_validation');

      await click('Comparador inteligente');await until("document.body.innerText.includes('Comparador de ubicaciones')");await click('Análisis territorial');await until("document.body.innerText.includes('3. Resultados')");
      for(const mode of ['Análisis territorial','Criterios configurables']){
        await click(mode);
        await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='+ Añadir candidato').focus()");
        await click('+ Añadir candidato');
        await until("!!document.querySelector('dialog[open]:modal')");
        assert.equal(await evaluate("(() => {const d=document.querySelector('dialog');return d.contains(document.activeElement)&&document.getElementById(d.getAttribute('aria-labelledby'))?.textContent==='Añadir candidato';})()"),true);
        for(let i=0;i<18;i++){await press('Tab');assert.equal(await evaluate("!!document.activeElement.closest('dialog')"),true,'Modal keyboard focus escaped');}
        await evaluate("document.querySelector('.side-menu button').focus()");
        assert.equal(await evaluate("!!document.activeElement.closest('dialog')"),true,'Modal background must be inert');
        await press('Escape');await until("!document.querySelector('dialog[open]')");
        assert.equal(await evaluate("document.activeElement.textContent.trim()==='+ Añadir candidato'"),true,'Closing dialog must restore focus');
        await click('+ Añadir candidato');
        await call('Input.dispatchMouseEvent',{type:'mousePressed',x:1,y:1,button:'left',clickCount:1});
        await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:1,y:1,button:'left',clickCount:1});
        await until("!document.querySelector('dialog[open]')");
      }
      designChecks.push('both_dialogs_named_and_modal','modal_tab_containment','modal_background_inert','escape_restores_trigger_focus','backdrop_closes_dialog');

      await call('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:false});
      await until("document.querySelector('.side-nav').inert");
      await evaluate("document.querySelector('.mobile-nav-toggle').focus()");
      assert.equal(await evaluate("document.activeElement===document.querySelector('.mobile-nav-toggle')"),true,'Mobile menu trigger must receive keyboard focus');
      await press('Enter');
      await until("document.querySelector('.mobile-nav-toggle').getAttribute('aria-expanded')==='true'");
      assert.equal(await evaluate("document.querySelector('#backstage-main').inert && !!document.activeElement.closest('.side-nav')"),true);
      await evaluate("document.querySelector('#backstage-main button').focus()");
      assert.equal(await evaluate("!!document.activeElement.closest('.side-nav')"),true);
      await press('Escape');await until("document.querySelector('.side-nav').inert");
      assert.equal(await evaluate("document.activeElement===document.querySelector('.mobile-nav-toggle')"),true);
      await evaluate("document.querySelector('.ui-skip-link').focus()");await press('Enter');
      assert.equal(await evaluate("document.activeElement.id==='backstage-main'"),true);
      designChecks.push('mobile_menu_hidden_from_keyboard','mobile_menu_background_inert','mobile_escape_restores_trigger','skip_to_main');
    }
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    for(const width of [360,390,768,1024,1280,1440,1920]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});
      for(const [label,page] of [['Centro de operaciones','command'],['Activos','assets'],['Comparador inteligente','comparison']]){
        if(width<1024) await evaluate("(() => {const b=document.querySelector('.mobile-nav-toggle');if(b&&getComputedStyle(b).display!=='none'&&!document.querySelector('.side-nav.mobile-open'))b.click();})()");
        await click(label);
        if(page==='comparison'){await until("document.body.innerText.includes('Comparador de ubicaciones')");await click('Análisis territorial');}
        await until(page==='command'?"document.body.innerText.includes('Centro de Operaciones')":page==='assets'?"document.querySelector('table')?.innerText.includes('Registered general fixture')":"document.body.innerText.includes('3. Resultados')");
        await pause(100);
        const layout=await evaluate('({viewport:innerWidth,document:document.documentElement.scrollWidth,reducedMotion:matchMedia("(prefers-reduced-motion: reduce)").matches})');
        assert(layout.document<=width+1,`${page}: horizontal page overflow at ${width}: ${layout.document}`);
        assert(layout.reducedMotion);
        const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        const name=`${page}-${width}.png`;await fs.writeFile(path.join(screenshotDirectory,name),Buffer.from(capture.data,'base64'));
        viewports.push({width,page,horizontalOverflow:false,screenshot:name});
        if(phase2&&page==='comparison'){
          await click('+ Añadir candidato');await until("!!document.querySelector('dialog[open]:modal')");
          const bounds=await evaluate("(() => {const d=document.querySelector('dialog');const b=d.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,animation:getComputedStyle(d).animationName};})()");
          assert(bounds.left>=0&&bounds.right<=width&&bounds.top>=0&&bounds.bottom<=960,'Dialog must fit the viewport');assert.equal(bounds.animation,'none');
          const dialogName=`dialog-${width}.png`;await captureNamed(dialogName);viewports.push({width,page:'dialog',horizontalOverflow:false,screenshot:dialogName});
          await press('Escape');
        }
      }
    }
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    assert.equal(await evaluate("document.activeElement!==document.body"),true,'Keyboard focus must reach an interactive control');
    if(phase2){
      await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:bootScript.identifier});
      await evaluate("localStorage.removeItem('backstage_token');localStorage.removeItem('backstage_user');sessionStorage.clear()");
      await call('Page.navigate',{url:origin+'/'});await until("!!document.querySelector('.orbital-entry canvas')");
      for(const width of [360,390,768,1024,1280,1440,1920]){
        await call('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await pause(100);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
        const name=`orbital-${width}.png`;await captureNamed(name);viewports.push({width,page:'orbital',horizontalOverflow:false,screenshot:name});
      }
      await evaluate("document.querySelector('.orbital-launch').focus()");await press('Enter');
      await until("!!document.getElementById('auth-heading')");
      assert.equal(await evaluate("location.pathname==='/login'"),true);
      await captureNamed('access-preserved.png');
      if(usability){
        await evaluate("(()=>{const input=document.getElementById('login-password');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'local-only-example-password');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
        await click('Mostrar contraseña');assert.equal(await evaluate("document.getElementById('login-password').type"),'text');assert.equal(await evaluate("document.getElementById('login-password').value"),'local-only-example-password');
        await click('Ocultar contraseña');assert.equal(await evaluate("document.getElementById('login-password').type"),'password');
        await click('Crear cuenta');await until("!!document.getElementById('register-password')");assert(await evaluate("!!document.getElementById(document.getElementById('register-password').getAttribute('aria-describedby'))"));
        await click('Mostrar contraseñas');assert(await evaluate("document.getElementById('register-password').type==='text'&&document.getElementById('register-confirm-password').type==='text'"));
        await click('Iniciar sesión');await until("document.getElementById('login-password')?.type==='password'");
        designChecks.push('show_hide_password_preserves_value','registration_requirements_explained','password_visibility_resets_between_auth_modes');
      }
      designChecks.push('dialog_fits_seven_widths','reduced_motion_dialog','orbital_entry_preserved_seven_widths','orbital_keyboard_reduced_motion_transition','access_preserved');
    }
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
  const report={checked_at:new Date().toISOString(),mode: remoteSite?'deployed_assets_with_isolated_api_fixtures':'isolated_ui_with_api_fixtures',...(remoteSite?{site:origin}:{}), passed: ['workspace', 'asset_draft_survives_navigation', 'browser_back', 'sector_configuration', 'route_miami_la_inputs', 'bsie_geojson_upload_and_validation_result', 'bsie_spatial_model_selection', 'bsie_temporal_controls', 'sanitary_center_render', 'sanitary_category_form_submission', 'sanitary_optimization_controls', 'sanitary_prediction_controls_and_source_kind', 'sanitary_measurement_timeline_excludes_invalid', 'sanitary_factor_provenance_fields', 'comparator_render'], runtimeErrors: errors.length };
  report.passed.push('global_command_restored','both_asset_sources','original_real_estate_access','general_asset_form_submission','clean_com_separate_deep_link','browser_back_forward','both_comparison_modes','comparison_select_both_sources_save_retrieve');
  report.passed.push('asset_to_explorer','airheart_access','projects_access');
  if(phase4)report.websocketUI='Unavailable transport fixture; native HTTP/WebSocket authorization is verified separately in backend integration tests.';
  if(phase4)report.coreChecks=['manual_invitation_link','pending_invitation_revoked','member_role_changed','member_access_revoked','audit_contract_visible','audit_chain_visible','current_profile_downgrade_updates_ui','revoked_profile_closes_session','explicit_invitation_acceptance_switches_organization'];
  report.mapProviders='External map requests blocked; live cartographic rendering is not certified by this fixture run.';
  report.viewports=viewports;
  report.cancelledFixtureRequests=cancelledRequests;
  if(phase2){report.phase=phase5?5:phase4?4:phase3?3:2;report.designChecks=designChecks;}
  if(phase3)report.workflowChecks=['asset_starts_clean_analysis','both_asset_sources_retained','saved_snapshot_creates_original_project','project_recovers_evidence','reload_preserves_context','back_forward_preserves_context','url_recovers_without_browser_workspace','project_retry_is_idempotent','edited_evidence_invalidates_saved_action','temporary_project_failure_preserves_context_and_retries','new_version_does_not_inherit_previous_project'];
  await fs.writeFile(fileURLToPath(new URL(usability?'../../docs/backstage-2.0/evidence/usability-browser.json':spatial?'../../docs/backstage-2.0/evidence/phase-5-spatial-browser.json':engines?'../../docs/backstage-2.0/evidence/phase-5-engines-browser.json':phase5?'../../docs/backstage-2.0/evidence/phase-5-browser.json':phase4?'../../docs/backstage-2.0/evidence/phase-4-browser.json':phase3?'../../docs/backstage-2.0/evidence/phase-3-browser.json':phase2?'../../docs/backstage-2.0/evidence/phase-2-browser.json':remoteSite?'../../docs/evidence/soi-cloud-ui.json':'../../docs/evidence/soi-browser-smoke.json',import.meta.url)),JSON.stringify(report,null,2),'utf8');
  console.log(JSON.stringify(report));
  }
  await call('Browser.close').catch(() => {});
} finally {
  socket?.close(); processBrowser.kill(); server.close();
  // Generated browser profile remains under the OS temp directory; no recursive deletion.
}
