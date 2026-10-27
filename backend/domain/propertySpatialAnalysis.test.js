const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { setup } = require('./helpers/computationalFixture');
const { createHebraCipher } = require('../services/hebraCipher.service');
const { createHorizontalPropertyService } = require('../services/horizontalProperty.service');
const { createPropertyOperationsService } = require('../services/propertyOperations.service');
const { createPropertySpatialAnalysisService } = require('../services/propertySpatialAnalysis.service');
const { createMongoAuditService } = require('../services/mongoAudit.service');
const D = require('./propertySpatialAnalysis');
const key = () => crypto.randomUUID();
async function fixture() {
  const s = setup(), ph = createHorizontalPropertyService(s.infra);
  const cipher = createHebraCipher({ HEBRA_ACTIVE_KEY_ID: 'synthetic', HEBRA_ENCRYPTION_KEYS: JSON.stringify({ synthetic: crypto.randomBytes(32).toString('base64') }) });
  const ops = createPropertyOperationsService({ infrastructure: s.infra, cipher, now: s.now });
  const root = (await ph.create(s.owner, { kind: 'coproperty', name: 'Synthetic root', source_name: 'Synthetic geometry', geometry: { type: 'Point', coordinates: [-74, 4] } }, key())).data;
  const units = [];
  for (let i = 0; i < 5; i++) units.push((await ph.create(s.owner, { kind: 'private_unit', name: `Synthetic unit ${i}`, parent_id: root.location_id, source_name: 'Synthetic geometry', ...(i < 4 ? { geometry: { type: 'Point', coordinates: [-74 + i * .01, 4] } } : {}) }, key())).data);
  const pqrs = (i, actor = s.owner) => ops.create(actor, units[i].location_id, 'pqrs', { title: 'Synthetic private title', category: 'petition', description: 'Do not leak this body', source_name: 'Synthetic fixture' }, key());
  return { ...s, cipher, root, units, ops, ph, pqrs };
}
// A test double verifies the service contract; scientific results are exercised by the live Python acceptance.
function runner(payload) { return Promise.resolve({ version: 'bsie-1.1.0', operation: payload.operation, duration_ms: Math.random(), result: { sum: payload.data?.features.reduce((n, f) => n + f.properties.value, 0) || 0 }, runtime_versions: { test_double: true } }); }
const service = (s, execute = runner) => createPropertySpatialAnalysisService({ infrastructure: s.infra, cipher: s.cipher, operations: s.ops, runner: execute, now: s.now });

