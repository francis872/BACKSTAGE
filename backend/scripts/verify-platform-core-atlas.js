// Opt-in integration against the explicitly authorized Atlas test connection.
// Default: print the exact plan, without connecting or writing to MongoDB.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { INDEXES } = require('../infrastructure/mongoIndexRegistry');
const COLLECTIONS = Object.freeze(['identity_users', 'identity_organizations', 'identity_memberships', 'identity_invitations', 'locations', 'soi_comparisons', 'analysis_runs', 'soi_audit_events', 'soi_audit_heads']);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function ownedFilters(ownership) {
  assert.match(ownership.run_id, /^atlas-core-\d{14}-[a-f0-9]{12}$/);
  for (const values of [ownership.organization_ids, ownership.user_ids]) {
    assert(Array.isArray(values) && values.length > 0 && values.length <= 10);
    assert(values.every(value => Number.isSafeInteger(value) && value > 0));
  }
  return Object.fromEntries(COLLECTIONS.map(name => [name, name === 'identity_users' ? { user_id: { $in: ownership.user_ids } }
    : name === 'soi_audit_heads' ? { _id: { $in: ownership.organization_ids.map(id => `organization:${id}`) } }
      : { organization_id: { $in: ownership.organization_ids } }]));
}
function plan() {
  return { mode: 'plan_only', target: 'configured_authorized_atlas_test_database', indexes: { identity_invitations: INDEXES.identity_invitations },
    test_records: 'two newly registered, run-marked organizations/accounts; simulated asset/comparison/project',
    checks: ['separate_connection_persistence', 'concurrent_acceptance', 'concurrent_last_admin_protection', 'HTTP_and_WebSocket_revocation', 'atomic_rollback_after_real_writes', 'audit_chain', 'private_scoped_BSON_backup_and_restore'],
    cleanup: 'only run-owned test documents and newly created restore collections; shared counters are never decremented',
    operational_records: 'untouched', deployment: false };
}
async function execute({ preflightOnly = false } = {}) {
  const mongo = require('../infrastructure/platformMongo'); // Loads the existing private environment, never prints it.
  const { MongoClient, BSON } = require('mongodb');
  const { configureMongoDns } = require('../infrastructure/mongoDns');
  const { createMongoIdentityService } = require('../services/mongoIdentity.service');
  const { createMongoAuditService } = require('../services/mongoAudit.service');
  const runId = `atlas-core-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomBytes(6).toString('hex')}`;
  const marker = `BACKSTAGE TEST ${runId}`;
  const root = path.resolve(__dirname, '../..');
  const privateDirectory = path.join(root, '.vercel', runId);
  const ownership = { run_id: runId, organization_ids: [], user_ids: [], organizations: {}, users: {} };
  const report = { run_id: runId, started_at: new Date().toISOString(), mode: 'live_atlas_test_integration', authorization: 'explicit_user_approval_after_test_environment_confirmation', checks: [], indexes_applied: [], operational_documents_touched: false, shared_counters_advanced: false, deployed: false };
  let db, reader, readerDb, server, sockets = [], stage = 'preflight';
  const restoreCollections = [];
  let backup;
  const progress = value => console.log(JSON.stringify({ stage: value, run_id: runId }));
  const record = (name, detail = {}) => { report.checks.push({ name, passed: true, ...detail }); progress(name); };
  const own = session => {
    ownership.organization_ids.push(session.user.organization_id); ownership.user_ids.push(session.user.user_id);
    ownership.organizations[session.user.organization_id] = session.organization.name;
    ownership.users[session.user.user_id] = session.user.email;
    fs.writeFileSync(path.join(privateDirectory, 'ownership.json'), JSON.stringify(ownership, null, 2), { mode: 0o600 });
    report.shared_counters_advanced = true;
  };
  async function assertOwnership() {
    const filters = ownedFilters(ownership);
    const organizations = await db.collection('identity_organizations').find(filters.identity_organizations).toArray();
    const users = await db.collection('identity_users').find(filters.identity_users).toArray();
    assert.equal(organizations.length, ownership.organization_ids.length, 'Ownership organization count');
    assert.equal(users.length, ownership.user_ids.length, 'Ownership user count');
    for (const row of organizations) assert(row.name === ownership.organizations[row.organization_id] && row.name.startsWith(marker));
    for (const row of users) assert(row.email === ownership.users[row.user_id] && row.email.startsWith(runId) && row.email.endsWith('@example.invalid') && row.name.startsWith(marker));
    const memberships = await db.collection('identity_memberships').find({ user_id: { $in: ownership.user_ids } }).toArray();
    assert(memberships.every(row => ownership.organization_ids.includes(row.organization_id)), 'Unexpected external membership: cleanup refused');
    return filters;
  }
  async function readerTransaction(operation) {
    const session = reader.startSession();
    try { return await session.withTransaction(() => operation(readerDb, session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }); }
    finally { await session.endSession(); }
  }
  const normalized = value => {
    if (Array.isArray(value)) return value.map(normalized);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key])]));
  };
  const documentsHash = documents => digest(JSON.stringify(normalized(BSON.EJSON.serialize([...documents].sort((a, b) => String(a._id).localeCompare(String(b._id))), { relaxed: false }))));
  try {
    db = await mongo.getMongoDatabase();
    const hello = await db.command({ hello: 1 });
    assert(hello.setName || hello.msg === 'isdbgrid', 'Transactions require Atlas replica set');
    assert(process.env.JWT_SECRET, 'Access setup required');
    report.target_fingerprint = digest(`${process.env.MONGODB_URI}\n${db.databaseName}`);
    if (!preflightOnly) {
      const inspected = JSON.parse(fs.readFileSync(path.join(root, 'docs/backstage-2.0/evidence/atlas-core-preflight.json'), 'utf8'));
      assert.equal(report.target_fingerprint, inspected.target_fingerprint, 'Connection changed after read-only preflight');
      assert.equal(inspected.status, 'preflight_passed_no_writes', 'Successful preflight required');
    }
    for (const [collection, key] of [['identity_users', 'user_id'], ['identity_organizations', 'organization_id'], ['soi_audit_events', 'audit_log_id']]) {
      const indexes = await db.collection(collection).listIndexes().toArray();
      assert(indexes.some(index => index.unique && index.key[key] === 1 && Object.keys(index.key).length === 1), `Required unique index: ${collection}`);
      const top = await db.collection(collection).find({}).sort({ [key]: -1 }).limit(1).next();
      const counter = await db.collection('soi_counters').findOne({ _id: collection });
      assert(!top || Number.isSafeInteger(counter?.value) && counter.value >= top[key], `Counter readiness: ${collection}`);
    }
    assert((await db.collection('identity_memberships').listIndexes().toArray()).some(index => index.unique && index.key.organization_id === 1 && index.key.user_id === 1 && Object.keys(index.key).length === 2), 'Membership unique index required');
    const invitationExists = (await db.listCollections({ name: 'identity_invitations' }, { nameOnly: true }).toArray()).length > 0;
    report.preflight = { readable: true, transactional_topology: true, required_schema: 2, existing_invitation_collection: invitationExists };
    record('read_only_preflight');
    if (preflightOnly) { report.status = 'preflight_passed_no_writes'; return report; }
    fs.mkdirSync(privateDirectory, { recursive: true });
    stage = 'invitation_indexes';
    if (!invitationExists) await db.createCollection('identity_invitations');
    for (const definition of INDEXES.identity_invitations) {
      const name = await db.collection('identity_invitations').createIndex(definition.key, definition.options);
      report.indexes_applied.push({ name, key: definition.key, unique: Boolean(definition.options.unique) });
    }
    const actual = await db.collection('identity_invitations').listIndexes().toArray();
    for (const expected of INDEXES.identity_invitations) assert(actual.some(index => JSON.stringify(index.key) === JSON.stringify(expected.key) && Boolean(index.unique) === Boolean(expected.options.unique)));
    record('three_invitation_indexes_ready');
    reader = new MongoClient(process.env.MONGODB_URI, { ...configureMongoDns(), appName: 'backstage-authorized-core-validation-reader', maxPoolSize: 5, serverSelectionTimeoutMS: 15000 });
    await reader.connect(); readerDb = reader.db(db.databaseName);
    const readerInfrastructure = { getMongoDatabase: async () => readerDb, withMongoTransaction: readerTransaction, cleanDocument: mongo.cleanDocument };
    const readerIdentity = createMongoIdentityService(readerInfrastructure);
    const readerAudit = createMongoAuditService(readerInfrastructure);
    const express = require('express'), http = require('node:http'), WebSocket = require('ws');
    const app = express(); app.use(express.json({ limit: '1mb' }));
    for (const name of ['auth', 'users', 'assets', 'comparisons', 'analysis', 'auditLogs']) app.use(name === 'auditLogs' ? '/audit-logs' : `/${name}`, require(`../routes/${name}.routes`));
    app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ error: 'Validation request rejected', code: error.statusCode || error.code || error.name }));
    server = http.createServer(app);
    const transport = require('../realtime/wsServer').attachSecurityWebSocketServer(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(url, { token, org, body, method = body ? 'POST' : 'GET', expected = 200 } = {}) {
      const response = await fetch(base + url, { method, signal: AbortSignal.timeout(45000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(org ? { 'X-Organization-Id': String(org) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const value = await response.json();
      if (expected != null) assert.equal(response.status, expected, `HTTP ${method} ${url}: unexpected status`);
      return { status: response.status, value };
    }
    stage = 'register_owned_test_accounts';
    const sessions = [];
    for (const label of ['owner', 'recipient']) {
      const session = (await request('/auth/register', { expected: 201, body: { name: `${marker} ${label}`, organization_name: `${marker} ${label}`, email: `${runId}-${label}@example.invalid`, password: crypto.randomBytes(24).toString('base64url') } })).value;
      own(session); sessions.push(session);
    }
    const [owner, recipient] = sessions, org = owner.user.organization_id, user = owner.user.user_id, memberId = recipient.user.user_id;
    const ownerRequest = (url, options = {}) => request(url, { token: owner.token, org, ...options });
    assert.equal((await readerIdentity.me(user, org)).role, 'admin');
    record('accounts_persist_from_independent_connection');
    stage = 'concurrent_invitation_acceptance';
    const invitation = (await ownerRequest('/users/invitations', { expected: 201, body: { email: recipient.user.email, role: 'admin' } })).value;
    const pending = (await ownerRequest('/users/invitations', { expected: 201, body: { email: recipient.user.email, role: 'admin' } })).value;
    await ownerRequest('/auth/invitations/accept', { body: { token: invitation.token }, expected: 403 });
    const acceptance = await Promise.all([0, 1].map(() => request('/auth/invitations/accept', { token: recipient.token, body: { token: invitation.token, role: 'viewer', organization_id: recipient.user.organization_id }, expected: null })));
    assert.deepEqual(acceptance.map(result => result.status).sort(), [200, 410]);
    const accepted = acceptance.find(result => result.status === 200).value;
    assert.equal(accepted.user.role, 'admin'); assert.equal(accepted.user.organization_id, org);
    assert.equal(await readerDb.collection('identity_memberships').countDocuments({ organization_id: org, user_id: memberId }), 1);
    assert.equal((await readerIdentity.me(memberId, org)).role, 'admin');
    const memberRequest = (url, options = {}) => request(url, { token: accepted.token, org, ...options });
    record('concurrent_acceptance_exactly_one_membership', { statuses: acceptance.map(result => result.status).sort() });
    stage = 'concurrent_last_admin_protection';
    const roleRace = await Promise.all([
      ownerRequest(`/users/${memberId}`, { method: 'PUT', body: { role: 'viewer' }, expected: null }),
      memberRequest(`/users/${user}`, { method: 'PUT', body: { role: 'viewer' }, expected: null }),
    ]);
    assert.equal(roleRace.filter(result => result.status === 200).length, 1);
    assert(roleRace.filter(result => result.status !== 200).every(result => [403, 409].includes(result.status)));
    const administrators = await readerDb.collection('identity_memberships').find({ organization_id: org, role: 'admin' }).toArray();
    assert.equal(administrators.length, 1);
    const restoreAdmin = administrators[0].user_id === user ? ownerRequest : memberRequest;
    const demotedId = administrators[0].user_id === user ? memberId : user;
    await restoreAdmin(`/users/${demotedId}`, { method: 'PUT', body: { role: 'admin' } });
    record('concurrent_role_changes_preserve_active_admin', { statuses: roleRace.map(result => result.status).sort() });
    stage = 'asset_analysis_project';
    const asset = (await ownerRequest('/assets', { expected: 201, body: { name: marker, type: 'equipment', longitude: 0, latitude: 0, metadata: { verification_only: true, validation_run: runId } } })).value.data;
    const input = { project_name: marker, candidates: [{ id: asset.asset_id, name: marker, lat: 0, lng: 0 }, { id: 'custom:validation', name: 'SIMULATED VALIDATION ALTERNATIVE', lat: 1, lng: 1 }], criteria: [{ id: 'cost', name: 'SIMULATED cost', definition: 'Validation fixture only', unit: 'test-unit', source: marker, weight: 1, direction: 'cost', normalization: 'minmax', missing: 'block' }], observations: { [asset.asset_id]: { cost: { value: 1, data_type: 'SIMULATED' } }, 'custom:validation': { cost: { value: 2, data_type: 'SIMULATED' } } } };
    const comparison = (await ownerRequest('/comparisons', { body: input, expected: 201 })).value.data;
    const projects = await Promise.all([0, 1].map(() => ownerRequest(`/comparisons/${comparison.comparison_id}/project`, { body: { territory: { name: marker, coordinates: [0, 0] } } })));
    const project = projects[0].value.data;
    assert.equal(project.analysis_run_id, projects[1].value.data.analysis_run_id);
    assert.equal(await readerDb.collection('analysis_runs').countDocuments({ organization_id: org }), 1);
    assert.equal((await ownerRequest(`/analysis/${project.analysis_run_id}`)).value.metadata.comparison_snapshot_id, comparison.comparison_id);
    await memberRequest(`/assets/${asset.asset_id}`, { org: recipient.user.organization_id, expected: 404 });
    await memberRequest(`/analysis/${project.analysis_run_id}`, { org: recipient.user.organization_id, expected: 404 });
    record('asset_analysis_project_persist_and_retries_are_idempotent');
    stage = 'real_transaction_rollback';
    const before = await readerDb.collection('identity_memberships').findOne({ organization_id: org, user_id: memberId });
    const headBefore = await readerDb.collection('soi_audit_heads').findOne({ _id: `organization:${org}` });
    const failingIdentity = createMongoIdentityService({ ...mongo, withMongoTransaction: operation => mongo.withMongoTransaction(async (database, session) => { await operation(database, session); throw new Error('INTENTIONAL_VALIDATION_ABORT_BEFORE_COMMIT'); }) });
    await assert.rejects(failingIdentity.updateUser(memberId, { role: 'viewer' }, org, user), { statusCode: 503 });
    assert.deepEqual(await readerDb.collection('identity_memberships').findOne({ organization_id: org, user_id: memberId }), before);
    assert.deepEqual(await readerDb.collection('soi_audit_heads').findOne({ _id: `organization:${org}` }), headBefore);
    record('real_writes_and_audit_rolled_back_before_commit');
    stage = 'HTTP_and_WebSocket_revocation';
    async function connect(channel) {
      const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws/${channel}`, { headers: { Authorization: `Bearer ${accepted.token}` } });
      sockets.push(socket); const messages = [];
      socket.on('message', value => messages.push(JSON.parse(value.toString())));
      await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
      return { socket, messages };
    }
    const security = await connect('security'), operations = await connect('operations');
    const until = async condition => { const end = Date.now() + 20000; while (Date.now() < end) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 100)); } assert.fail('Atlas/WebSocket condition timeout'); };
    await ownerRequest(`/users/${memberId}`, { method: 'PUT', body: { role: 'viewer' } });
    await memberRequest('/assets', { body: { name: marker, type: 'equipment' }, expected: 403 });
    await memberRequest('/audit-logs', { expected: 403 });
    await memberRequest('/assets');
    require('../realtime/securityEvents').publishSecurityEvent({ organization_id: org, action: 'validation-after-downgrade' });
    await until(() => security.socket.readyState === WebSocket.CLOSED);
    assert(!security.messages.some(message => message.data?.action === 'validation-after-downgrade'));
    assert.equal(operations.socket.readyState, WebSocket.OPEN);
    await ownerRequest(`/users/${memberId}`, { method: 'DELETE' });
    await memberRequest('/assets', { expected: 403 });
    await request('/auth/invitations/accept', { token: recipient.token, body: { token: pending.token }, expected: 410 });
    require('../realtime/operationalEvents').publishOperationalEvent({ organization_id: org, title: 'validation-after-revocation' });
    await until(() => operations.socket.readyState === WebSocket.CLOSED);
    assert(!operations.messages.some(message => message.data?.title === 'validation-after-revocation'));
    assert.equal((await readerIdentity.me(memberId, recipient.user.organization_id)).role, 'admin');
    await ownerRequest(`/users/${user}`, { method: 'DELETE', expected: 409 });
    record('stale_tokens_and_native_sockets_obey_committed_revocation');
    transport.close(); for (const socket of sockets) socket.terminate(); sockets = [];
    const chain = await readerAudit.verifyAuditChain(org);
    assert(chain.valid && chain.complete);
    const rows = await readerAudit.listAuditLogs({ organizationId: org });
    for (const action of ['invitation.created', 'invitation.accepted', 'member.updated', 'member.revoked', 'asset.created', 'analysis.saved', 'project.created']) assert(rows.some(row => row.action === action));
    assert.equal(rows.filter(row => row.action === 'project.created').length, 1);
    assert(!JSON.stringify(rows).includes(invitation.token));
    record('complete_audit_chain_from_independent_connection', { events: chain.checked });
    stage = 'scoped_backup_restore';
    const filters = await assertOwnership();
    backup = { version: 1, run_id: runId, collections: {} };
    await readerTransaction(async (database, session) => {
      for (const name of COLLECTIONS) backup.collections[name] = { documents: await database.collection(name).find(filters[name], { session }).toArray(), indexes: await database.collection(name).listIndexes().toArray() };
    });
    const bytes = BSON.serialize(backup), archive = path.join(privateDirectory, 'owned-test-records.bson');
    fs.writeFileSync(archive, bytes, { mode: 0o600 });
    const restoredBackup = BSON.deserialize(fs.readFileSync(archive));
    assert.equal(restoredBackup.run_id, runId);
    const restoreMap = {};
    for (const name of COLLECTIONS) {
      const target = `__backstage_restore_${runId.replaceAll('-', '_')}_${name}`;
      assert.equal((await db.listCollections({ name: target }, { nameOnly: true }).toArray()).length, 0, 'Restore destination must be new');
      await db.createCollection(target); restoreCollections.push({ source: name, target }); restoreMap[name] = target;
      for (const index of restoredBackup.collections[name].indexes) {
        if (index.name === '_id_') continue;
        const options = Object.fromEntries(['name', 'unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression', 'collation'].filter(key => index[key] != null).map(key => [key, index[key]]));
        await db.collection(target).createIndex(index.key, options);
      }
      const documents = restoredBackup.collections[name].documents;
      if (documents.length) await db.collection(target).insertMany(documents, { writeConcern: { w: 'majority' } });
      assert.equal(documentsHash(await readerDb.collection(target).find({}).toArray()), documentsHash(backup.collections[name].documents), 'Restored document digest');
    }
    const mappedDb = { collection(name) { assert(restoreMap[name], 'Restored service attempted an unscoped collection'); return readerDb.collection(restoreMap[name]); } };
    const restoredInfra = { ...readerInfrastructure, getMongoDatabase: async () => mappedDb, withMongoTransaction: operation => readerTransaction((database, session) => operation(mappedDb, session)) };
    assert.equal((await createMongoIdentityService(restoredInfra).me(user, org)).role, 'admin');
    await assert.rejects(createMongoIdentityService(restoredInfra).me(memberId, org), { statusCode: 403 });
    assert.equal((await createMongoAuditService(restoredInfra).verifyAuditChain(org)).valid, true);
    report.backup = { scope: 'only_new_owned_test_records_and_their_indexes', path: path.relative(root, archive).replaceAll('\\', '/'), sha256: digest(bytes), collections: COLLECTIONS.length, records: Object.values(backup.collections).reduce((sum, item) => sum + item.documents.length, 0), restored_to_new_temporary_collections: true, digest_verified_from_independent_connection: true, full_database_or_point_in_time_backup_certified: false };
    record('private_BSON_backup_restored_and_services_revalidated');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = { stage, code: error.statusCode || error.code || error.name, assertion: error.name === 'AssertionError' };
    process.exitCode = 1;
  } finally {
    for (const socket of sockets) socket.terminate();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (!preflightOnly && db && ownership.organization_ids.length) {
      try {
        const filters = await assertOwnership();
        for (const item of restoreCollections) {
          assert(item.target.startsWith(`__backstage_restore_${runId.replaceAll('-', '_')}_`));
          assert.equal(documentsHash(await db.collection(item.target).find({}).toArray()), documentsHash(backup.collections[item.source].documents));
          await db.collection(item.target).drop();
        }
        await mongo.withMongoTransaction(async (database, session) => {
          for (const name of COLLECTIONS) await database.collection(name).deleteMany(filters[name], { session });
        });
        for (const name of COLLECTIONS) assert.equal(await db.collection(name).countDocuments(filters[name]), 0);
        report.cleanup = { status: 'passed', only_owned_test_data_removed: true, restored_temporary_collections_removed: restoreCollections.length, shared_counters_preserved: true };
      } catch (error) {
        report.cleanup = { status: 'requires_review', code: error.statusCode || error.code || error.name, ownership_manifest: path.relative(root, path.join(privateDirectory, 'ownership.json')).replaceAll('\\', '/') };
        process.exitCode = 1; report.status = 'failed';
      }
    }
    await reader?.close(); await mongo.closeMongoConnection();
    report.finished_at = new Date().toISOString();
    const evidence = path.join(root, 'docs/backstage-2.0/evidence'); fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, preflightOnly ? 'atlas-core-preflight.json' : 'atlas-core-live.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  }
  return report;
}
if (require.main === module) {
  if (!process.argv.includes('--apply') && !process.argv.includes('--preflight')) console.log(JSON.stringify(plan(), null, 2));
  else if (!process.argv.includes('--test-environment')) { console.error('Explicit --test-environment required.'); process.exitCode = 1; }
  else execute({ preflightOnly: process.argv.includes('--preflight') }).catch(error => { console.error(JSON.stringify({ status: 'failed', code: error.code || error.name })); process.exitCode = 1; });
}
module.exports = { ownedFilters, plan, COLLECTIONS };
