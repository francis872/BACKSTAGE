// Real hosted integration. No API interception; all writes belong to new test tenants.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { state, root } = require('../../scripts/staging-vercel');
const { ownedFilters, COLLECTIONS: CORE_COLLECTIONS } = require('./verify-platform-core-atlas');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const spatial = process.argv.includes('--spatial') || process.argv.includes('--readiness');
const engines = process.argv.includes('--engines') || spatial;
const phase5 = process.argv.includes('--phase5') || engines;
const evidencePrefix = process.argv.includes('--readiness') ? 'readiness' : spatial ? 'phase-5-spatial' : engines ? 'phase-5-engines' : phase5 ? 'phase-5' : 'staging';
const SPATIAL_COLLECTIONS = ['soi_configuration','soi_assets','soi_vehicles','soi_optimization_scenarios','soi_domain_events'];
const COLLECTIONS = spatial ? [...CORE_COLLECTIONS,'analytics_jobs','property_valuations',...SPATIAL_COLLECTIONS] : engines ? [...CORE_COLLECTIONS, 'analytics_jobs', 'property_valuations'] : CORE_COLLECTIONS;
const origin = type => `https://${state.projects[type].deployment.url.replace(/^https:\/\//, '')}`;
async function request(route, { session, org, body, method = body ? 'POST' : 'GET', expected = 200, type = 'web' } = {}) {
  const r = await fetch(origin(type) + (type === 'web' ? '/api' : '') + route, { method, redirect: 'error', signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json', 'x-vercel-protection-bypass': state.projects[type].bypass, ...(session ? { Authorization: `Bearer ${session.token}`, 'X-Organization-Id': String(org || session.user.organization_id) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await r.text(); let value; try { value = JSON.parse(text); } catch { throw new Error(`Non-JSON staging response: ${route} HTTP ${r.status}`); }
  if (expected != null) assert.equal(r.status, expected, `${method} ${route}: HTTP ${r.status}, ${value.code || value.error || ''}`);
  return { status: r.status, value, request_id: r.headers.get('x-request-id') };
}
async function browser(label, directory, { softwareWebGL = false } = {}) {
  const profile = path.join(directory, `browser-${label}`); fs.mkdirSync(profile, { recursive: true });
  const child = spawn(process.env.SOI_TEST_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', ...(softwareWebGL?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--disable-gpu']), '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    let port;
    for (let i = 0; i < 100; i++) { try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch { await pause(100); } }
    assert(port, 'Chrome did not start');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const tasks = new Map(), requests = [], errors = [], loadedDocuments = new Set(); let sequence = 0;
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { tasks.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 75000);
      tasks.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      socket.send(JSON.stringify({ id, method, params }));
    });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) { const task = tasks.get(message.id); tasks.delete(message.id); if (message.error) task?.reject(new Error(message.error.message)); else task?.resolve(message.result); }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
      if (message.method === 'Page.lifecycleEvent' && message.params.name === 'DOMContentLoaded') loadedDocuments.add(message.params.loaderId);
      if (message.method === 'Network.responseReceived') {
        const r = message.params.response, u = new URL(r.url);
        if (u.origin === origin('web') && u.pathname.startsWith('/api/')) requests.push({ path: u.pathname, status: r.status, at: Date.now() });
      }
    });
    await call('Runtime.enable'); await call('Page.enable'); await call('Page.setLifecycleEventsEnabled', { enabled: true }); await call('Network.enable');
    // Exchange protection credential for a host-scoped HttpOnly cookie. Never add
    // global headers: map/provider requests must never receive this credential.
    const access = await fetch(origin('web') + '/', { redirect: 'manual', headers: { 'x-vercel-protection-bypass': state.projects.web.bypass, 'x-vercel-set-bypass-cookie': 'true' } });
    const cookies = access.headers.getSetCookie(); assert(cookies.length, 'Protected browser cookie missing');
    for (const raw of cookies) { const first = raw.split(';')[0], split = first.indexOf('='); await call('Network.setCookie', { name: first.slice(0, split), value: first.slice(split + 1), url: origin('web'), secure: true, httpOnly: true }); }
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const evaluate = async expression => { const out = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (out.exceptionDetails) throw new Error(`Browser expression failed: ${out.exceptionDetails.text}`); return out.result.value; };
    const until = async expression => { for (let i = 0; i < 180; i++) { if (await evaluate(expression)) return; await pause(250); } throw new Error(`Browser timeout: ${expression}`); };
    const click = async text => { await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`); const ok = await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true})()`); assert(ok, `Missing/disabled button ${text}`); await pause(200); };
    const set = async (selector, value) => { await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`); };
    const navigate = async route => {
      const frame = await call('Page.navigate', { url: origin('web') + route });
      assert(!frame.errorText, 'Hosted page navigation failed');
      if (frame.loaderId) {
        for (let i = 0; i < 180 && !loadedDocuments.has(frame.loaderId); i++) await pause(250);
        assert(loadedDocuments.has(frame.loaderId), 'New hosted document did not load');
      }
      await until(`document.readyState!=='loading' && location.origin===${JSON.stringify(origin('web'))}`);
    };
    const reload = async () => { const current = new URL(await evaluate('location.href')); await navigate(current.pathname + current.search + current.hash); };
    const login = async (account, route = '/login') => { await navigate(route); await until("!!document.querySelector('#login-email')"); await set('#login-email', account.email); await set('#login-password', account.password); await evaluate("document.querySelector('#login-email').closest('form').requestSubmit()"); await until("!!localStorage.getItem('backstage_token') && !!document.querySelector('.identity-role')"); };
    const capture = async name => { const file = name === 'failure.png' ? path.join(directory, `${label}-failure.png`) : path.join(root, `docs/backstage-2.0/evidence/${evidencePrefix}-ui`, name); fs.mkdirSync(path.dirname(file), { recursive: true }); const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); };
    return { call, evaluate, until, click, set, navigate, reload, login, capture, requests, errors, close: () => { socket.close(); child.kill(); } };
  } catch (error) { socket?.close(); child.kill(); throw error; }
}
async function run() {
  const mongo = require('../infrastructure/platformMongo');
  const report = { started_at: new Date().toISOString(), mode: 'real_protected_hosting_browser_proxy_atlas', api_interception: false, checks: [], screenshots: [], operational_documents_touched: false };
  const runId = `atlas-core-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomBytes(6).toString('hex')}`;
  const marker = `BACKSTAGE STAGING TEST ${runId}`;
  const directory = path.join(root, '.vercel', `staging-${runId}`); fs.mkdirSync(directory, { recursive: true });
  const ownership = { run_id: runId, organization_ids: [], user_ids: [], organizations: {}, users: {} };
  let db, ownerBrowser, recipientBrowser, stage = 'preflight';
  const check = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log(JSON.stringify({ stage: name })); };
  const persist = () => fs.writeFileSync(path.join(directory, 'ownership.json'), JSON.stringify(ownership, null, 2), { mode: 0o600 });
  const accounts = [];
  async function assertOwnership() {
    const filters = ownedFilters(ownership);
    if (engines) for(const name of ['analytics_jobs','property_valuations']) filters[name] = { organization_id: { $in: ownership.organization_ids } };
    if(spatial) for(const name of SPATIAL_COLLECTIONS) filters[name] = { organization_id: { $in: ownership.organization_ids } };
    for (const row of await db.collection('identity_organizations').find(filters.identity_organizations).toArray()) assert.equal(row.name, ownership.organizations[row.organization_id]);
    for (const row of await db.collection('identity_users').find(filters.identity_users).toArray()) { assert.equal(row.email, ownership.users[row.user_id]); assert(row.email.startsWith(runId) && row.name.startsWith(marker)); }
    const memberships = await db.collection('identity_memberships').find({ user_id: { $in: ownership.user_ids } }).toArray(); assert(memberships.every(row => ownership.organization_ids.includes(row.organization_id)));
    return filters;
  }
  try {
    for (const type of ['api', 'web']) { assert.equal(state.projects[type].deployment.readyState, 'READY'); assert.equal(state.projects[type].deployment.target, 'preview'); assert.match(origin(type), /^https:\/\/backstage-staging-[a-z0-9-]+\.vercel\.app$/); }
    db = await mongo.getMongoDatabase();
    assert.equal(crypto.createHash('sha256').update(`${process.env.MONGODB_URI}\n${db.databaseName}`).digest('hex'), state.target_fingerprint);
    report.run_id = runId; report.target_fingerprint = state.target_fingerprint; report.deployments = Object.fromEntries(['api', 'web'].map(type => [type, state.projects[type].deployment]));
    for (const type of ['api', 'web']) { const publicReply = await fetch(origin(type) + (type === 'web' ? '/api/health' : '/health'), { redirect: 'manual' }); assert([302, 401, 403].includes(publicReply.status)); const health = await request('/health', { type }); assert.equal(health.value.primaryStore, 'mongodb'); assert(health.request_id); }
    await request('/assets', { expected: 401 });
    check('protected_preview_health_mongodb_and_request_id_through_proxy');
    stage = 'register';
    for (const label of ['owner', 'recipient']) {
      const account = { name: `${marker} ${label}`, email: `${runId}-${label}@example.invalid`, password: crypto.randomBytes(24).toString('base64url'), organization_name: `${marker} ${label}` };
      const session = (await request('/auth/register', { body: account, expected: 201 })).value;
      const org = session.user.organization_id, id = session.user.user_id;
      ownership.organization_ids.push(org); ownership.user_ids.push(id); ownership.organizations[org] = account.organization_name; ownership.users[id] = account.email; persist();
      accounts.push({ ...account, session }); fs.writeFileSync(path.join(directory, 'accounts.json'), JSON.stringify(accounts), { mode: 0o600 });
    }
    const [owner, recipient] = accounts; const org = owner.session.user.organization_id;
    const ownerRequest = (route, options = {}) => request(route, { session: owner.session, ...options });
    assert.equal(await db.collection('identity_users').countDocuments({ user_id: { $in: ownership.user_ids } }), 2);
    check('new_hosted_accounts_persist_from_independent_atlas_process');
    stage = 'browser_login';
    ownerBrowser = await browser('owner', directory); const b = ownerBrowser;
    await b.navigate('/'); await b.until("document.body.innerText.includes('BACKSTAGE')"); await b.capture('entry-1440.png'); report.screenshots.push('entry-1440.png');
    await b.login(owner); await b.until("document.body.innerText.includes('Centro de Operaciones')");
    const stored = await b.evaluate("JSON.parse(localStorage.getItem('backstage_user'))"); assert.equal(stored.organization_id, org);
    check('orbital_entry_and_real_browser_login_verified_via_auth_me');
    stage = 'browser_territory_asset';
    if(await b.evaluate("!!document.querySelector('.home-place-search')"))await b.evaluate("document.querySelector('.home-place-search').open=true");
    // Device coordinates are intentionally emulated; no claim of physical GPS.
    await b.call('Browser.grantPermissions', { origin: origin('web'), permissions: ['geolocation'] });
    await b.call('Emulation.setGeolocationOverride', { latitude: 0, longitude: 0, accuracy: 10 });
    await b.click('Usar mi ubicación'); await b.until("document.querySelector('.territory-live-heading')?.textContent.includes('0.0000')");
    await b.click('Activos'); await b.until("document.body.innerText.includes('Inventario general')"); await b.click('Registrar activo general'); await b.set('#general-asset-form input', `${marker} primary`); await b.click('Guardar activo general');
    await b.until("document.querySelector('table')?.innerText.includes('primary')");
    const asset = await db.collection('locations').findOne({ organization_id: org, name: `${marker} primary` }); assert(asset); assert.equal(asset.latitude, 0); assert.equal(asset.longitude, 0);
    const alternative = (await ownerRequest('/assets', { expected: 201, body: { name: `${marker} alternative`, type: 'equipment', latitude: 1, longitude: 1, metadata: { validation_run: runId, verification_only: true } } })).value.data;
    check('emulated_device_territory_to_real_browser_asset_persisted', { device_coordinates_emulated: true });
    stage = 'browser_comparison_project';
    await b.click('Analizar activo'); await b.until("document.body.innerText.includes('Criterios y evidencia')"); await b.click('+ Añadir candidato');
    await b.until(`[...document.querySelectorAll('#comparison-existing-location option')].some(o=>o.value===${JSON.stringify(alternative.asset_id)})`);
    await b.set('#comparison-existing-location', alternative.asset_id);
    await b.until("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Añadir ubicación'&&!b.disabled)"); await b.click('Añadir ubicación');
    for (const [field, value] of [['name', 'SIMULATED cost'], ['definition', 'Hosting verification fixture'], ['unit', 'test-unit'], ['source', marker]]) await b.set(`input[id^="criterion:"][id$="-${field}"]`, value);
    await b.set('select[id$="-direction"]', 'cost');
    await b.evaluate(`[...document.querySelectorAll('input[id$="-value"]')].forEach((e,i)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${phase5 ? "'9007199254740992.0'+String(i+1)" : 'String(i+1)'});e.dispatchEvent(new Event('input',{bubbles:true}))})`);
    if (phase5) await b.evaluate("[...document.querySelectorAll('select[id$=\"-data-type\"]')].forEach(e=>{e.value='SIMULATED';e.dispatchEvent(new Event('change',{bubbles:true}))})");
    // Manual test observations are declared in the criterion name and source.
    await b.click('Guardar resultado en BACKSTAGE'); await b.until("document.body.innerText.includes('Comparación guardada en la organización activa.')");
    if (phase5) {
      const snapshot = await db.collection('soi_comparisons').findOne({ organization_id: org });
      assert.equal(snapshot.input.observations[snapshot.input.candidates[0].id][snapshot.input.criteria[0].id].value, '9007199254740992.01');
      assert.equal(snapshot.result.version, 'backstage-weighted-minmax-2'); assert.deepEqual(snapshot.result.ranking.map(r => r.score), [100, 0]);
      await b.evaluate("[...document.querySelectorAll('details')].find(e=>e.querySelector('summary')?.textContent==='Trazabilidad del análisis').open=true");
      await b.click('Comprobar reproducibilidad'); await b.until("document.body.innerText.includes('Reproducción confirmada:')");
      const downloads = path.join(directory, 'downloads'); fs.mkdirSync(downloads, { recursive: true }); await b.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
      await b.click('Descargar evidencia JSON');
      for (let i = 0; i < 100 && !fs.readdirSync(downloads).some(n => n.endsWith('.json')); i++) await pause(100);
      const file = fs.readdirSync(downloads).find(n => n.endsWith('.json')); assert(file, 'Real browser export missing');
      const exported = JSON.parse(fs.readFileSync(path.join(downloads, file), 'utf8')); assert.equal(exported.snapshot.analysis.manifest_sha256, snapshot.analysis.manifest_sha256); assert(exported.verification.verified);
      const negative = await ownerRequest('/comparisons', { expected: 400, body: { ...snapshot.input, project_name: marker, observations: { ...snapshot.input.observations, [snapshot.input.candidates[0].id]: { [snapshot.input.criteria[0].id]: { value: '1', unit: 'incompatible-unit' } } } } }); assert.equal(negative.status, 400);
      for (const width of [390, 1440]) { await b.call('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false }); assert(await b.evaluate('document.documentElement.scrollWidth <= innerWidth+1')); await b.evaluate("[...document.querySelectorAll('details')].find(e=>e.querySelector('summary')?.textContent==='Trazabilidad del análisis').scrollIntoView()"); await b.capture(`reproducibility-${width}.png`); report.screenshots.push(`reproducibility-${width}.png`); }
      check('decimal_cents_atlas_browser_replay_export_and_incompatible_unit_rejection');
    }
    await b.capture('analysis-1440.png'); report.screenshots.push('analysis-1440.png');
    await b.click('Crear proyecto desde este análisis'); await b.until("document.body.innerText.includes('Proyectos operativos') && document.body.innerText.includes('Análisis guardado #')");
    const project = await db.collection('analysis_runs').findOne({ organization_id: org }); assert(project); assert.deepEqual(project.metadata.territory.coordinates, [0, 0]); assert.equal(project.metadata.selected_assets.length, 2);
    if (phase5) { const snapshot = await db.collection('soi_comparisons').findOne({ organization_id: org }); assert.equal(project.metadata.analysis_context.manifest_sha256, snapshot.analysis.manifest_sha256); }
    report.project = { analysis_run_id: project.analysis_run_id, comparison_id: project.metadata.comparison_snapshot_id };
    for (const width of [390, 1440]) { await b.call('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false }); assert(await b.evaluate('document.documentElement.scrollWidth <= innerWidth+1')); await b.capture(`project-${width}.png`); report.screenshots.push(`project-${width}.png`); }
    await b.click('Recuperar análisis'); await b.until("document.body.innerText.includes('Resultado guardado #')"); await b.reload(); await b.until("document.body.innerText.includes('recuperada.') && document.body.innerText.includes('Resultado guardado #')");
    await b.click('Crear proyecto desde este análisis'); await b.until("document.body.innerText.includes('Proyectos operativos')"); assert.equal(await db.collection('analysis_runs').countDocuments({ organization_id: org }), 1);
    check('browser_comparison_project_restore_idempotence_and_mobile_layout');
    if (engines) {
      stage = 'financial_probability_evidence';
      const meta = { currency: 'COP', period: 'year', source: marker, data_type: 'SIMULATED', analysis_run_id: project.analysis_run_id, assumptions: ['SIMULATED staging fixture; not operational evidence'] };
      const financial = (await ownerRequest('/analytics/financial', { expected: 201, body: { ...meta, algorithm: 'npv_irr', cashFlows: ['-9007199254740992.01', '9007199254740992.02'], discountRate: '0', analysis: { forged: true } } })).value;
      assert.equal(financial.result.npv_decimal, '0.010000');
      const savedFinancial = await db.collection('analytics_jobs').findOne({ organization_id: org, analytics_job_id: financial.analytics_job_id });
      assert.equal(savedFinancial.params.cashFlows[0], '-9007199254740992.01'); assert(!savedFinancial.params.analysis);
      assert((await ownerRequest(`/analytics/jobs/${financial.analytics_job_id}/reproducibility`)).value.verified);
      assert.equal((await ownerRequest(`/analytics/jobs/${financial.analytics_job_id}/export`)).value.snapshot.analysis.manifest_sha256, financial.analysis.manifest_sha256);
      await ownerRequest('/analytics/financial', { expected: 400, body: { ...meta, algorithm: 'npv_irr', cashFlows: [-100, 110], discountRate: '.1', rate_period: 'month' } });
      await ownerRequest(`/analytics/jobs/${financial.analytics_job_id}/export`, { session: recipient.session, expected: 404 });
      const property = (await ownerRequest('/locations', { expected: 201, body: { name: `${marker} financial property`, type: 'property', latitude: 0, longitude: 0 } })).value;
      await ownerRequest('/real-estate/valuations', { expected: 201, body: { location_id: property.location_id, land_area_m2: 10, price_per_m2: 10, estimated_value: '100', details: { data_type: 'SIMULATED', source: marker } } });
      await b.navigate(`/dashboard?page=portfolio-assets&project=${project.analysis_run_id}`); await b.until("document.body.innerText.includes('Inventario general')"); await b.click('Portafolio inmobiliario');
      await b.until("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Analizar financieramente')"); await b.click('Analizar financieramente');
      for (const [name, value] of [['netOperatingIncomeAnnual', '5'], ['annualCashFlow', '110'], ['horizonYears', '1'], ['discountRatePct', '10']]) await b.set(`.financial-panel input[name="${name}"]`, value);
      await b.click('Calcular'); await b.until("document.querySelector('.financial-panel')?.innerText.includes('VPN conservado: 0.000000')");
      await b.evaluate("document.querySelector('.analytics-evidence').open=true");
      await b.until(`document.querySelector('.analytics-evidence')?.innerText.includes('#${financial.analytics_job_id}')`);
      await b.click(`Comprobar ejecución #${financial.analytics_job_id}`); await b.until("document.querySelector('.analytics-evidence')?.innerText.includes('Reproducción verificada')");
      await b.capture('financial-evidence-1440.png'); report.screenshots.push('financial-evidence-1440.png');
      check('financial_exact_cents_project_contract_browser_calculation_replay_and_export');

      stage = 'monte_carlo_browser';
      await b.navigate(`/dashboard?page=probability-engine&project=${project.analysis_run_id}`); await b.until("!!document.querySelector('#mc-factors')");
      for (const [selector, value] of [['#mc-factors', 'fixture;10;0;2'], ['#mc-unit', 'test-unit'], ['#mc-source', marker], ['#mc-seed', '17'], ['#mc-iterations', '100']]) await b.set(selector, value);
      await b.click('Ejecutar y guardar simulación'); await b.until("document.querySelector('.monte-carlo-panel')?.innerText.includes('Simulación #')");
      const mc = await db.collection('analytics_jobs').findOne({ organization_id: org, algorithm_name: 'risk.monte_carlo' }); assert(mc); assert.equal(mc.result.p5, 20); assert.equal(mc.params.seed, 17); assert.equal(mc.analysis.reproducibility.model, 'independent_normal_weighted_sum');
      const second = (await ownerRequest('/analytics/risk-simulation', { expected: 201, body: { ...mc.params, algorithm: 'monte_carlo', analysis_run_id: project.analysis_run_id } })).value;
      assert.deepEqual(second.result, mc.result); assert.equal(second.analysis.input_sha256, mc.analysis.input_sha256);
      assert((await ownerRequest(`/analytics/jobs/${mc.analytics_job_id}/reproducibility`)).value.verified);
      await ownerRequest('/analytics/risk-simulation', { expected: 400, body: { factors: { x: { mean: 1, stdDev: 1 } }, seed: -1 } });
      const currentProject = await db.collection('analysis_runs').findOne({ analysis_run_id: project.analysis_run_id, organization_id: org });
      assert(currentProject.metadata.analytics_evidence.some(r => r.analytics_job_id === financial.analytics_job_id)); assert(currentProject.metadata.analytics_evidence.some(r => r.analytics_job_id === mc.analytics_job_id));
      await b.reload(); await b.until("!!document.querySelector('.analytics-evidence')"); await b.evaluate("document.querySelector('.analytics-evidence').open=true");
      await b.until(`document.querySelector('.analytics-evidence')?.innerText.includes('#${mc.analytics_job_id}')`); await b.click(`Comprobar ejecución #${mc.analytics_job_id}`); await b.until("document.querySelector('.analytics-evidence')?.innerText.includes('Reproducción verificada')");
      const download = path.join(directory, 'engine-downloads'); fs.mkdirSync(download, { recursive: true }); await b.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: download });
      await b.click(`Descargar análisis #${mc.analytics_job_id}`);
      const downloadPath = path.join(download, `backstage-analisis-${mc.analytics_job_id}.json`); for (let i = 0; i < 120 && !fs.existsSync(downloadPath); i++) await pause(250);
      const exported = JSON.parse(fs.readFileSync(downloadPath, 'utf8')); assert(exported.verification.verified); assert.equal(exported.snapshot.params.seed, 17);
      for (const width of [390, 1440]) { await b.call('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false }); assert(await b.evaluate('document.documentElement.scrollWidth <= innerWidth+1')); await b.capture(`monte-carlo-${width}.png`); report.screenshots.push(`monte-carlo-${width}.png`); }
      report.analytics = { financial_job_id: financial.analytics_job_id, monte_carlo_job_id: mc.analytics_job_id, linked_jobs: currentProject.metadata.analytics_evidence.length, exact_npv_decimal: financial.result.npv_decimal };
      check('seeded_model_actual_browser_atlas_project_reload_mobile_replay_and_json_download');
    }
    if (spatial) {
      stage = 'gis_evidence_browser';
      await b.navigate(`/dashboard?page=portfolio-comparator&project=${project.analysis_run_id}`); await b.until("!!document.querySelector('.spatial-analysis-panel')");
      await b.evaluate("document.querySelector('.spatial-analysis-panel').open=true"); await b.set('#gis-coordinates', '[[0,0],[1,0]]'); await b.set('#gis-source', marker); await b.click('Calcular y guardar GIS');
      await b.until("document.querySelector('.spatial-analysis-panel')?.innerText.includes('Análisis GIS #')");
      const gisJob = await db.collection('analytics_jobs').findOne({ organization_id: org, algorithm_name: 'gis.distance_matrix' }); assert(gisJob); assert.equal(gisJob.result.distance_m[0][1], 111195.080234); assert.equal(gisJob.analysis.spatial_reference.crs, 'OGC:CRS84'); assert(gisJob.analysis.business_rules.version);
      await b.evaluate("document.querySelector('.spatial-analysis-panel .analytics-evidence').open=true"); await b.until(`document.querySelector('.spatial-analysis-panel .analytics-evidence')?.innerText.includes('#${gisJob.analytics_job_id}')`);
      await b.click(`Comprobar ejecución #${gisJob.analytics_job_id}`); await b.until("document.querySelector('.spatial-analysis-panel')?.innerText.includes('Reproducción verificada')");
      for (const width of [390, 1440]) { await b.call('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false }); await b.evaluate("document.querySelector('.spatial-analysis-panel').scrollIntoView()"); assert(await b.evaluate('document.documentElement.scrollWidth <= innerWidth+1')); await b.capture(`gis-evidence-${width}.png`); report.screenshots.push(`gis-evidence-${width}.png`); }
      const catalog = (await ownerRequest('/analytics/spatial-rules')).value; assert.equal(catalog.version, gisJob.analysis.business_rules.version);
      await ownerRequest('/analytics/gis', { expected: 400, body: { coordinates: [[0,0],[1,0]], crs: 'EPSG:3857', source: { name: marker } } });
      check('gis_browser_known_distance_crs_rules_project_and_replay');
      stage = 'optimization_business_rules';
      const configuration = { sector: 'general', capabilities: ['assets', 'operations', 'fleet', 'optimization'] };
      await ownerRequest('/soi/configuration', { method: 'PUT', body: configuration });
      await request('/soi/configuration', { session: recipient.session, method: 'PUT', body: configuration });
      const depot = (await ownerRequest('/soi/assets', { expected: 201, body: { name: 'SIMULATED depot', type: 'depot', longitude: 0, latitude: 0 } })).value.data;
      const stop = (await ownerRequest('/soi/assets', { expected: 201, body: { name: 'SIMULATED point', type: 'collection_point', longitude: .01, latitude: 0 } })).value.data;
      const vehicle = (await ownerRequest('/soi/vehicles', { expected: 201, body: { name: 'SIMULATED vehicle', plate: `TEST-${org}`, capacity: 10, capacity_unit: 'kg', status: 'available' } })).value.data;
      const matrix = { node_ids: [String(depot.location_id), String(stop.location_id)], distance_m: [[0,1000],[1000,0]], duration_s: [[0,100],[100,0]], source: { name: marker, data_kind: 'simulated' } };
      const file = path.join(directory, 'simulated-routing-matrix.json'); fs.writeFileSync(file, JSON.stringify(matrix));
      await b.navigate(`/dashboard?page=soi&project=${project.analysis_run_id}`); await b.until("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Centro sanitario')"); await b.click('Centro sanitario'); await b.until("[...document.querySelectorAll('.sanitary-toolbar select option')].some(o=>o.value==='optimization')"); await b.set('.sanitary-toolbar select','optimization');
      await b.until("!!document.querySelector('form.sanitary-editor') && document.querySelector('form.sanitary-editor select')?.options.length>1");
      await b.set('form.sanitary-editor input[maxlength="200"]', `${marker} route fixture`); await b.set('form.sanitary-editor select', String(depot.location_id));
      await b.set('form.sanitary-editor .soi-form label:nth-child(3) select', 'upload');
      await b.until("!!document.querySelector('form.sanitary-editor input[type=file]')");
      const doc = await b.call('DOM.getDocument'), input = await b.call('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'form.sanitary-editor input[type=file]' });
      await b.call('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [file] });
      await b.until("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Calcular y guardar propuesta'&&!e.disabled)");
      await b.evaluate("document.querySelector('input[aria-label=\"Incluir SIMULATED point\"]').click()"); await b.set('input[aria-label="demand_kg SIMULATED point"]', '5');
      await b.until("!!document.querySelector('form.sanitary-editor fieldset input[type=checkbox]')"); await b.evaluate("document.querySelector('form.sanitary-editor fieldset input[type=checkbox]').click()");
      await b.click('Calcular y guardar propuesta'); await b.until("!!document.querySelector('.optimization-evidence') && document.body.innerText.includes('Registro guardado con trazabilidad.')");
      const scenario = await db.collection('soi_optimization_scenarios').findOne({ organization_id: org }); assert(scenario); assert.equal(scenario.state, 'PROPOSED'); assert.equal(scenario.result.result.totals.distance_m, 2000); assert.equal(scenario.analysis_run_id, project.analysis_run_id);
      await b.click('Comprobar evidencia de rutas'); await b.until("document.querySelector('.optimization-evidence')?.innerText.includes('Evidencia y restricciones verificadas.')");
      const original = await db.collection('soi_optimization_scenarios').findOne({ organization_id: org, record_id: scenario.record_id });
      await b.click('Repetir búsqueda guardada'); await b.until("document.querySelector('.optimization-evidence')?.innerText.includes('Búsqueda repetida: comprobación válida')");
      const repeatedAgain=(await ownerRequest(`/soi/sanitary/optimization/${scenario.record_id}/reproduce`,{body:{}})).value.data;assert(repeatedAgain.solution_validation.valid);assert(repeatedAgain.replay_event_id);
      assert.equal(await db.collection('soi_domain_events').countDocuments({organization_id:org,type:'optimization.reproduced',resource_id:scenario.record_id}),2);
      assert.deepEqual(await db.collection('soi_optimization_scenarios').findOne({ organization_id: org, record_id: scenario.record_id }), original);
      const exported = (await ownerRequest(`/soi/sanitary/optimization/${scenario.record_id}/export`)).value; assert(exported.verification.verified); assert.equal(exported.snapshot.input.matrix.source.data_kind, 'simulated');
      for (const width of [390, 1440]) { await b.call('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false }); await b.evaluate("document.querySelector('.optimization-evidence').scrollIntoView()"); assert(await b.evaluate('document.documentElement.scrollWidth <= innerWidth+1')); await b.capture(`optimization-evidence-${width}.png`); report.screenshots.push(`optimization-evidence-${width}.png`); }
      const p = { name: `${marker} API scenario`, analysis_run_id: project.analysis_run_id, nodes: [{ asset_id: depot.location_id }, { asset_id: stop.location_id, demand_kg: 11 }], vehicles: [{ vehicle_id: vehicle.vehicle_id, capacity_kg: 10 }], matrix, time_limit_s: .1 };
      const infeasible = (await ownerRequest('/soi/sanitary/optimization', { expected: 201, body: p })).value.data; assert.equal(infeasible.state, 'INFEASIBLE'); assert((await ownerRequest(`/soi/sanitary/optimization/${infeasible.record_id}/reproducibility`)).value.data.verified);
      await ownerRequest(`/soi/sanitary/optimization/${infeasible.record_id}/approve`, { expected: 409, body: { revision: infeasible.revision } });
      await ownerRequest(`/soi/sanitary/optimization/${scenario.record_id}/export`, { session: recipient.session, expected: 404 });
      await ownerRequest('/soi/configuration', { method: 'PUT', body: configuration });
      await ownerRequest(`/soi/sanitary/optimization/${scenario.record_id}/approve`, { expected: 409, body: { revision: scenario.revision } });
      const config = await db.collection('soi_configuration').findOne({ organization_id: org }); assert.equal(config.revision, 2); assert(await db.collection('soi_audit_events').findOne({ organization_id: org, action: 'configuration.updated' }));
      const linked = await db.collection('analysis_runs').findOne({ organization_id: org, analysis_run_id: project.analysis_run_id }); assert(linked.metadata.spatial_evidence.some(e => e.record_id === scenario.record_id));
      report.spatial = { gis_job_id: gisJob.analytics_job_id, optimization_record_id: scenario.record_id, infeasible_record_id: infeasible.record_id, configuration_revision: config.revision, gps_provider: null };
      check('real_python_route_browser_matrix_upload_immutable_repeat_export_infeasibility_and_configuration_approval_gate');
    }
    if (phase5) {
      stage = 'historical_snapshot';
      const original = await db.collection('soi_comparisons').findOne({ organization_id: org });
      const { evaluateComparison, LEGACY_VERSION } = await import('../../shared/comparison.mjs');
      let legacyId;
      await mongo.withMongoTransaction(async (store, session) => {
        legacyId = await mongo.nextId('soi_comparisons', session);
        await store.collection('soi_comparisons').insertOne({ organization_id: org, comparison_id: legacyId, project_name: `${marker} legacy fixture`, input: original.input, result: evaluateComparison(original.input, { version: LEGACY_VERSION }), created_by: owner.session.user.user_id, created_at: new Date() }, { session });
      });
      const before = await db.collection('soi_comparisons').findOne({ organization_id: org, comparison_id: legacyId });
      await b.navigate(`/dashboard?page=portfolio-comparator&comparison=${legacyId}`);
      await b.until(`document.body.innerText.includes('Resultado guardado #${legacyId}.') && document.body.innerText.includes('Version ${LEGACY_VERSION}')`);
      await b.evaluate("[...document.querySelectorAll('details')].find(e=>e.querySelector('summary')?.textContent==='Trazabilidad del análisis').open=true");
      await b.click('Comprobar reproducibilidad'); await b.until("document.body.innerText.includes('Cálculo anterior reproducido.')");
      const legacyReport = (await ownerRequest(`/comparisons/${legacyId}/reproducibility`)).value.data; assert.equal(legacyReport.status, 'legacy_replayed'); assert.equal(legacyReport.historical_integrity, false);
      assert.deepEqual(await db.collection('soi_comparisons').findOne({ organization_id: org, comparison_id: legacyId }), before);
      await b.capture('legacy-result-1440.png'); report.screenshots.push('legacy-result-1440.png');
      check('historical_engine_browser_result_and_replay_preserved_without_backfill');
      stage = 'historical_invalid_input';
      let invalidLegacyId;
      const invalidInput = { ...original.input, criteria: [] };
      await mongo.withMongoTransaction(async (store, session) => {
        invalidLegacyId = await mongo.nextId('soi_comparisons', session);
        await store.collection('soi_comparisons').insertOne({ organization_id: org, comparison_id: invalidLegacyId, project_name: `${marker} invalid legacy fixture`, input: invalidInput, result: evaluateComparison(invalidInput, { version: LEGACY_VERSION }), created_by: owner.session.user.user_id, created_at: new Date() }, { session });
      });
      const invalidReport = (await ownerRequest(`/comparisons/${invalidLegacyId}/reproducibility`)).value.data;
      assert.equal(invalidReport.status, 'invalid_input'); assert.equal(invalidReport.verified, false);
      await ownerRequest(`/comparisons/${invalidLegacyId}/project`, { body: {}, expected: 409 });
      assert.equal(await db.collection('analysis_runs').countDocuments({ organization_id: org }), 1);
      check('invalid_historical_inputs_are_not_certified_and_cannot_create_project');
    }
    if(process.argv.includes('--readiness')) {
      stage='business_rules_and_admin_alerts';
      await b.navigate('/dashboard?page=organization-settings');await b.until("document.body.innerText.includes('Miembros y roles')");await b.click('Miembros y roles');
      await b.until("[...document.querySelectorAll('summary')].some(s=>s.textContent==='Reglas comerciales y alertas del administrador')");
      await b.evaluate("[...document.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Reglas comerciales y alertas del administrador').open=true");
      await b.until("!!document.querySelector('form[aria-label=\"Configurar reglas comerciales\"] input')");
      await b.set('form[aria-label="Configurar reglas comerciales"] input[type=number]','36');await b.click('Guardar reglas comerciales');await b.until("document.body.innerText.includes('Reglas guardadas y auditadas. Revisión 1.')");
      const policy=(await ownerRequest('/operations/business-rules')).value;assert.equal(policy.revision,1);assert.equal(policy.rules.sla_hours.probability_pending,36);
      const board=(await ownerRequest('/analysis/operations')).value;const current=board.find(p=>p.analysis_run_id===project.analysis_run_id);assert.equal(current.sla.policy_sha256,policy.sha256);assert.equal(current.sla.limit_hours,policy.rules.sla_hours[current.workflow.state]??policy.rules.sla_hours.default);
      const reviewForm='form[aria-label="Revisar vigencia de fuente"]';
      await b.set(`${reviewForm} select`,project.analysis_run_id);await b.set(`${reviewForm} input[maxlength="200"]`,`${marker} source`);await b.set(`${reviewForm} input[type="datetime-local"]`,'2000-01-01T00:00');await b.click('Revisar vigencia');await b.until("document.querySelector('section[aria-label=\"Reglas comerciales y monitoreo\"]')?.innerText.includes('Vencida')");
      await b.evaluate("[...document.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Excepción de vigencia').open=true");
      await b.set('section[aria-label="Reglas comerciales y monitoreo"] textarea','SIMULATED validation only: administrator records a bounded review exception.');await b.click('Registrar excepción de vigencia');await b.until("document.body.innerText.includes('Excepción vigente registrada')");
      const reviewed=await db.collection('analysis_runs').findOne({organization_id:org,analysis_run_id:project.analysis_run_id});assert.equal(reviewed.metadata.business_exceptions[0].approved_by,owner.session.user.user_id);assert.equal(reviewed.metadata.business_review.sources[0].source_verified,false);assert.equal(reviewed.metadata.business_review.sources[0].status,'exception_recorded');
      const monitor=(await ownerRequest('/operations/monitor')).value;assert.equal(monitor.recipient_role,'admin');assert.equal(monitor.scope,'protected_staging_only');
      for(const width of [390,1440]){await b.call('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await b.evaluate("document.querySelector('section[aria-label=\"Reglas comerciales y monitoreo\"]').scrollIntoView()");assert(await b.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await b.capture(`business-rules-admin-${width}.png`);report.screenshots.push(`business-rules-admin-${width}.png`);}
      check('real_admin_business_policy_browser_save_atlas_sla_source_review_bounded_exception_and_monitor_delivery');
    }
    stage = 'browser_invitation';
    await b.click('Organización'); await b.until("document.body.innerText.includes('Configuración de organización')"); await b.click('Miembros y roles'); await b.until("document.body.innerText.includes('Miembros')"); await b.click('Invitar miembro'); await b.set('form[aria-label="Crear invitación"] input[type=email]', recipient.email); await b.set('form[aria-label="Crear invitación"] select', 'analyst'); await b.click('Generar invitación'); await b.until("document.body.innerText.includes('Invitación creada.')");
    const link = await b.evaluate("[...document.querySelectorAll('input')].find(e=>e.value.includes('#invitation='))?.value"); assert(link?.startsWith(origin('web')));
    recipientBrowser = await browser('recipient', directory); const r = recipientBrowser;
    await r.login(recipient, new URL(link).pathname + new URL(link).search + new URL(link).hash); await r.until("!!document.querySelector('form[aria-label=\"Aceptar invitación\"]')"); await r.click('Aceptar invitación'); await r.until("document.querySelector('.identity-role')?.innerText.includes('Analista') && location.hash===''");
    const accepted = await r.evaluate("({token:localStorage.getItem('backstage_token'),user:JSON.parse(localStorage.getItem('backstage_user'))})"); assert.equal(accepted.user.organization_id, org);
    await request(`/analysis/${project.analysis_run_id}`, { session: accepted, org: recipient.session.user.organization_id, expected: 404 });
    if (phase5) { await request(`/comparisons/${project.metadata.comparison_snapshot_id}/reproducibility`, { session: accepted, org: recipient.session.user.organization_id, expected: 404 }); await request(`/comparisons/${project.metadata.comparison_snapshot_id}/export`, { session: accepted, org: recipient.session.user.organization_id, expected: 404 }); }
    check('manual_invitation_real_browser_acceptance_and_organization_switch');
    stage = 'browser_roles';
    await b.navigate('/dashboard?page=organization-settings'); await b.until("document.body.innerText.includes('Miembros y roles')"); await b.click('Miembros y roles');
    const memberCardReady = `[...document.querySelectorAll('article.card')].some(e=>e.textContent.includes(${JSON.stringify(recipient.email)})&&e.querySelector('button')&&!e.querySelector('button').disabled)`;
    await b.until(memberCardReady);
    await b.evaluate(`[...document.querySelectorAll('article.card')].find(e=>e.textContent.includes(${JSON.stringify(recipient.email)})).querySelector('button').click()`); await b.until("!!document.querySelector('#member-role')"); await b.set('#member-role', 'viewer'); await b.click('Actualizar rol'); await b.until("document.body.innerText.includes('Miembro actualizado.')");
    await r.evaluate("window.dispatchEvent(new Event('focus'))"); await r.until("document.querySelector('.identity-role')?.innerText.includes('Consulta')");
    await request('/assets', { session: accepted, body: { name: marker, type: 'equipment' }, expected: 403 }); await request('/audit-logs', { session: accepted, expected: 403 }); await request('/assets', { session: accepted });
    if(process.argv.includes('--readiness')){
      await request('/operations/business-rules',{session:accepted});
      await request('/operations/business-rules',{session:accepted,method:'PUT',body:{},expected:403});
      await request('/operations/business-rules/review',{session:accepted,body:{project_id:project.analysis_run_id,sources:[]},expected:403});
      await request('/operations/business-rules/exceptions',{session:accepted,body:{},expected:403});
      await request('/operations/monitor',{session:accepted,expected:403});
      check('current_viewer_cannot_configure_rules_approve_exceptions_or_read_admin_monitor');
    }
    if (engines) {
      const job = await db.collection('analytics_jobs').findOne({ organization_id: org });
      assert((await request(`/analytics/jobs/${job.analytics_job_id}/reproducibility`, { session: accepted })).value.verified);
      await request(`/analytics/jobs/${job.analytics_job_id}/export`, { session: accepted, org: recipient.session.user.organization_id, expected: 404 });
      await request('/analytics/financial', { session: accepted, expected: 403, body: { cashFlows: [-100, 110], discountRate: .1 } });
      await request('/analytics/risk-simulation', { session: accepted, expected: 403, body: { factors: { x: { mean: 1, stdDev: 0 } } } });
      check('analytics_viewer_replay_allowed_writes_denied_and_cross_tenant_export_hidden');
    }
    if (spatial) {
      assert((await request(`/soi/sanitary/optimization/${report.spatial.optimization_record_id}/reproducibility`, { session: accepted })).value.data.verified);
      await request(`/soi/sanitary/optimization/${report.spatial.optimization_record_id}/reproduce`, { session: accepted, body: {}, expected: 403 });
      await request('/analytics/gis', { session: accepted, body: {}, expected: 403 });
      check('gis_and_optimization_current_viewer_read_and_replay_write_separation');
    }
    await b.until(memberCardReady);
    await b.evaluate(`window.confirm=()=>true;[...document.querySelectorAll('article.card')].find(e=>e.textContent.includes(${JSON.stringify(recipient.email)})).querySelectorAll('button')[1].click()`); await b.until("document.body.innerText.includes('Acceso del miembro revocado')");
    await r.evaluate("window.dispatchEvent(new Event('focus'))"); await r.until("!!document.querySelector('#login-email') && localStorage.getItem('backstage_token')===null");
    await request('/assets', { session: accepted, expected: 403 }); assert.equal((await request('/auth/me', { session: recipient.session })).value.organization_id, recipient.session.user.organization_id);
    if (engines) await request(`/analytics/jobs/${report.analytics.financial_job_id}/reproducibility`, { session: accepted, expected: 403 });
    check('browser_role_downgrade_revocation_stale_token_denial_and_other_org_preserved');
    stage = 'audit_polling';
    await b.click('Auditoría'); await b.until("document.body.innerText.includes('Cadena hash íntegra') && document.querySelector('.audit-table')?.innerText.includes('member.revoked')");
    const before = Date.now(); await ownerRequest('/assets', { expected: 201, body: { name: `${marker} polling`, type: 'equipment' } });
    await b.until(`document.querySelector('.audit-workspace')?.innerText.includes('asset.created') && ${Date.now()} > 0`);
    for (let i = 0; i < 140 && !b.requests.some(row => row.path === '/api/audit-logs' && row.at > before + 1000); i++) await pause(250);
    assert(b.requests.some(row => row.path === '/api/audit-logs' && row.status === 200 && row.at > before + 1000), 'Actual hosted polling request missing');
    const chain = (await ownerRequest('/audit-logs/chain-status')).value; assert(chain.valid && chain.complete);
    const audit = await db.collection('soi_audit_events').find({ organization_id: org }).toArray(); for (const action of ['asset.created', 'analysis.saved', 'project.created', 'invitation.created', 'invitation.accepted', 'member.updated', 'member.revoked']) assert(audit.some(row => row.action === action));
    assert(!JSON.stringify(audit).includes(new URL(link).hash.slice('#invitation='.length)));
    for (const width of [390, 1440]) { await b.call('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false }); assert(await b.evaluate('document.documentElement.scrollWidth <= innerWidth+1')); await b.capture(`audit-${width}.png`); report.screenshots.push(`audit-${width}.png`); }
    check('hosting_http_polling_complete_audit_chain_and_credential_redaction', { native_websocket_supported: false, observed_polling: true, audit_events: chain.checked });
    stage = 'scientific_self_transport';
    const features = [0, 1, 2, 3].map(i => ({ type: 'Feature', id: String(i), geometry: { type: 'Point', coordinates: [-74 + i * .001, 4] }, properties: { value: i } }));
    const science = (await ownerRequest('/soi/bsie/validate', { body: { data: { type: 'FeatureCollection', features } } })).value; assert.equal(science.data.validation.valid, true);
    await request('/internal/science', { type: 'api', body: {}, expected: 401 });
    check('authenticated_node_to_protected_python_self_rpc_and_unsigned_denial');
    report.browser_api_responses = b.requests.length + r.requests.length; report.browser_runtime_errors = [...b.errors, ...r.errors]; assert.equal(report.browser_runtime_errors.length, 0);
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.failure = { stage, message: error.message.slice(0, 700) }; console.error(JSON.stringify(report.failure)); process.exitCode = 1; if (ownerBrowser) await ownerBrowser.capture('failure.png').catch(() => {}); }
  finally {
    ownerBrowser?.close(); recipientBrowser?.close();
    if (ownership.organization_ids.length && db) {
      try {
        await pause(2500); const filters = await assertOwnership();
        const { BSON } = require('mongodb'); const snapshot = { run_id: runId, collections: {} };
        for (const name of COLLECTIONS) snapshot.collections[name] = await db.collection(name).find(filters[name]).toArray();
        const technicalKeys=process.argv.includes('--readiness')?accounts.flatMap(account=>[['register',account.email],['login',account.email],['invitation_accept',String(account.session.user.user_id)]].map(([namespace,subject])=>`auth-rate:${namespace}:${crypto.createHmac('sha256',state.jwt_secret).update(subject.trim().toLowerCase()).digest('hex')}`)):[];
        if(technicalKeys.length)snapshot.collections.soi_provider_locks=await db.collection('soi_provider_locks').find({_id:{$in:technicalKeys}}).toArray();
        const bytes = BSON.serialize(snapshot); fs.writeFileSync(path.join(directory, 'owned-test-records.bson'), bytes, { mode: 0o600 });
        await mongo.withMongoTransaction(async (store, session) => { for (const name of COLLECTIONS) await store.collection(name).deleteMany(filters[name], { session }); if(technicalKeys.length)await store.collection('soi_provider_locks').deleteMany({_id:{$in:technicalKeys}},{session}); });
        for (const name of COLLECTIONS) assert.equal(await db.collection(name).countDocuments(filters[name]), 0);
        if(technicalKeys.length)assert.equal(await db.collection('soi_provider_locks').countDocuments({_id:{$in:technicalKeys}}),0);
        report.cleanup = { passed: true, only_owned_test_records: true, shared_counters_preserved: true, global_security_request_traces_retained: true, global_hash_chain_preserved: true, backup_path: path.relative(root, path.join(directory, 'owned-test-records.bson')).replaceAll('\\', '/'), backup_sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
      } catch (error) { report.cleanup = { passed: false, code: error.code || error.name, ownership_manifest: path.relative(root, path.join(directory, 'ownership.json')) }; report.status = 'failed'; process.exitCode = 1; }
    }
    await mongo.closeMongoConnection(); report.finished_at = new Date().toISOString();
    fs.writeFileSync(path.join(directory, 'validation-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(root, `docs/backstage-2.0/evidence/${evidencePrefix}-live.json`), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  }
}
if(require.main===module){
  if (process.argv.includes('--apply') && process.argv.includes('--test-environment')) run().catch(error => { console.error(error.name); process.exitCode = 1; });
  else console.log(JSON.stringify({ mode: 'plan_only', target: 'dedicated_protected_staging_and_prevalidated_atlas_test_database', writes: 'two new run-owned test tenants; browser asset/comparison/project/invitation/role/revocation', cleanup: 'owned records only, private BSON backup, never shared counters', api_interception: false }));
}
module.exports={browser,request};