test('context parameters reject untrusted data, mixed monetary units and invalid temporal hypotheses', () => {
  assert.throws(() => D.parameters({ data: {} }), { statusCode: 400 });
  assert.throws(() => D.parameters({ metric: 'outstanding_minor' }), { statusCode: 400 });
  assert.throws(() => D.parameters({ method: 'temporal', metric: 'open_pqrs_count', periods: [] }), { statusCode: 400 });
  assert.throws(() => D.parameters({ method: 'kde', density: { bandwidth_m: -1 } }), { statusCode: 400 });
  assert.throws(() => D.parameters({ seed: NaN }), { statusCode: 400 });
  assert.equal(D.parameters({ weights: { method: 'queen' } }).weights.transform, 'row');
  assert.deepEqual(D.parameters(D.parameters({})), D.parameters({}));
});
test('captured PH dataset counts recorded zeros and excludes unlocated units without inheriting parent coordinates', async () => {
  const s = await fixture(); await s.pqrs(0); await s.pqrs(0); await s.pqrs(4);
  const snapshot = await s.ops.spatialSnapshot(s.owner, s.root.location_id, D.parameters({}));
  assert.deepEqual(snapshot.data.features.map(f => f.properties.value), [2, 0, 0, 0]);
  assert.deepEqual(snapshot.provenance.coverage.excluded_unlocated, [s.units[4].location_id]);
  assert(!JSON.stringify(snapshot).includes('Do not leak this body'));
  await assert.rejects(s.ops.spatialSnapshot(s.viewer, s.root.location_id, D.parameters({})), { statusCode: 403 });
  await assert.rejects(s.ops.spatialSnapshot(s.other, s.root.location_id, D.parameters({})), { statusCode: 404 });
});
test('spatial financial projection verifies ciphertext and preserves payments, currencies and exact minor units', async () => {
  const s = await fixture(), issued_at = new Date(s.now() - 20000).toISOString(), due_at = new Date(s.now() - 10000).toISOString();
  const charge = async currency => (await s.ops.create(s.owner, s.units[0].location_id, 'charge', { title: 'Fee', amount_minor: 10001, currency, scale: 2, issued_at, due_at, source_name: 'Synthetic' }, key())).data;
  const cop = await charge('COP'); await charge('USD');
  await s.ops.create(s.owner, s.units[0].location_id, 'payment', { charge_id: cop.record_id, amount_minor: 6000, reference: 'Private synthetic receipt', source_name: 'Synthetic' }, key());
  const params = D.parameters({ metric: 'overdue_minor', currency: 'COP', scale: 2 });
  const snapshot = await s.ops.spatialSnapshot(s.owner, s.root.location_id, params);
  assert.deepEqual(snapshot.data.features.map(f => f.properties.value), [4001, 0, 0, 0]);
  const row = s.f.data().operational_events.find(r => r.ph?.record_id === cop.record_id); row.ph.public.currency = 'USD';
  await assert.rejects(s.ops.spatialSnapshot(s.owner, s.root.location_id, params), { statusCode: 409 });
});
test('analysis snapshots and results are encrypted, replay is scoped and evidence can reproduce without changing history', async () => {
  const s = await fixture(); await s.pqrs(0); const engine = service(s), command = key();
  const first = await engine.run(s.owner, s.root.location_id, {}, command);
  assert.equal(first.data.manifest.multiple_testing, null);
  const replay = await engine.run(s.owner, s.root.location_id, {}, command);
  assert.equal(replay.created, false); assert.equal(replay.data.analysis_id, first.data.analysis_id);
  assert(!JSON.stringify(s.f.data().operational_events.filter(r => r.kind === 'territorial.analysis')).includes('geometry'));
  await assert.rejects(engine.run(s.owner, s.root.location_id, { seed: 1 }, command), { statusCode: 409 });
  await assert.rejects(engine.get(s.viewer, s.root.location_id, first.data.analysis_id), { statusCode: 403 });
  await assert.rejects(engine.get(s.other, s.root.location_id, first.data.analysis_id), { statusCode: 404 });
  await s.pqrs(1);
  const check = await engine.reproduce(s.owner, s.root.location_id, first.data.analysis_id); assert.equal(check.verified, true);
  const fresh = await engine.run(s.owner, s.root.location_id, first.data.parameters, key()); assert.notEqual(fresh.data.analysis_id, first.data.analysis_id); assert.equal(fresh.data.result.result.sum, 2);
  assert.equal((await engine.get(s.owner, s.root.location_id, first.data.analysis_id)).data.result.result.sum, 1);
  assert.equal((await createMongoAuditService(s.infra).verifyAuditChain(10)).valid, true);
});
test('territorial evidence authenticates its organization/object binding and refuses publication after role revocation', async () => {
  const s = await fixture(), engine = service(s), saved = await engine.run(s.owner, s.root.location_id, {}, key());
  const row = s.f.data().operational_events.find(r => r.operational_event_id === saved.data.analysis_id); row.territorial.location_id = s.units[0].location_id;
  await assert.rejects(engine.get(s.owner, s.units[0].location_id, saved.data.analysis_id), { statusCode: 409 });
  const revokeDuringCalculation = service(s, async payload => { s.f.data().identity_memberships.find(m => m.organization_id === 10 && m.user_id === 1).role = 'viewer'; return runner(payload); });
  await assert.rejects(revokeDuringCalculation.run(s.owner, s.root.location_id, {}, key()), { statusCode: 403 });
  assert.equal(s.f.data().operational_events.filter(r => r.kind === 'territorial.analysis').length, 1);
});
test('temporal datasets use verified canonical creation times and reject altered audit rows', async () => {
  const s = await fixture(); await s.pqrs(0);
  // Audit creation uses its own server clock. Build boundaries around that actual audited timestamp.
  const event = s.f.data().soi_audit_events.find(e => e.action === 'ph.operation.created');
  const middle = new Date(new Date(event.created_at).getTime() + 1000).toISOString();
  const start = new Date(new Date(event.created_at).getTime() - 1000).toISOString(), end = new Date(new Date(event.created_at).getTime() + 2000).toISOString(); s.advance(10000);
  const params = D.parameters({ method: 'temporal', periods: [{ start, end: middle }, { start: middle, end }] });
  const snapshot = await s.ops.spatialSnapshot(s.owner, s.root.location_id, params);
  assert.deepEqual(snapshot.periods.map(p => p.data.features[0].properties.value), [1, 0]);
  event.created_at = new Date(new Date(event.created_at).getTime() + 10);
  await assert.rejects(s.ops.spatialSnapshot(s.owner, s.root.location_id, params), { statusCode: 409 });
});
test('same-command concurrent results publish a single encrypted event and missing keys fail closed', async () => {
  const s = await fixture(), engine = service(s), command = key();
  const results = await Promise.all([engine.run(s.owner, s.root.location_id, {}, command), engine.run(s.owner, s.root.location_id, {}, command)]);
  assert.deepEqual(results.map(r => r.created).sort(), [false, true]);
  assert.equal(s.f.data().operational_events.filter(r => r.kind === 'territorial.analysis').length, 1);
  const closed = createPropertySpatialAnalysisService({ infrastructure: s.infra, operations: s.ops, cipher: createHebraCipher({}), runner });
  await assert.rejects(closed.run(s.owner, s.root.location_id, {}, key()), { statusCode: 503 });
});

