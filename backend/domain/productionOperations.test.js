const test = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./helpers/soiMongoMemoryFixture');
const { createHostedMonitor, monitorConfiguration } = require('../services/hostedMonitor.service');
const { createWorkerHeartbeat } = require('../services/workerHeartbeat.service');
const { createSatelliteCatalog, searchInput, boundedJson } = require('../services/satelliteCatalog.service');
const { createBusinessRulesService, materialize } = require('../services/businessRules.service');
const { createMongoSoiService } = require('../services/soiMongo.service');
const {target,evaluate}=require('../../scripts/production-preflight');
const {assertRuntimeTarget}=require('./deploymentTarget');
test('production operations acceptance backs up and removes every added fixture collection',()=>{
 const {OWNED_COLLECTIONS}=require('../scripts/verify-computational-atlas');
 for(const name of ['soi_operations','soi_configuration','analytics_jobs','analysis_runs'])assert(OWNED_COLLECTIONS.includes(name));
 for(const name of ['soi_counters','soi_provider_locks'])assert(!OWNED_COLLECTIONS.includes(name));
});
function setup() {
  const f = fixture({ identity_organizations: [{ organization_id: 7, status: 'active' }], identity_users: [{ user_id: 1, status: 'active' }, { user_id: 2, status: 'active' }], identity_memberships: [{ organization_id: 7, user_id: 1, role: 'admin' }, { organization_id: 7, user_id: 2, role: 'viewer' }], analysis_runs: [{ organization_id: 7, analysis_run_id: 9, metadata: {} }], soi_configuration: [{ organization_id: 7, capabilities: ['operations'] }], soi_operations: [{ organization_id: 7, operation_id: 1, status: 'active', metadata: { analysis_run_id: 9 } }] });
  const infra = { getMongoDatabase: async () => f.options.database, withMongoTransaction: f.options.transaction, nextId: f.options.nextId, cleanDocument: x => x };
  return { f, infra, context: { organizationId: 7, userId: 1, role: 'admin' } };
}
const env = { BACKSTAGE_RUNTIME_ENV: 'production', MONITOR_API_ORIGIN: 'https://api.example.invalid', MONITOR_WEB_ORIGIN: 'https://web.example.invalid', MONITOR_EXPECT_PROTECTION: 'false' };
const healthy = () => new Response(JSON.stringify({ status: 'ok', mongodb: 'healthy', primaryStore: 'mongodb' }), { status: 200, headers: { 'x-request-id': 'isolated-test' } });
test('hosted monitor persists incidents and recovery across fresh instances and reports stale worker/monitor', async () => {
  const s = setup(); let time = Date.parse('2026-10-25T12:00:00Z'), failing = false;
  const heartbeat = createWorkerHeartbeat({ database: s.infra.getMongoDatabase, env, now: () => time });
  const service = () => createHostedMonitor({ infrastructure: s.infra, env, now: () => time, fetchImpl: async () => failing ? new Response('{}', { status: 503 }) : healthy() });
  await heartbeat.pulse(); assert.equal((await service().cycle()).healthy, true);
  assert.equal((await service().read(s.context)).status, 'healthy');
  failing = true; await service().cycle(); await service().cycle();
  assert.equal((await service().read(s.context)).status, 'incident_open');
  failing = false; await service().cycle(); await service().cycle();
  const recovered = await service().read(s.context);
  assert.equal(recovered.status, 'healthy'); assert(recovered.events.some(x => x.event === 'incident.resolved'));
  assert.equal(recovered.requires_local_computer_and_signed_in_user, false);
  assert(!JSON.stringify(recovered).includes('lease_owner'));
  time += 61000; assert.equal((await service().cycle()).healthy, false);
  await service().cycle(); assert.equal((await service().read(s.context)).incidents.computational_worker.open, true);
  time += 181000; assert.equal((await service().read(s.context)).status, 'monitor_stale');
});
test('hosted monitoring rejects invalid origins, redirects, revoked admins and overlapping cycles', async () => {
  for (const bad of ['http://api.example.invalid', 'https://user:secret@api.example.invalid', 'https://api.example.invalid/private']) assert.throws(() => monitorConfiguration({ ...env, MONITOR_API_ORIGIN: bad }));
  assert.throws(() => monitorConfiguration({ ...env, MONITOR_EXPECT_PROTECTION: 'true' }));
  const s = setup(), monitor = createHostedMonitor({ infrastructure: s.infra, env, fetchImpl: async (url, options) => { assert.equal(options.redirect, 'error'); throw Error('isolated redirect'); } });
  assert.equal((await monitor.cycle()).healthy, false);
  await assert.rejects(monitor.read({ ...s.context, userId: 2 }), { statusCode: 403 });
  await s.f.options.database.collection('identity_memberships').updateOne({ user_id: 1 }, { $set: { role: 'viewer' } });
  await assert.rejects(monitor.read(s.context), { statusCode: 403 });
  await s.f.options.database.collection('soi_provider_locks').updateOne({ _id: 'monitor:hosted-production' }, { $set: { lease_owner: 'other', lease_until: new Date(Date.now() + 45000) } });
  assert.equal((await monitor.cycle()).skipped, true);
});
const query = { provider: 'sentinel', bbox: [-74.2, 4.5, -74, 4.7], start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z', limit: 2 };
function satelliteResponse(collection) {
  return { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'fixture-scene', collection, geometry: { type: 'Polygon', coordinates: [[[-74.2, 4.5], [-74, 4.5], [-74, 4.7], [-74.2, 4.5]]] }, properties: { datetime: '2026-01-15T00:00:00Z', 'eo:cloud_cover': 9, gsd: 10 } }], links: [{ rel: 'next', href: 'https://untrusted.example.invalid' }] };
}
test('satellite catalogs use fixed endpoints, bounded queries and real metadata contracts without downloading imagery', async () => {
  const s = setup(), calls = [];
  const service = createSatelliteCatalog({ infrastructure: s.infra, fetchImpl: async (url, options) => { calls.push({ url, options }); const collection = url.endsWith('/search') ? JSON.parse(options.body).collections[0] : url.split('/').at(-1); return new Response(JSON.stringify(url.endsWith('/search') ? satelliteResponse(collection) : { id: collection, license: 'isolated-fixture-license' })); } });
  for (const provider of ['sentinel', 'landsat']) {
    const result = await service.search(s.context, { ...query, provider });
    assert.equal(result.features.length, 1); assert.equal(result.provenance.imagery_downloaded, false);
    assert.equal(result.features[0].properties.quality, 'provider_declared_not_independently_verified');
    assert.equal(result.provenance.pagination_followed, false);
  }
  assert.equal(calls.length, 4);
  assert(calls.every(x => x.url.startsWith('https://earth-search.aws.element84.com/v1/') && x.options.redirect === 'error'));
  assert(calls.every(x => !x.options.headers.Authorization));
  await assert.rejects(service.search({ ...s.context, userId: 2 }, query), { statusCode: 403 });
  await assert.rejects(service.search({ ...s.context, organizationId: 8 }, query), { statusCode: 403 });
  assert.equal(calls.length, 4);
});
test('satellite search rejects arbitrary URLs, excessive bounds, oversized streams and provider failures', async () => {
  for (const bad of [{ ...query, url: 'https://elsewhere.invalid' }, { ...query, limit: 21 }, { ...query, bbox: [-180, -90, 180, 90] }, { ...query, provider: '__proto__' }, { ...query, max_cloud_cover: '10' }, { ...query, end: '2028-01-01T00:00:00Z' }]) assert.throws(() => searchInput(bad), { statusCode: 400 });
  await assert.rejects(boundedJson(new Response('x'.repeat(3000001))), { statusCode: 503 });
  const s = setup(), failed = createSatelliteCatalog({ infrastructure: s.infra, fetchImpl: async () => { throw Error('isolated failure with private details'); } });
  await assert.rejects(failed.search(s.context, query), e => e.statusCode === 503 && !e.message.includes('private details'));
});
test('freshness gate rechecks time, policy, authorization and project in the same transaction', async () => {
  const s = setup(), business = createBusinessRulesService(s.infra), gate = () => s.infra.withMongoTransaction((db, session) => business.assertFreshnessIn(db, session, s.context, 9));
  await assert.rejects(gate(), { statusCode: 409 });
  await business.review(s.context, { project_id: 9, sources: [{ reference: 'fixture source', category: 'EXTERNAL_API', observed_at: new Date().toISOString() }] });
  assert.equal((await gate()).sources[0].status, 'fresh');
  const project = s.f.data().analysis_runs[0]; project.metadata.business_review.sources[0].observed_at = '2000-01-01T00:00:00Z';
  await assert.rejects(gate(), { statusCode: 409 });
  assert.equal(s.f.data().soi_audit_events.filter(x => x.action === 'business_rules.gate_passed').length, 1);
  await business.review(s.context, { project_id: 9, sources: [{ reference: 'fixture source', category: 'IMPORTED', observed_at: new Date().toISOString() }] });
  const policy = await business.get(7); await business.save(s.context, { ...policy.rules, revision: policy.revision });
  await assert.rejects(gate(), { statusCode: 409 });
  await assert.rejects(s.infra.withMongoTransaction((db, tx) => business.assertFreshnessIn(db, tx, { ...s.context, organizationId: 8 }, 9)), { statusCode: 403 });
});
test('source exceptions expire at the business gate and failed gates cannot close linked operations', async () => {
  const s = setup(), business = createBusinessRulesService(s.infra), soi = createMongoSoiService(s.infra), source = { reference: 'old fixture', category: 'IMPORTED', observed_at: '2000-01-01T00:00:00Z' };
  await assert.rejects(soi.updateStatus(s.context, 'operations', 1, { status: 'completed' }), { statusCode: 409 });
  assert.equal(s.f.data().soi_operations[0].status, 'active');
  await business.review(s.context, { project_id: 9, sources: [source] });
  const p = materialize();
  await business.exception(s.context, { project_id: 9, rule: 'source_freshness', source_reference: source.reference, reason: 'Controlled fixture exception for planning acceptance.', policy_revision: p.revision, policy_sha256: p.sha256, expires_at: new Date(Date.now() + 3600000).toISOString() });
  assert.equal((await soi.updateStatus(s.context, 'operations', 1, { status: 'completed' })).status, 'completed');
  s.f.data().analysis_runs[0].metadata.business_exceptions[0].expires_at = '2000-01-01T00:00:00Z';
  await assert.rejects(soi.updateStatus(s.context, 'operations', 1, { status: 'completed' }), { statusCode: 409 });
});
test('production checklist compares actual database targets independently of credentials and never authorizes promotion',()=>{
  const one=target('mongodb+srv://account:secret@cluster.example.invalid/','production');
  assert.equal(one,target('mongodb+srv://another:password@cluster.example.invalid/','production'));
  assert.notEqual(one,target('mongodb+srv://account:secret@cluster.example.invalid/','staging'));
  const result=evaluate({env:{BACKSTAGE_RUNTIME_ENV:'production',MONGODB_URI:'mongodb+srv://account:secret@cluster.example.invalid/',MONGODB_DB:'production'},stagingTarget:one});
  assert.equal(result.status,'blocked');assert.equal(result.checks.find(x=>x.name==='production_database_distinct_from_staging').passed,false);
  assert.equal(result.automatic_promotion_authorized,false);assert(!JSON.stringify(result).includes('secret'));
  const runtime={BACKSTAGE_RUNTIME_ENV:'production',MONGODB_URI:'mongodb+srv://account:secret@cluster.example.invalid/',MONGODB_DB:'production',BACKSTAGE_PRODUCTION_TARGET_SHA256:one,BACKSTAGE_STAGING_TARGET_SHA256:one};
  assert.throws(()=>assertRuntimeTarget(runtime));
  assert.doesNotThrow(()=>assertRuntimeTarget({...runtime,BACKSTAGE_STAGING_TARGET_SHA256:target(runtime.MONGODB_URI,'staging')}));
  assert.throws(()=>assertRuntimeTarget({...runtime,MONGODB_DB:'staging'}));
});
test('direct creation of completed project-linked operations cannot bypass source review',async()=>{
 const s=setup(),soi=createMongoSoiService(s.infra),input={name:'Fixture only',operation_type:'isolated',status:'completed',data_type:'SIMULATED',source:'Isolated fixture',metadata:{analysis_run_id:9}};
 await assert.rejects(soi.create(s.context,'operations',input),{statusCode:409});
 await assert.rejects(soi.create(s.context,'operations',{...input,status:'planned',metadata:{analysis_run_id:999}}),{statusCode:404});
 assert.equal(s.f.data().soi_operations.length,1);
});
test('risk review, report closure and recommendation approval commit only with a passing source gate',async t=>{
 const s=setup(),businessModule=require('../services/businessRules.service'),d=require('../infrastructure/atlasDocuments'),events=require('../services/operationalEvents.service');
 const originals={service:businessModule.service,transaction:d.withMongoTransaction,one:d.one,emit:events.emit};
 t.after(()=>{businessModule.service=originals.service;d.withMongoTransaction=originals.transaction;d.one=originals.one;events.emit=originals.emit;});
 businessModule.service=createBusinessRulesService(s.infra);d.withMongoTransaction=s.infra.withMongoTransaction;d.one=(name,filter,sort={})=>s.f.options.database.collection(name).findOne(filter,{sort});events.emit=async()=>{};
 await s.f.options.database.collection('recommendations').insertOne({organization_id:7,recommendation_id:12,analysis_run_id:9,status:'proposed'});
 const repo=require('../repositories/analysis.repository'),recommendations=require('../services/recommendations.service'),input={analysisRunId:9,organizationId:7,userId:1,riskSummary:{counts:{missing:0}},snapshot:{data_kind:'SIMULATED_FIXTURE'}};
 await assert.rejects(repo.saveRiskReview(input),{statusCode:409});await assert.rejects(repo.markReportGenerated(input),{statusCode:409});
 await assert.rejects(recommendations.reviewRecommendation(12,7,{user_id:1},{decision:'approved',notes:'Isolated approval fixture.'}),{statusCode:409});
 assert.equal(s.f.data().recommendations[0].status,'proposed');assert.equal(s.f.data().analysis_runs[0].metadata.report_generated_at,undefined);
 await businessModule.service.review(s.context,{project_id:9,sources:[{reference:'Fixture review metadata',category:'IMPORTED',observed_at:new Date().toISOString()}]});
 assert((await repo.saveRiskReview(input)).metadata.risk_reviewed_at);
 assert.equal((await recommendations.reviewRecommendation(12,7,{user_id:1},{decision:'approved',notes:'Isolated approval fixture.'})).status,'approved');
 assert((await repo.markReportGenerated(input)).metadata.report_generated_at);
 assert.equal(s.f.data().soi_audit_events.filter(x=>x.action==='business_rules.gate_passed').length,3);
});
