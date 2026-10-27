// Read-only verification from a fresh process after staging integration cleanup.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { api, state, root } = require('../../scripts/staging-vercel');
const mongo = require('../infrastructure/platformMongo');
const { ownedFilters, COLLECTIONS } = require('./verify-platform-core-atlas');
async function verifyEmpty(database,filters,label){
  const entries=Object.entries(filters);
  for(let start=0;start<entries.length;start+=5)await Promise.all(entries.slice(start,start+5).map(async([name,filter])=>assert.equal(await database.collection(name).countDocuments(filter),0,`${label}: remaining owned ${name}`)));
}
async function main() {
  const db = await mongo.getMongoDatabase();
  const report = { checked_at: new Date().toISOString(), mode: 'fresh_process_read_only_staging_postflight', checks: [], retained_global_request_audit_traces: true };
  try {
    const directories = fs.readdirSync(path.join(root, '.vercel')).filter(name => /^staging-atlas-core-\d{14}-[a-f0-9]{12}$/.test(name));
    assert(directories.length);
    const runs = [];
    for (const directory of directories) {
      const base = path.join(root, '.vercel', directory);
      if (!fs.existsSync(path.join(base, 'ownership.json'))) {
        const early = JSON.parse(fs.readFileSync(path.join(base, 'validation-report.json'), 'utf8'));
        assert.equal(early.status, 'failed'); assert.equal(early.failure.stage, 'preflight'); assert.equal(early.checks.length, 0);
        assert(!fs.existsSync(path.join(base, 'owned-test-records.bson')));
        runs.push({ run_id: early.run_id, stopped_before_registration: true, no_test_tenant_created: true });
        continue;
      }
      const own = JSON.parse(fs.readFileSync(path.join(base, 'ownership.json'), 'utf8'));
      const filters = ownedFilters(own);
      const scoped = Object.keys(mongo.INDEXES).filter(name => !COLLECTIONS.includes(name) && name !== 'soi_counters');
      await verifyEmpty(db,{...filters,...Object.fromEntries(scoped.map(name=>[name,{organization_id:{$in:own.organization_ids}}]))},directory);
      const archive = fs.readFileSync(path.join(base, 'owned-test-records.bson'));
      const retained = await db.collection('soi_audit_events').countDocuments({ organization_id: null, 'metadata.body.email': { $regex: `^${own.run_id}-` } });
      runs.push({ run_id: own.run_id, owned_tenant_rows_remaining: 0, additional_registered_collections_checked: scoped.length, backup_sha256: crypto.createHash('sha256').update(archive).digest('hex'), global_request_trace_count: retained });
    }
    report.runs = runs;
    if(process.argv.includes('--readiness')){
      report.load_runs=[];
      for(const directory of fs.readdirSync(path.join(root,'.vercel')).filter(name=>/^readiness-load-\d{14}-[a-f0-9]{12}$/.test(name))){
        const base=path.join(root,'.vercel',directory),own=JSON.parse(fs.readFileSync(path.join(base,'ownership.json'),'utf8'));
        assert.equal(own.run_id,directory);assert.equal(own.marker,`BACKSTAGE LOAD TEST ${directory}`);
        assert(Number.isSafeInteger(own.organization_id)&&own.organization_id>0);assert(Number.isSafeInteger(own.user_id)&&own.user_id>0);
        const filters=Object.fromEntries(Object.keys(mongo.INDEXES).filter(name=>name!=='soi_counters').map(name=>[name,name==='identity_users'?{user_id:own.user_id}:name==='soi_audit_heads'?{_id:`organization:${own.organization_id}`}:{organization_id:own.organization_id}]));
        await verifyEmpty(db,filters,directory);
        assert(Array.isArray(own.technical_keys)&&own.technical_keys.length===3);assert(own.technical_keys.every(key=>/^auth-rate:(register|login):[a-f0-9]{64}$/.test(key)||key===`readiness-rate:${directory}`));
        assert.equal(await db.collection('soi_provider_locks').countDocuments({_id:{$in:own.technical_keys}}),0);
        report.load_runs.push({run_id:directory,owned_tenant_rows_remaining:0,owned_technical_buckets_remaining:0});
      }
    }
    for (const type of ['api', 'web']) {
      const p = state.projects[type], alias = p.staging_alias; assert.equal(alias, `backstage-staging-${type}.vercel.app`);
      const resolution = await api(`/v4/aliases/${alias}`); assert.equal(resolution.deploymentId, p.deployment.id); assert.equal(resolution.projectId, p.id);
      const project = await api(`/v9/projects/${p.id}`); assert.equal(project.ssoProtection.deploymentType, 'all');
      const url = `https://${alias}`; const route = type === 'web' ? '/api/health' : '/health';
      const denied = await fetch(url + route, { redirect: 'manual' }); assert([302, 401, 403].includes(denied.status));
      const allowed = await fetch(url + route, { headers: { 'x-vercel-protection-bypass': p.bypass }, redirect: 'error' }); assert.equal(allowed.status, 200); assert.equal((await allowed.json()).primaryStore, 'mongodb'); assert(allowed.headers.get('x-request-id'));
      if (type === 'web') {
        const headers = { 'x-vercel-protection-bypass': p.bypass };
        const aliased = await (await fetch(url + '/', { headers })).text();
        const immutable = await (await fetch(`https://${p.deployment.url}/`, { headers })).text();
        const assets = html => [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map(m => m[1]).sort();
        assert(assets(aliased).length > 0); assert.deepEqual(assets(aliased), assets(immutable));
      }
      report.checks.push({ type, alias, deployment_id: p.deployment.id, target: p.deployment.target, protected: true, health: 'mongodb_ok', request_id_forwarded: true });
    }
    report.status = 'passed';
  } finally {
    await mongo.closeMongoConnection();
    fs.writeFileSync(path.join(root, `docs/backstage-2.0/evidence/${process.argv.includes('--readiness') ? 'readiness' : process.argv.includes('--spatial') ? 'phase-5-spatial' : process.argv.includes('--engines') ? 'phase-5-engines' : process.argv.includes('--phase5') ? 'phase-5' : 'staging'}-postflight.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
}
main().catch(error => { console.error(JSON.stringify({ failed: true, code: error.name, message: error.message })); process.exitCode = 1; });