test('HTTP analysis respects current role/tenant and generic alert APIs cannot read or mutate its private evidence', async t => {
  process.env.JWT_SECRET ||= 'isolated-spatial-context-http-test-secret';
  const s = await fixture(), engine = service(s), identity = require('../services/mongoIdentity.service').createMongoIdentityService(s.infra);
  const { createToken } = require('../auth');
  const express = require('express'), app = express(); app.use(express.json());
  app.use('/assets', require('../routes/assets.routes').createAssetsRouter({}, { getUserMemberships: identity.getUserMemberships, resolveMembership: require('../services/organization.service').resolveMembership }, s.ph, s.ops, engine));
  app.use(require('../middleware/errorHandler'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/assets/layers/horizontal-property/${s.root.location_id}/analysis`;
  const request = async (user_id, body) => fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${createToken({ user_id, organization_id: user_id === 5 ? 20 : 10, role: 'admin' })}`, 'Content-Type': 'application/json', 'Idempotency-Key': key() }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request(4, {})).status, 403); assert.equal((await request(5, {})).status, 404);
  const created = await request(1, {}); assert.equal(created.status, 201); const id = (await created.json()).data.analysis_id;
  const infra = require('../infrastructure/platformMongo'); t.mock.method(infra, 'getMongoDatabase', s.infra.getMongoDatabase);
  const repo = require('../repositories/operationalEvents.repository');
  assert.deepEqual(await repo.listEvents({ organizationId: 10 }), []);
  assert.equal(await repo.acknowledgeEvent({ eventId: id, organizationId: 10, userId: 4 }), null);
  assert.equal(await repo.resolveEvent({ eventId: id, organizationId: 10, userId: 4 }), null);
  assert.equal(s.f.data().operational_events.find(r => r.operational_event_id === id).acknowledged_at, undefined);
  s.f.data().identity_memberships.find(m => m.organization_id === 10 && m.user_id === 1).role = 'viewer';
  assert.equal((await request(1)).status, 403);
});
