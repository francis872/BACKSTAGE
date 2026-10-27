// Public read-only checks and synthetic Python calculations; never creates users/projects.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { api, root } = require('./staging-vercel');
const release = JSON.parse(fs.readFileSync(path.join(root, '.vercel/production-release-private.json'), 'utf8'));
const live = process.argv.includes('--live');
const report = { started_at: new Date().toISOString(), mode: live ? 'production_public_domains' : 'unpromoted_production_builds', deployments: Object.fromEntries(['api', 'web'].map(type => [type, release.projects[type].deployment.id])), operational_records_written: false, checks: [] };
const pass = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); console.log(JSON.stringify({ passed: name })); };
const url = type => `https://${live ? release.projects[type].domain : release.projects[type].deployment.url}`;
async function get(address, expected = 200) {
  const r = await fetch(address, { redirect: 'error', signal: AbortSignal.timeout(60000) });
  assert.equal(r.status, expected, `Unexpected HTTP status for ${new URL(address).pathname}`);
  return r;
}
async function science(name, engine, payload) {
  const secret = JSON.parse(fs.readFileSync(path.join(root, '.vercel/soi-cloud-state.json'), 'utf8')).secret;
  assert(secret?.length >= 32);
  const body = JSON.stringify({ engine, organization_id: 'release-readonly-synthetic', timestamp_ms: Date.now(), nonce: crypto.randomUUID(), payload });
  const r = await fetch(`${url('api')}/internal/science`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000), body, headers: { 'Content-Type': 'application/json', 'X-SOI-Signature': crypto.createHmac('sha256', secret).update(body).digest('hex') } });
  assert.equal(r.status, 200, `Signed synthetic ${name} failed`);
  const value = await r.json(); assert.equal(value.ok, true); assert.equal(value.result.operation, payload.operation);
  return value.result;
}
async function main() {
  for (const type of ['api', 'web']) {
    const p = release.projects[type]; assert.equal(p.deployment.readyState, 'READY');
    const d = await api(`/v13/deployments/${p.deployment.id}`);
    assert.equal(d.projectId, p.id); assert.equal(d.readyState, 'READY');
    const alias = await api(`/v4/aliases/${p.domain}`);
    assert.equal(alias.deploymentId || alias.deployment?.id, live ? p.deployment.id : p.previous.id);
    pass(`${type}_build_and_domain_target`);
    const r = await get(url(type) + (type === 'api' ? '/health' : '/api/health'));
    const health = await r.json(); assert.equal(health.status, 'ok'); assert.equal(health.mongodb, 'healthy');
    assert.equal(health.primaryStore, 'mongodb'); assert.equal(health.spatialStore, 'atlas');
    assert(r.headers.get('x-request-id')); pass(`${type}_atlas_health_and_request_id`);
  }
  for (const endpoint of ['/api/auth/me', '/api/locations', '/api/operations/business-rules', '/api/operations/monitor']) {
    await get(url('web') + endpoint, 401); pass(`anonymous_denied_${endpoint}`);
  }
  const html = await (await get(url('web') + '/')).text();
  const assets = [...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map(m => m[1]);
  assert(assets.length >= 2);
  const assetEvidence = [];
  for (const asset of assets) {
    const r = await get(new URL(asset, url('web'))), bytes = Buffer.from(await r.arrayBuffer());
    assert(!bytes.toString().includes('backstage-api-dnwi.onrender.com'), 'Retired Render host remains in browser bundle');
    assetEvidence.push({ path: asset, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  assert((await (await get(url('web') + '/login')).text()).includes(assets.find(a => a.endsWith('.js'))));
  pass('spa_login_and_assets_no_retired_render_endpoint', { assets: assetEvidence });
  const unsigned = await fetch(url('api') + '/internal/science', { method: 'POST', redirect: 'error', body: '{}', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000) });
  assert.equal(unsigned.status, 401); pass('python_rejects_unsigned_requests');
  const features = Array.from({ length: 24 }, (_, i) => ({ type: 'Feature', id: String(i), geometry: { type: 'Point', coordinates: [-74 + i % 6 * .001, 4 + Math.floor(i / 6) * .001] }, properties: { x: i * .3 + Math.cos(i), value: 2 * (i * .3 + Math.cos(i)) + Math.sin(i * .7) } }));
  const data = { type: 'FeatureCollection', features };
  const validation = await science('validation', 'bsie', { operation: 'validate', data });
  assert.equal(validation.validation.valid, true); pass('synthetic_bsie_validation');
  const regression = await science('regression', 'bsie', { operation: 'regression', data, variable: 'value', predictors: ['x'], model: 'diagnostics', weights: { method: 'knn', k: 4 }, permutations: 19 });
  assert(regression.result.diagnostics); pass('synthetic_spreg_diagnostics');
  const routing = await science('routing', 'sanitary', { operation: 'optimize_routes', nodes: [{ id: '0', demand_kg: 0 }, { id: '1', demand_kg: 5 }], vehicles: [{ id: 'release-fixture', capacity_kg: 10 }], matrix: { node_ids: ['0', '1'], distance_m: [[0, 1000], [1000, 0]], duration_s: [[0, 100], [100, 0]], source: { name: 'SIMULATED release verification, not actual roads', data_kind: 'simulated' } }, time_limit_s: 1 });
  assert.equal(routing.result.independent_validation.valid, true); pass('synthetic_ortools_independent_validation');
  const backup = JSON.parse(fs.readFileSync(path.join(root, 'docs/backstage-2.0/evidence/production-atlas-backup.json'), 'utf8'));
  assert.equal(backup.status, 'backup_passed'); assert.equal(backup.source_writes, 0);
  assert.equal(backup.target_fingerprint, release.atlas_preflight.target_fingerprint);
  assert(backup.backup.readback_verified && backup.backup.tamper_rejected);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, backup.backup.private_file))).digest('hex'), backup.backup.sha256);
  pass('fresh_encrypted_backup_matches_unchanged_production_atlas', { run_id: backup.run_id, sha256: backup.backup.sha256 });
  report.passed = true;
}
main().catch(error => { report.passed = false; report.failure = error.message; process.exitCode = 1; }).finally(() => {
  report.completed_at = new Date().toISOString();
  fs.writeFileSync(path.join(root, `docs/backstage-2.0/evidence/production-${live ? 'postflight' : 'prepromotion'}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, ...(report.failure ? { failure: report.failure } : {}) }));
});
