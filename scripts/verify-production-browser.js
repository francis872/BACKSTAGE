// Anonymous real-browser acceptance. No API interception, login or data submission.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const release = JSON.parse(fs.readFileSync(path.join(root, '.vercel/production-release-private.json'), 'utf8'));
assert.equal(release.status, 'published_and_verified');
const origin = `https://${release.projects.web.domain}`;
const evidence = path.join(root, 'docs/backstage-2.0/evidence/production-ui');
fs.mkdirSync(evidence, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'backstage-release-browser-'));
const browser = spawn(process.env.SOI_TEST_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const report = { started_at: new Date().toISOString(), origin, deployment: release.projects.web.deployment.id, mode: 'anonymous_real_chrome_no_interception_or_submission', checks: [], screenshots: [], runtime_errors: [], failed_own_responses: [] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
async function main() {
  let port;
  for (let i = 0; i < 100; i++) { try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch { await pause(100); } }
  assert(port, 'Chrome did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(new Error('Chrome command timed out: ' + method)); }, 20000); timer.unref();
    pending.set(key, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const task = pending.get(message.id); pending.delete(message.id); if (message.error) task?.reject(new Error(message.error.message)); else task?.resolve(message.result); return; }
    if (message.method === 'Runtime.exceptionThrown') report.runtime_errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived') { const r = message.params.response; if (r.url.startsWith(origin + '/') && r.status >= 400) report.failed_own_responses.push({ path: new URL(r.url).pathname, status: r.status }); }
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!result.exceptionDetails, 'Browser assertion expression failed'); return result.result.value;
  };
  const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100); } throw new Error('Page did not reach expected state'); };
  const pass = name => { report.checks.push({ name, passed: true }); console.log(JSON.stringify({ passed: name })); };
  const capture = async name => { const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(evidence, name + '.png'), Buffer.from(shot.data, 'base64')); report.screenshots.push('production-ui/' + name + '.png'); };
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: origin });
  await waitFor(`Boolean(document.querySelector('.orbital-launch'))`);
  assert.equal(await evaluate(`document.querySelector('h1').textContent`), 'BACKSTAGE'); pass('original_orbital_identity_preserved');
  await capture('entry-desktop');
  await evaluate(`document.querySelector('.orbital-launch').click()`);
  await waitFor(`Boolean(document.querySelector('#login-email'))`);
  assert.equal(await evaluate(`location.pathname`), '/login');
  assert.equal(await evaluate(`document.querySelector('h1').textContent`), 'Entra a BACKSTAGE'); pass('entry_opens_clear_spanish_login');
  for (const width of [320, 390, 768, 1440]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await pause(250);
    const layout = await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth+1,email:!!document.querySelector('label[for="login-email"]'),password:!!document.querySelector('label[for="login-password"]'),passwordType:document.querySelector('#login-password').type,controls:[...document.querySelectorAll('.auth-card input,.auth-card button')].map(e=>e.getBoundingClientRect().height)})`);
    assert(!layout.overflow); assert(layout.email && layout.password); assert.equal(layout.passwordType, 'password');
    pass('login_labels_and_no_horizontal_overflow_' + width); await capture('login-' + width);
  }
  await evaluate(`document.querySelector('.password-visibility').click()`);
  assert.equal(await evaluate(`document.querySelector('#login-password').type`), 'text');
  await evaluate(`document.querySelector('.password-visibility').click()`);
  assert.equal(await evaluate(`document.querySelector('#login-password').type`), 'password'); pass('show_and_hide_password_without_submission');
  await call('Page.navigate', { url: origin + '/signup' });
  await waitFor(`document.querySelector('h1')?.textContent==='Crea tu cuenta'`);
  assert(await evaluate(`document.querySelectorAll('form label').length>=4`)); pass('registration_has_explanatory_labels');
  await capture('signup-desktop');
  assert.equal(report.runtime_errors.length, 0); assert.equal(report.failed_own_responses.length, 0); pass('no_runtime_exceptions_or_failed_site_responses');
  report.passed = true;
  await call('Browser.close');
}
main().catch(error => { report.passed = false; report.failure = error.message; process.exitCode = 1; }).finally(async () => {
  socket?.close();
  if (browser.exitCode === null) browser.kill();
  report.completed_at = new Date().toISOString();
  fs.writeFileSync(path.join(root, 'docs/backstage-2.0/evidence/production-browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, ...(report.failure ? { failure: report.failure } : {}) }));
});
