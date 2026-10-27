// Dedicated protected Preview projects. Never changes an existing production project.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const stateFile = path.join(root, '.vercel/backstage-staging-private.json');
const evidenceFile = path.join(root, `docs/backstage-2.0/evidence/${process.argv.includes('--backend-phase2') ? 'backend-phase2' : process.argv.includes('--unified') ? 'unified' : process.argv.includes('--origin') ? 'origin' : process.argv.includes('--readiness') ? 'readiness' : process.argv.includes('--spatial') ? 'phase-5-spatial' : process.argv.includes('--engines') ? 'phase-5-engines' : process.argv.includes('--phase5') ? 'phase-5' : 'staging'}-deployment.json`);
const originals = { api: 'prj_jjeZc5dTOxYm4yD5jgfGfdEAAB4O', web: 'prj_9IJyARVoFEpyYnhoXmnZ6G0uXtDQ' };
const teamId = 'team_ZhNzYGEKOt2giE4lhRQdm1Lp';
const scope = 'franciscogloopez-8505s-projects';
const action = process.argv[2];
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { created_at: new Date().toISOString(), projects: {}, baseline: {} };
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const progress = (stage, detail = {}) => console.log(JSON.stringify({ stage, ...detail }));
async function api(endpoint, method = 'GET', body) {
  const auth = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'com.vercel.cli/Data/auth.json'), 'utf8'));
  let response;
  for(let attempt=0;attempt<3;attempt++){
    try{response=await fetch(`https://api.vercel.com${endpoint}${endpoint.includes('?') ? '&' : '?'}teamId=${teamId}`, { method, headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });break;}
    catch(error){if(method!=='GET'||attempt===2)throw error;progress('vercel_read_retry',{attempt:attempt+1,code:error.cause?.code||error.name});await new Promise(resolve=>setTimeout(resolve,750*(attempt+1)));}
  }
  const output = await response.json();
  if (!response.ok) { const error = new Error(`Vercel API ${method} ${endpoint} HTTP ${response.status}: ${output.error?.code || 'REQUEST_FAILED'}; ${String(output.error?.message || '').slice(0, 250)}`); error.status = response.status; throw error; }
  return output;
}
function baseline(project, domains) {
  return { id: project.id, production: project.targets?.production ? { id: project.targets.production.id, url: project.targets.production.url } : null, domains: domains.domains.map(d => ({ name: d.name, redirect: d.redirect || null, gitBranch: d.gitBranch || null })).sort((a, b) => a.name.localeCompare(b.name)) };
}
async function originalSnapshot(type) {
  return baseline(await api(`/v9/projects/${originals[type]}`), await api(`/v9/projects/${originals[type]}/domains`));
}
function writeEvidence() {
  const origin = process.argv.includes('--origin');
  fs.writeFileSync(evidenceFile, JSON.stringify({ updated_at: new Date().toISOString(), mode: 'dedicated_protected_staging_preview', target_fingerprint: state.target_fingerprint, original_projects: origin ? state.origin_production_verified?.baseline || null : state.baseline,
    projects: Object.fromEntries(Object.entries(state.projects).map(([type, p]) => [type, { id: p.id, name: p.name, protection: 'vercel_auth_all_deployments', environment: 'preview', configured_keys: p.configured_keys, source: p.source, manifest_sha256: p.manifest_sha256, deployment: p.deployment, staging_alias: p.staging_alias, bootstrap_deployment: p.bootstrap_deployment }])), production_unchanged: origin ? state.origin_production_verified?.unchanged ?? null : state.production_unchanged ?? null }, null, 2));
}
async function configure(type, values) {
  const project = state.projects[type]; assert(project && project.id !== originals[type] && project.name.startsWith('backstage-staging-'));
  for (const [key, value] of Object.entries(values)) {
    await api(`/v10/projects/${project.id}/env?upsert=true`, 'POST', { key, value: String(value), type: /SECRET|URI|BYPASS/.test(key) ? 'sensitive' : 'encrypted', target: ['preview'] });
    project.configured_keys = [...new Set([...(project.configured_keys || []), key])]; save();
  }
  progress('preview_configuration_ready', { type, keys: Object.keys(values) });
}
async function deploy(type) {
  const cli = process.argv[process.argv.indexOf('--cli') + 1]; assert(process.argv.includes('--cli') && fs.existsSync(cli));
  const prepare = type === 'api' ? 'prepare-soi-deployment.js' : 'prepare-soi-web-deployment.js';
  const prepared = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, prepare), '--unlinked'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(prepared.status, 0, 'Source preparation failed');
  const source = JSON.parse(prepared.stdout.trim().split(/\r?\n/).at(-1)).directory;
  const project = state.projects[type]; assert(project?.name.startsWith('backstage-staging-'));
  fs.mkdirSync(path.join(source, '.vercel'), { recursive: true });
  fs.writeFileSync(path.join(source, '.vercel/project.json'), JSON.stringify({ orgId: teamId, projectId: project.id, projectName: project.name }));
  project.source = path.relative(root, source).replaceAll('\\', '/'); project.manifest_sha256 = hash(fs.readFileSync(path.join(source, 'source-manifest.json'))); save(); writeEvidence();
  progress('building_preview', { type, source: project.source });
  const args = [cli, 'deploy', '--target', 'preview', '--yes', '--scope', scope, '--format', 'json'];
  if (process.argv.includes('--diagnostic')) args.push('--debug');
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: source, windowsHide: true, shell: false }); let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject); child.on('close', status => resolve({ status, stdout, stderr }));
  });
  fs.writeFileSync(path.join(root, `.vercel/backstage-staging-${type}-build.log`), result.stdout + result.stderr);
  let output; try { output = JSON.parse(result.stdout); } catch {}
  const d = output?.deployment;
  if (d?.id) project.deployment = { id: d.id, url: d.url, readyState: d.readyState, target: d.target ?? null };
  save(); writeEvidence();
  assert.equal(result.status, 0, `Preview ${type} build failed; inspect private build log`);
  assert.equal(d?.readyState, 'READY');
  const inspected = await api(`/v13/deployments/${d.id}`); assert.equal(inspected.projectId, project.id);
  if (inspected.target === 'production') {
    // Vercel bootstraps the first deployment in a new project as its production
    // target. It has no production secrets; only our dedicated staging project.
    project.bootstrap_deployment = { id: inspected.id, url: inspected.url, target: inspected.target };
    save(); writeEvidence(); progress('new_staging_project_bootstrap_complete', { type });
    throw new Error('New staging project bootstrapped; deploy again for Preview variables');
  }
  project.deployment = { id: inspected.id, url: inspected.url, readyState: inspected.readyState, target: inspected.target ?? 'preview' }; save(); writeEvidence();
  progress('preview_ready', { type, ...project.deployment });
}
async function main() {
  if (action === 'setup') {
    require('../backend/node_modules/dotenv').config({ path: path.join(root, 'backend/.env') });
    const uri = process.env.MONGODB_URI, db = process.env.MONGODB_DB || process.env.MONGODB_SPATIAL_DB || 'backstage_spatial'; assert(uri?.startsWith('mongodb+srv://'));
    const validated = JSON.parse(fs.readFileSync(path.join(root, 'docs/backstage-2.0/evidence/atlas-core-preflight.json'), 'utf8'));
    state.target_fingerprint = hash(`${uri}\n${db}`); assert.equal(state.target_fingerprint, validated.target_fingerprint);
    for (const type of ['api', 'web']) {
      const current = await originalSnapshot(type); if (state.baseline[type]) assert.deepEqual(current, state.baseline[type]); else state.baseline[type] = current;
      save();
      if (!state.projects[type]) {
        const name = `backstage-staging-${type}`;
        let exists; try { exists = await api(`/v9/projects/${name}`); } catch (error) { if (error.status !== 404) throw error; }
        assert(!exists, 'Existing staging project is not owned by this run; refusing changes');
        const p = await api('/v10/projects', 'POST', { name, framework: null, ssoProtection: { deploymentType: 'all' } });
        state.projects[type] = { id: p.id, name: p.name }; save(); progress('isolated_project_created', { type, id: p.id, name: p.name });
      }
      const p = state.projects[type];
      if (!p.bypass_configured) {
        p.bypass = crypto.randomBytes(16).toString('hex'); save();
        await api(`/v1/projects/${p.id}/protection-bypass`, 'PATCH', { generate: { secret: p.bypass, note: 'BACKSTAGE authorized staging verification' } });
        p.bypass_configured = true; save();
      }
    }
    state.jwt_secret ||= crypto.randomBytes(48).toString('hex'); state.rpc_secret ||= crypto.randomBytes(48).toString('hex'); save();
    const values = { MONGODB_URI: uri, MONGODB_SPATIAL_DB: db, JWT_SECRET: state.jwt_secret, JWT_ISSUER: 'backstage-staging', NODE_ENV: 'production', SPATIAL_STORE: 'atlas', BACKSTAGE_DATA_STORE: 'mongodb', SOI_SCIENCE_RPC_SECRET: state.rpc_secret, SOI_SCIENCE_RPC_URL: 'self', BSIE_REQUEST_WORKER: 'true', VERCEL_SUPPORT_LARGE_FUNCTIONS: '1' };
    // Preserve an explicit DNS override when the authorized test connection uses it.
    for (const key of ['MONGODB_DNS_SERVERS']) if (process.env[key]) values[key] = process.env[key];
    await configure('api', values); writeEvidence();
  } else if (action === 'deploy-api') await deploy('api');
  else if (action === 'deploy-web') {
    assert.equal(state.projects.api.deployment.readyState, 'READY');
    await configure('web', { BACKEND_URL: state.projects.api.deployment.url.startsWith('https://') ? state.projects.api.deployment.url : `https://${state.projects.api.deployment.url}`, BACKEND_PROTECTION_BYPASS: state.projects.api.bypass });
    await deploy('web');
  } else if (action === 'verify-production') {
    if (process.argv.includes('--origin')) {
      // The authorized production release superseded the initial staging baseline.
      // Verify against that release without rewriting either historical journal.
      const release = JSON.parse(fs.readFileSync(path.join(root, '.vercel/production-release-private.json'), 'utf8'));
      const baseline = {};
      for (const type of ['api', 'web']) {
        const expected = release.projects[type], current = await originalSnapshot(type);
        assert.equal(current.production?.id, expected.deployment.id);
        assert(current.domains.some(domain => domain.name === expected.domain));
        const alias = await api(`/v4/aliases/${expected.domain}`); assert.equal(alias.deploymentId, expected.deployment.id);
        baseline[type] = current;
      }
      state.origin_production_verified = { unchanged: true, checked_at: new Date().toISOString(), baseline };
    } else {
      for (const type of ['api', 'web']) assert.deepEqual(await originalSnapshot(type), state.baseline[type], `Original ${type} project changed`);
      state.production_unchanged = true;
    }
    save(); writeEvidence(); progress('original_production_targets_and_domains_unchanged');
  } else if (action === 'alias-staging') {
    if(process.argv.includes('--backend-phase2')){
      assert(process.argv.includes('--origin'),'Backend phase 2 also requires the existing Origin regression guard');
      const acceptance=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/phase2-staging-live.json'),'utf8'));
      assert.equal(acceptance.status,'passed');assert.equal(acceptance.cleanup?.passed,true);assert.equal(acceptance.api_interception,false);
      for(const type of ['api','web'])assert.equal(acceptance.deployments[type].id,state.projects[type].deployment.id);
    }
    if (process.argv.includes('--unified')) {
      assert(process.argv.includes('--origin'), 'Unified increment also requires the Origin regression guard');
      const security = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/account-security-live.json'), 'utf8'));
      assert.equal(security.status, 'passed'); assert.equal(security.cleanup?.passed, true); assert.equal(security.api_interception, false);
      for (const type of ['api', 'web']) assert.equal(security.deployments[type].id, state.projects[type].deployment.id);
    }
    if (process.argv.includes('--origin')) {
      const acceptance = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/origin-live.json'), 'utf8'));
      assert.equal(acceptance.status, 'passed'); assert.equal(acceptance.cleanup?.passed, true);
      assert.equal(acceptance.api_interception, false);
      for (const type of ['api', 'web']) assert.equal(acceptance.deployments[type].id, state.projects[type].deployment.id);
    }
    for (const type of ['api', 'web']) {
      const p = state.projects[type]; assert.equal(p.name, `backstage-staging-${type}`); assert.equal(p.deployment.target, 'preview');
      const alias = `${p.name}.vercel.app`;
      const domains = await api(`/v9/projects/${p.id}/domains`); assert(domains.domains.some(d => d.name === alias), 'Alias must already belong to our staging project');
      const assigned = await api(`/v2/deployments/${p.deployment.id}/aliases`, 'POST', { alias }); assert.equal(assigned.alias, alias);
      p.staging_alias = alias; save(); progress('staging_alias_assigned', { type, alias });
    }
    writeEvidence();
  } else throw new Error('Use setup, deploy-api, deploy-web or verify-production');
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ failed: true, reason: error.message })); process.exitCode = 1; });
module.exports = { api, state, root, stateFile };
