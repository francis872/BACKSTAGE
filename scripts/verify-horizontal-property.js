// Opt-in integration: only a fresh, ownership-marked test namespace. No Vercel deploy or Docker.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
async function run() {
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ mode: 'plan_only', scope: 'fresh_owned_atlas_test_database', application: '--apply', docker: false, production_changes: false })); return; }
  require('../backend/node_modules/dotenv').config({ path: path.join(root, 'backend/.env') });
  const original = process.env.MONGODB_DB || process.env.MONGODB_SPATIAL_DB || 'backstage_spatial';
  const expected = JSON.parse(fs.readFileSync(path.join(root, '.vercel/backstage-staging-private.json'), 'utf8'));
  assert.equal(crypto.createHash('sha256').update(`${process.env.MONGODB_URI}\n${original}`).digest('hex'), expected.target_fingerprint, 'Requires the previously authorized test connection');
  const runId = crypto.randomUUID(), database = `backstage_ph_${crypto.randomBytes(4).toString('hex')}`;
  assert.match(database, /^backstage_ph_[a-f0-9]{8}$/); assert.notEqual(database, original);
  process.env.MONGODB_DB = database; process.env.MONGODB_SPATIAL_DB = database; process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  const community=process.argv.includes('--community'), spatial = process.argv.includes('--spatial'), economics = process.argv.includes('--economics'), normative=process.argv.includes('--normative'), operations = process.argv.includes('--operations') || spatial || economics || normative || community, password = crypto.randomBytes(24).toString('base64url');
  if(spatial)process.env.SOI_SCIENCE_RPC_URL=''; // This acceptance explicitly executes the installed local Python engine.
  if(operations){process.env.HEBRA_ACTIVE_KEY_ID='acceptance';process.env.HEBRA_ENCRYPTION_KEYS=JSON.stringify({acceptance:crypto.randomBytes(32).toString('base64')});}
  const mongo = require('../backend/infrastructure/platformMongo'), { createHorizontalPropertyService } = require('../backend/services/horizontalProperty.service');
  const report = { started_at: new Date().toISOString(), run_id: runId, scope: 'fresh_owned_atlas_test_database_and_local_http', production_changes: false, remote_deployment: false, docker_used: false, checks: [] };
  let db, server, owns = false;
  const pass = name => report.checks.push({ name, passed: true });
  try {
    db = await mongo.getMongoDatabase({ requireSchema: false });
    assert.equal((await db.listCollections({}, { nameOnly: true }).toArray()).length, 0);
    await db.collection('soi_schema_versions').insertOne({ _id: 'ph-ownership', run_id: runId, nature: 'SYNTHETIC_ISOLATED_TEST' }); owns = true;
    for (const name of ['identity_users', 'identity_organizations', 'identity_memberships', 'locations', 'operational_events', 'soi_audit_events', 'soi_audit_heads', 'soi_counters']) {
      await db.createCollection(name); for (const i of mongo.INDEXES[name] || []) await db.collection(name).createIndex(i.key, i.options);
    }
    await db.collection('soi_schema_versions').insertOne({ _id: 'soi', version: 2 });
    await db.collection('identity_users').insertMany([1, 2, 3].map(user_id => ({ user_id, name: `PH synthetic ${user_id}`, email: `ph-${user_id}@example.invalid`, status: 'active', session_version: 0 })));
    if(operations)await db.collection('identity_users').updateOne({user_id:1},{$set:{password_hash:require('../backend/auth').createPasswordHash(password)}});
    await db.collection('identity_organizations').insertMany([10, 20].map(organization_id => ({ organization_id, name: `PH synthetic ${organization_id}`, slug: `ph-${organization_id}`, status: 'active' })));
    await db.collection('identity_memberships').insertMany([{ organization_id: 10, user_id: 1, role: 'admin' }, { organization_id: 10, user_id: 2, role: 'viewer' }, { organization_id: 20, user_id: 3, role: 'admin' }]);
    pass('owned_namespace_and_additive_indexes_created_without_touching_source');
    const express = require('../backend/node_modules/express'), { authenticate, createToken } = require('../backend/auth');
    const { createAssetsRouter } = require('../backend/routes/assets.routes');
    const user = { user_id: 1, organization_id: 10, role: 'admin', name: 'PH synthetic admin', email: 'ph-1@example.invalid', organization_name: 'PH synthetic 10', memberships: [{ organization_id: 10, role: 'admin', organization_name: 'PH synthetic 10' }] };
    const app = express(); app.use(express.json({ limit: '1mb' })); app.use('/api/assets', createAssetsRouter()); app.use('/api/locations', require('../backend/routes/locations.routes'));
    if(operations){app.use('/api/auth',require('../backend/routes/auth.routes'));app.use('/api/operational-events',require('../backend/routes/operationalEvents.routes'));app.use('/api/audit-logs',require('../backend/routes/auditLogs.routes'));}
    else app.get('/api/auth/me', authenticate, async (req, res) => { const member = await db.collection('identity_memberships').findOne({ organization_id: 10, user_id: req.user.user_id }); res.json({ ...user, role: member.role, memberships: [{ ...user.memberships[0], role: member.role }] }); });
    app.get('/api/recommendation/example', (req, res) => res.json({ recommendation: 'Isolated PH acceptance' }));
    app.use('/api', (req, res) => res.status(req.method === 'GET' ? 200 : 404).json([]));
    app.use(express.static(path.join(root, 'frontend/dist'))); app.use((req, res) => res.sendFile(path.join(root, 'frontend/dist/index.html'))); app.use(require('../backend/middleware/errorHandler'));
    server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); const origin = `http://127.0.0.1:${server.address().port}`;
    const tokens = Object.fromEntries([1, 2, 3].map(user_id => [user_id, createToken({ user_id, organization_id: user_id === 3 ? 20 : 10, role: user_id === 2 ? 'viewer' : 'admin' })]));
    const request = async (suffix = '', { who = 1, body, key = crypto.randomUUID(), method = body ? 'POST' : 'GET', pathPrefix = '/api/assets/layers/horizontal-property' } = {}) => {
      const r = await fetch(origin + pathPrefix + suffix, { method, headers: { Authorization: `Bearer ${tokens[who]}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: r.status, body: await r.json() };
    };
    const payload = { name: 'Atlas root', kind: 'coproperty', source_name: 'Synthetic fixture, not an actual property', geometry: { type: 'Point', coordinates: [0, 0] } }, key = crypto.randomUUID();
    const created = await request('', { body: payload, key }); assert.equal(created.status, 201); const parent = created.body.data;
    const replay = await request('', { body: payload, key }); assert.equal(replay.status, 200); assert.equal(replay.body.data.location_id, parent.location_id);
    const duplicateKey = crypto.randomUUID(), duplicateBody = { name: 'Concurrent idempotent root', kind: 'coproperty', source_name: 'Synthetic fixture' };
    const duplicates = await Promise.all([1, 2].map(() => request('', { body: duplicateBody, key: duplicateKey })));
    assert.deepEqual(duplicates.map(r => r.status).sort(), [200, 201]); assert.equal(duplicates[0].body.data.location_id, duplicates[1].body.data.location_id);
    pass('actual_http_creation_idempotency_and_zero_coordinates');
    assert.equal((await request(`/${parent.location_id}`, { who: 3 })).status, 404);
    assert.equal((await request('', { body: payload, who: 2 })).status, 403); pass('actual_atlas_tenant_isolation_and_viewer_denial');
    const concurrent = await Promise.all([1, 2].map(n => request('', { body: { name: `Competing unit ${n}`, kind: 'private_unit', parent_id: parent.location_id, coefficient_pct: '60', source_name: 'Synthetic fixture' } })));
    assert.deepEqual(concurrent.map(r => r.status).sort(), [201, 409]); const unit = concurrent.find(r => r.status === 201).body.data;
    const detail = await request(`/${unit.location_id}`); assert.equal(detail.body.data.geometry, null); assert.equal(detail.body.spatial_reference.mode, 'linked_ancestor'); assert.equal(detail.body.allocation.total_pct, 60);
    pass('actual_concurrent_transactions_prevent_over_allocation_without_inventing_child_geometry');
    assert.equal((await request(`/${parent.location_id}`, { method: 'PUT', pathPrefix: '/api/locations', body: { name: 'Bypass', type: 'property' } })).status, 409);
    assert.equal((await request(`/${parent.location_id}`, { method: 'DELETE', pathPrefix: '/api/locations' })).status, 409);
    const locations = require('../backend/services/locations.service'); await assert.rejects(locations.updateLocation(parent.location_id, { name: 'Bypass', type: 'property' }, 10, 1), { statusCode: 409 });
    pass('generic_asset_mutation_cannot_bypass_layer_rules');
    const edited = await request(`/${unit.location_id}`, { method: 'PATCH', body: { revision: 1, coefficient_pct: '33.3333' } }); assert.equal(edited.status, 200);
    assert.equal((await request(`/${unit.location_id}`, { method: 'PATCH', body: { revision: 1, name: 'Stale' } })).status, 409);
    assert.equal((await request(`/${parent.location_id}/archive`, { body: { revision: 1 } })).status, 409);
    pass('real_revision_conflict_and_archive_parent_guard');
    if(operations && !process.argv.includes('--spatial-focused') && !economics && !normative && !community){const result=await require('./property-operations-live-scenarios').verifyOperations({request,db,mongo,root:parent,unit,origin,tokens,password});report.operations_checks=result.checks;report.native_mfa_verified=true;report.encryption_keys_ephemeral=true;}
    if(operations && (process.argv.includes('--spatial-focused') || economics || normative || community)){report.operations_checks=[];report.encryption_keys_ephemeral=true;report.retained_operations_acceptance='unified-operations-live.json';}
    if(spatial)report.spatial=await require('./property-spatial-live-scenarios').verifySpatial({request,db});
    if(economics||normative||community)report.economics=await require('./economic-live-scenarios').verifyEconomics({request,db});
    if(normative||community)report.normative=await require('./normative-live-scenarios').verifyNormative({request,db});
    if(community)report.community=await require('./community-live-scenarios').verifyCommunity({request,db,mongo});
    if (!process.argv.includes('--skip-browser')) {
      const { runPropertyBrowser } = await import('../frontend/scripts/horizontal-property-browser.mjs');
      report.browser = await runPropertyBrowser({ origin, token: tokens[1], user, reportDirectory: path.join(root, 'docs/evidence'), operations, spatial, economics, normative, community, password, downgrade: () => db.collection('identity_memberships').updateOne({ organization_id: 10, user_id: 1 }, { $set: { role: 'viewer' } }) });
      pass('built_browser_journey_persists_real_atlas_entities');
    }
    const audit = await require('../backend/services/mongoAudit.service').createMongoAuditService(mongo).verifyAuditChain(10); assert.equal(audit.valid, true); report.audit_chain_valid = true;
    report.retained_before_cleanup = { assets: await db.collection('locations').countDocuments({ organization_id: 10 }), audit_events: await db.collection('soi_audit_events').countDocuments({ organization_id: 10 }) };
    pass('canonical_audit_chain_valid_after_http_and_browser_mutations'); report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.failure = { name: error.name, code: error.code || error.statusCode || null, message: error.name === 'AssertionError' ? 'Acceptance assertion failed; inspect private diagnostics' : 'PH integration could not complete' }; fs.writeFileSync(path.join(root, '.vercel/ph-integration-failure-private.json'), JSON.stringify({ name: error.name, message: error.message, stack: error.stack }), { mode: 0o600 }); process.exitCode = 1; }
  finally {
    server?.closeAllConnections(); server?.close();
    try { if (owns) { const marker = await db.collection('soi_schema_versions').findOne({ _id: 'ph-ownership', run_id: runId }); assert(marker); assert.match(db.databaseName, /^backstage_ph_[a-f0-9]{8}$/); assert.notEqual(db.databaseName, original); await db.dropDatabase(); report.owned_temporary_database_removed = (await db.listCollections({}, { nameOnly: true }).toArray()).length === 0; assert(report.owned_temporary_database_removed); } }
    catch { report.cleanup = 'failed_ownership_check_or_database_removal'; report.status = 'failed'; process.exitCode = 1; }
    await mongo.closeMongoConnection(); report.completed_at = new Date().toISOString();
    const file = path.join(root, `docs/evidence/${community?'community-live':normative?'normative-intelligence-live':economics?'economic-intelligence-live':spatial?'spatial-context-live':operations?'unified-operations-live':'horizontal-property-live'}.json`); if (fs.existsSync(file)) fs.copyFileSync(file, file.replace('.json', `-${Date.now()}.json`)); fs.writeFileSync(file, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  }
}
if (require.main === module) run().catch(error => { console.error(JSON.stringify({ name: error.name, failed: true, action: 'PH integration preflight' })); process.exitCode = 1; });
module.exports = { run };
