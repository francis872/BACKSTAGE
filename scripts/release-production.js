// Explicit release to the two existing production projects. No environment writes.
// Build without domain assignment; inspect both immutable builds before promotion.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { api, state: staging, root } = require('./staging-vercel');
const projects = {
  api: { id: 'prj_jjeZc5dTOxYm4yD5jgfGfdEAAB4O', name: 'backstage-api', domain: 'backstage-api.vercel.app' },
  web: { id: 'prj_9IJyARVoFEpyYnhoXmnZ6G0uXtDQ', name: 'backstage-web', domain: 'backstage-web-seven.vercel.app' },
};
const team = 'team_ZhNzYGEKOt2giE4lhRQdm1Lp', scope = 'franciscogloopez-8505s-projects';
const stateFile = path.join(root, '.vercel/production-release-private.json');
const evidenceFile = path.join(root, 'docs/backstage-2.0/evidence/production-release.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { started_at: new Date().toISOString(), authorization: 'User: despliega el programa', projects: {}, checks: [] };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const save = () => { fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 }); fs.writeFileSync(evidenceFile, JSON.stringify(state, null, 2)); };
const progress = (stage, detail = {}) => console.log(JSON.stringify({ stage, ...detail }));
function verifyManifest(source) {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'source-manifest.json'), 'utf8'));
  for (const f of manifest.files) {
    const target = path.resolve(source, f.path);
    assert(target.startsWith(source + path.sep));
    assert(!f.path.split(/[\\/]/).some(p => p.startsWith('.env')));
    assert.equal(digest(fs.readFileSync(target)), f.sha256, 'Source changed: ' + f.path);
  }
  return manifest;
}
async function snapshot() {
  assert(!state.projects.api && !state.projects.web, 'Release snapshot already exists');
  for (const [type, p] of Object.entries(projects)) {
    const current = await api(`/v9/projects/${p.id}`);
    const domains = (await api(`/v9/projects/${p.id}/domains`)).domains;
    assert.equal(current.name, p.name);
    assert(domains.some(d => d.name === p.domain && d.verified));
    assert(current.targets?.production?.id);
    const env = (await api(`/v9/projects/${p.id}/env`)).envs;
    state.projects[type] = { ...p, previous: { id: current.targets.production.id, url: current.targets.production.url },
      protection: current.ssoProtection || null,
      configured_keys: env.filter(e => e.target?.includes('production')).map(e => e.key).sort(),
      domains: domains.map(d => d.name).sort() };
  }
  state.environment_variables_changed = false;
  state.database_migrations = false;
  save(); progress('production_baseline_saved');
}
function cliPath() {
  const value = process.argv[process.argv.indexOf('--cli') + 1];
  assert(process.argv.includes('--cli') && fs.existsSync(value), 'Existing Vercel CLI required');
  return value;
}
async function command(args, cwd, logName) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath(), ...args], { cwd, windowsHide: true, shell: false });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject); child.on('close', status => resolve({ status, stdout, stderr }));
  });
  fs.writeFileSync(path.join(root, '.vercel', logName), result.stdout + result.stderr, { mode: 0o600 });
  assert.equal(result.status, 0, 'Vercel command failed; inspect private log');
  return result;
}
async function deploy(type) {
  const p = state.projects[type]; assert(p && !p.deployment, 'Snapshot required or build already recorded');
  const current = await api(`/v9/projects/${p.id}`); assert.equal(current.targets.production.id, p.previous.id, 'Production changed outside this release');
  const accepted = path.resolve(root, staging.projects[type].source);
  const acceptedManifest = verifyManifest(accepted);
  const prepared = spawnSync(process.execPath, [path.join(__dirname, `prepare-soi-${type === 'web' ? 'web-' : ''}deployment.js`), '--unlinked'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(prepared.status, 0, 'Source preparation failed');
  const source = JSON.parse(prepared.stdout.trim().split(/\r?\n/).at(-1)).directory;
  const manifest = verifyManifest(source);
  // Preserve every accepted runtime file; the release preflight is build tooling only.
  const verificationTools = ['backend/scripts/inspect-staging.js', 'backend/scripts/verify-staging.js'];
  p.updated_verification_tools = [];
  for (const f of acceptedManifest.files) {
    if (['package.json', '.vercel/project.json'].includes(f.path)) continue;
    if (verificationTools.includes(f.path)) {
      if (digest(fs.readFileSync(path.join(source, f.path))) !== f.sha256) p.updated_verification_tools.push(f.path);
      continue;
    }
    assert.equal(digest(fs.readFileSync(path.join(source, f.path))), f.sha256, 'Accepted source differs: ' + f.path);
  }
  if (type === 'api') {
    for (const rel of ['backend/package.json', 'package.json']) {
      const file = path.join(source, rel), pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      pkg.scripts['vercel-build'] = `${rel.startsWith('backend/') ? 'node scripts/release-preflight.js' : 'node backend/scripts/release-preflight.js'} && ${pkg.scripts['vercel-build']}`;
      fs.writeFileSync(file, JSON.stringify(pkg, null, 2));
      manifest.files.find(f => f.path === rel).sha256 = digest(fs.readFileSync(file));
    }
  }
  fs.writeFileSync(path.join(source, 'source-manifest.json'), JSON.stringify(manifest, null, 2));
  verifyManifest(source);
  fs.mkdirSync(path.join(source, '.vercel'), { recursive: true });
  fs.writeFileSync(path.join(source, '.vercel/project.json'), JSON.stringify({ orgId: team, projectId: p.id, projectName: p.name }));
  p.source = path.relative(root, source).replaceAll('\\', '/');
  p.manifest_sha256 = digest(fs.readFileSync(path.join(source, 'source-manifest.json')));
  p.files = manifest.files.length; p.accepted_runtime_files_unchanged = true; save();
  const args = ['deploy', '--prod', '--skip-domain', '--yes', '--scope', scope, '--format', 'json'];
  if (type === 'web') {
    assert.equal(state.projects.api.deployment?.readyState, 'READY');
    p.backend_url = `https://${state.projects.api.deployment.url}`;
    args.push('--env', `BACKEND_URL=${p.backend_url}`);
    // Retired Render endpoints must not receive browser session tokens. The
    // accepted Vercel UI already falls back to HTTP polling on the same origin.
    args.push('--build-env', 'VITE_WS_BASE_URL=', '--build-env', 'VITE_SECURITY_WS_URL=');
    p.retired_render_websocket_overrides = 'empty_at_build_time_same_origin_http_polling_fallback';
  }
  progress('building_without_domain_assignment', { type, source: p.source });
  const result = await command(args, source, `production-${type}-build-private.log`);
  const d = JSON.parse(result.stdout).deployment; assert(d?.id);
  const inspected = await api(`/v13/deployments/${d.id}`);
  assert.equal(inspected.projectId, p.id); assert.equal(inspected.target, 'production'); assert.equal(inspected.readyState, 'READY');
  p.deployment = { id: inspected.id, url: inspected.url, readyState: inspected.readyState, target: inspected.target };
  if (type === 'api') {
    const line = (result.stdout + result.stderr).match(/BACKSTAGE_RELEASE_PREFLIGHT (\{[^\r\n]+\})/);
    assert(line, 'Build did not record its read-only Atlas preflight');
    state.atlas_preflight = JSON.parse(line[1]); assert(state.atlas_preflight.passed);
  }
  save();
  // --skip-domain must leave the existing production domain assigned to the old build.
  const alias = await api(`/v4/aliases/${p.domain}`);
  assert.equal(alias.deploymentId || alias.deployment?.id, p.previous.id);
  progress('production_build_ready_not_promoted', { type, ...p.deployment });
}
async function verifyDomains(previous) {
  for (const type of ['api', 'web']) {
    const p = state.projects[type], target = previous ? p.previous : p.deployment;
    const alias = await api(`/v4/aliases/${p.domain}`);
    assert.equal(alias.projectId, p.id); assert.equal(alias.deploymentId || alias.deployment?.id, target.id);
    const response = await fetch(`https://${p.domain}${type === 'api' ? '/health' : '/api/health'}`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200); const health = await response.json();
    assert.equal(health.mongodb, 'healthy'); assert.equal(health.primaryStore, 'mongodb');
  }
}
async function eventually(previous) {
  for (let i = 0; i < 6; i++) {
    try { await verifyDomains(previous); return; }
    catch (error) { if (i === 5) throw error; await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); }
  }
}
async function promoteTarget(type, previous) {
  const p = state.projects[type], target = previous ? p.previous : p.deployment;
  const d = await api(`/v13/deployments/${target.id}`);
  assert.equal(d.projectId, p.id); assert.equal(d.readyState, 'READY'); assert.equal(d.target, 'production');
  await command(['promote', target.id, '--yes', '--scope', scope, '--timeout', '120s'], path.join(root, p.source), `production-${type}-${previous ? 'rollback' : 'promotion'}-private.log`);
  progress(previous ? 'previous_production_promoted' : 'new_production_promoted', { type, id: target.id });
}
async function rollback() {
  assert(process.argv.includes('--apply'), 'Explicit --apply required');
  // Put the previous web back first; it uses the original stable API domain.
  for (const type of ['web', 'api']) await promoteTarget(type, true);
  await eventually(true); state.status = 'previous_pair_restored'; state.rollback_verified_at = new Date().toISOString(); save();
}
async function promote() {
  assert(process.argv.includes('--apply'), 'Explicit --apply required');
  assert(!state.promoted_at, 'Release already promoted');
  const preflight = JSON.parse(fs.readFileSync(path.join(root, 'docs/backstage-2.0/evidence/production-prepromotion.json'), 'utf8'));
  assert.equal(preflight.passed, true); assert.equal(preflight.mode, 'unpromoted_production_builds');
  for (const type of ['api', 'web']) assert.equal(preflight.deployments[type], state.projects[type].deployment.id);
  const backup = JSON.parse(fs.readFileSync(path.join(root, 'docs/backstage-2.0/evidence/production-atlas-backup.json'), 'utf8'));
  assert.equal(backup.status, 'backup_passed'); assert.equal(backup.target_fingerprint, state.atlas_preflight.target_fingerprint);
  assert(Date.now() - Date.parse(backup.completed_at) < 3600000, 'A recent verified backup is required');
  state.backup_run_id = backup.run_id; await verifyDomains(true); save();
  let attempted = false;
  try {
    attempted = true;
    for (const type of ['api', 'web']) await promoteTarget(type, false);
    await eventually(false);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, 'verify-production-release.js'), '--live'], { cwd: root, windowsHide: true, shell: false });
      let output = ''; child.stdout.on('data', b => { output += b; process.stdout.write(b); }); child.stderr.on('data', b => { output += b; });
      child.on('error', reject); child.on('close', code => resolve({ code, output }));
    });
    fs.writeFileSync(path.join(root, '.vercel/production-postflight-private.log'), result.output, { mode: 0o600 });
    assert.equal(result.code, 0, 'Public production verification failed');
    state.promoted_at = new Date().toISOString(); state.status = 'published_and_verified'; save(); progress('production_pair_published_and_verified');
  } catch (error) {
    state.status = 'promotion_failed'; state.failure = String(error.message).split('\n')[0]; save();
    if (attempted) {
      try { await rollback(); } catch (restoreError) { state.status = 'rollback_needs_attention'; state.rollback_failure = String(restoreError.message).split('\n')[0]; save(); }
    }
    throw error;
  }
}
async function main() {
  const action = process.argv[2];
  if (action === 'snapshot') return snapshot();
  if (action === 'deploy-api' || action === 'deploy-web') return deploy(action.slice(7));
  if (action === 'promote') return promote();
  if (action === 'rollback') return rollback();
  throw new Error('Use snapshot, deploy-api, deploy-web, promote --apply or rollback --apply.');
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ failed: true, reason: error.message })); process.exitCode = 1; });
