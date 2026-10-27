const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { transition, DEFAULTS } = require('../backend/domain/monitorState');
async function probe(component, project, config, fetcher = fetch) {
  assert.equal(project.name, `backstage-staging-${component}`);
  const host = `${project.name}.vercel.app`, route = component === 'web' ? '/api/health' : '/health', url = `https://${host}${route}`;
  const started = performance.now();
  try {
    // Fetches are bounded, TLS verified, and credentials never follow redirects.
    const [allowed, denied] = await Promise.all([
      fetcher(url, { headers: { 'x-vercel-protection-bypass': project.bypass }, redirect: 'manual', signal: AbortSignal.timeout(config.timeout_ms) }),
      fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(config.timeout_ms) }),
    ]);
    let body; try { body = await allowed.json(); } catch {}
    const protection = [302, 401, 403].includes(denied.status);
    const healthy = allowed.status === 200 && body?.status === 'ok' && body.mongodb === 'healthy' && body.primaryStore === 'mongodb' && Boolean(allowed.headers.get('x-request-id')) && protection;
    const latency = Math.round(performance.now() - started);
    return { component, healthy, status: healthy ? 'healthy' : !protection ? 'protection_failure' : 'readiness_failure', latency_ms: latency, latency_warning: latency > config.latency_warning_ms, http_status: allowed.status, protection_verified: protection };
  } catch { return { component, healthy: false, status: 'probe_failed_or_timed_out', latency_ms: Math.round(performance.now() - started) }; }
}
async function run({ directory = path.join(root, '.vercel/staging-monitor'), fetcher = fetch, projects, persistAtlas = true } = {}) {
  fs.mkdirSync(directory, { recursive: true });
  const configFile = path.join(directory, 'config.json'), stateFile = path.join(directory, 'state.json');
  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : { ...DEFAULTS };
  for (const field of ['timeout_ms', 'latency_warning_ms', 'failures_to_open', 'successes_to_resolve', 'history_limit']) assert(Number.isSafeInteger(config[field]) && config[field] > 0);
  assert.equal(config.external_delivery, false, 'External alert delivery needs an explicitly chosen destination and implementation');
  if (!projects) projects = JSON.parse(fs.readFileSync(path.join(root, '.vercel/backstage-staging-private.json'), 'utf8')).projects;
  const old = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
  const samples = await Promise.all(['api', 'web'].map(component => probe(component, projects[component], config, fetcher)));
  const now = new Date().toISOString(), changed = transition(old, samples, config, now);
  const next = { checked_at: now, scope: 'protected_staging_only', external_alert_delivery: false, incidents: changed.incidents,
    events: [...(old.events || []), ...changed.events].slice(-config.history_limit), history: [...(old.history || []), { at: now, samples }].slice(-config.history_limit) };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 }); fs.renameSync(`${stateFile}.tmp`, stateFile);
  let adminDelivery = false;
  if (persistAtlas) {
    const mongo = require('../backend/infrastructure/platformMongo');
    try {
      const database = await mongo.getMongoDatabase();
      const staging = JSON.parse(fs.readFileSync(path.join(root, '.vercel/backstage-staging-private.json'), 'utf8'));
      const fingerprint = require('node:crypto').createHash('sha256').update(`${process.env.MONGODB_URI}\n${database.databaseName}`).digest('hex');
      assert.equal(fingerprint, staging.target_fingerprint, 'Monitor may only write to the authorized test connection');
      await database.collection('soi_provider_locks').updateOne({_id:'monitor:protected-staging'},{$set:{...next,recipient_role:'admin',kind:'technical_staging_monitor'}},{upsert:true});
      adminDelivery = true;
    } catch {} finally { await mongo.closeMongoConnection(); }
  }
  const output = { checked_at: now, samples, open_incidents: Object.values(next.incidents).filter(i => i.open).length, new_events: changed.events, external_alert_delivery: false, admin_in_app_delivery: adminDelivery };
  console.log(JSON.stringify(output)); return output;
}
if (require.main === module) run().then(result => { if (result.samples.some(s => !s.healthy)) process.exitCode = 1; }).catch(error => { console.error(JSON.stringify({ monitor_failed: true, reason: error.name })); process.exitCode = 1; });
module.exports = { run, probe, transition, DEFAULTS };
