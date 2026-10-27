const test = require('node:test'), assert = require('node:assert/strict');
process.env.MONGODB_URI = ''; process.env.JWT_SECRET = 'intelligence-isolated-test-key';
const { fixture } = require('./helpers/soiMongoMemoryFixture');
const { createComparisonService } = require('../services/comparisons.service');
const { canonicalJson, hash } = require('../services/intelligenceContract.service');
const engine = import('../../shared/comparison.mjs');
const context = { organizationId: 7, userId: 1, role: 'analyst' };
const input = () => ({ project_name: 'Exact budget fixture', candidates: [{ id: 'a', name: 'A', lat: 0, lng: 0 }, { id: 'b', name: 'B', lat: 1, lng: 1 }, { id: 'c', name: 'C', lat: 2, lng: 2 }], criteria: [{ id: 'cost', name: 'Cost', definition: 'SIMULATED budget', unit: 'COP', source: 'Independent fixture', weight: '1', direction: 'cost', normalization: 'minmax', missing: 'block' }], observations: { a: { cost: { value: '9007199254740992.01', data_type: 'SIMULATED' } }, b: { cost: { value: '9007199254740992.02', data_type: 'SIMULATED' } }, c: { cost: { value: '9007199254740992.03', data_type: 'SIMULATED' } } } });
function setup() { const f = fixture(); const infra = { getMongoDatabase: async () => f.options.database, withMongoTransaction: f.options.transaction, nextId: f.options.nextId, cleanDocument: row => row }; return { f, infra, service: createComparisonService(infra) }; }

test('known monetary cents beyond binary integer precision remain distinct and produce 100/50/0', async () => {
  const { evaluateComparison } = await engine, result = evaluateComparison(input());
  assert.equal(result.status, 'ready'); assert.deepEqual(result.ranking.map(r => r.score), [100, 50, 0]);
  assert.equal(result.ranking[0].breakdown[0].value, '9007199254740992.01');
  const data = input(); data.observations.a.cost.value = Number(data.observations.a.cost.value); assert.equal(evaluateComparison(data).status, 'invalid');
});
test('decimal parser rejects silent coercion, excessive precision, nonfinite values and ambiguous units', async () => {
  const { evaluateComparison } = await engine;
  for (const value of [true, {}, [], Infinity, NaN, '1,20', '0x10', '1e39', '1e-19', '12345678901234567890123456789012345']) { const data = input(); data.observations.a.cost.value = value; assert.equal(evaluateComparison(data).status, 'invalid', String(value)); }
  const data = input(); data.observations.a.cost.unit = 'USD'; assert.equal(evaluateComparison(data).status, 'invalid');
});
test('exact ratios match independent weighted case and preserve affine invariance', async () => {
  const { evaluateComparison } = await engine;
  const base = input(); base.observations = { a: { cost: { value: '0.1' } }, b: { cost: { value: '0.2' } }, c: { cost: { value: '0.3' } } };
  base.criteria.push({ ...base.criteria[0], id: 'quality', unit: 'points', weight: '3', direction: 'benefit' });
  [0, 50, 100].forEach((v, i) => { base.observations[['a', 'b', 'c'][i]].quality = { value: String(v) }; });
  assert.deepEqual(evaluateComparison(base).ranking.map(r => [r.id, r.score]), [['c', 75], ['b', 50], ['a', 25]]);
  for (let k = 1; k <= 30; k++) {
    const data = structuredClone(base); ['a', 'b', 'c'].forEach((id, i) => { data.observations[id].cost.value = String(1000 + k * (i + 1)); });
    assert.deepEqual(evaluateComparison(data).ranking.map(r => [r.id, r.score]), [['c', 75], ['b', 50], ['a', 25]]);
  }
});
test('restrictions compare exact cents, missing zero-weight data stays inactive and ties are explicit', async () => {
  const { evaluateComparison } = await engine, data = input(); data.criteria[0].max = '9007199254740992.02';
  let result = evaluateComparison(data); assert.deepEqual(result.excluded.map(r => r.id), ['c']); assert.deepEqual(result.ranking.map(r => r.score), [100, 0]);
  data.criteria.push({ ...data.criteria[0], id: 'unused', weight: '0' }); assert.equal(evaluateComparison(data).status, 'ready');
  delete data.criteria[0].max; ['a', 'b', 'c'].forEach(id => { data.observations[id].cost.value = '0.30'; }); result = evaluateComparison(data);
  assert.deepEqual(result.winner_ids, ['a', 'b', 'c']); assert(result.ranking.every(r => r.score === 50));
});
test('rounding is explicit and the total is rounded after exact aggregation', async () => {
  const { evaluateComparison } = await engine, data = input();
  data.criteria = ['cost', 'q', 'r'].map(id => ({ ...data.criteria[0], id }));
  for (const id of ['a', 'b', 'c']) { data.observations[id].q = { value: data.observations[id].cost.value }; data.observations[id].r = { value: data.observations[id].cost.value }; }
  const result = evaluateComparison(data); assert.equal(result.ranking[0].score, 100); assert.equal(result.numeric_policy.rounding, 'half_away_from_zero');
  assert.equal(result.ranking[0].breakdown[0].contribution, 33.33333333); assert.equal(result.numeric_policy.score_aggregation, 'exact_sum_then_round');
  assert.deepEqual(result.ranking[0].breakdown[0].weight_exact, { numerator: '1', denominator: '3' });
});
test('save stores server-owned contract, exact decimal strings, unit/source and uncertainty without fabricated verification', async () => {
  const { service } = setup(), data = input(); data.analysis = { manifest_sha256: 'forged' }; data.result = { forged: true }; data.organization_id = 88;
  data.observations.a.cost.data_type = 'REAL_VERIFIED';
  const row = await service.save(context, data);
  assert.equal(row.organization_id, 7); assert.equal(row.input.observations.a.cost.data_type, 'UNKNOWN'); assert.equal(row.input.observations.a.cost.unit, 'COP');
  assert.equal(row.analysis.engine.version, row.result.version); assert.equal(row.analysis.uncertainty.confidence_interval, null);
  assert.match(row.analysis.manifest_sha256, /^[a-f0-9]{64}$/); assert.notEqual(row.analysis.manifest_sha256, 'forged');
  const before = structuredClone(row); const verification = await service.verify(context, row.comparison_id);
  assert(verification.verified && verification.input_matches && verification.result_matches && verification.manifest_matches); assert.deepEqual(await service.get(context, row.comparison_id), before);
  const exported = await service.exportSnapshot(context, row.comparison_id); assert.deepEqual(exported.snapshot, before); assert(exported.verification.verified);
});
test('canonical JSON ignores object key order and rejects undefined, NaN and infinity', () => {
  assert.equal(hash({ b: 2, a: { d: 4, c: 3 } }), hash({ a: { c: 3, d: 4 }, b: 2 }));
  for (const v of [undefined, { a: undefined }, [NaN], { x: Infinity }]) assert.throws(() => canonicalJson(v), { statusCode: 400 });
});
test('tampering of input, result, units, engine or manifest fails verification and prevents a new project', async () => {
  for (const mutate of [r => { r.input.observations.a.cost.value = '0'; }, r => { r.result.ranking[0].score = 1; }, r => { r.analysis.quantities[0].unit = 'USD'; }, r => { r.analysis.engine.source_sha256 = 'x'; }, r => { r.analysis.manifest_sha256 = 'x'; }, r => { delete r.analysis; }, r => { r.input = null; }, r => { r.result.ranking[0].score = NaN; }]) {
    const { f, service } = setup(), row = await service.save(context, input()); mutate(f.data().soi_comparisons[0]);
    assert.equal((await service.verify(context, row.comparison_id)).verified, false); await assert.rejects(service.createProject(context, row.comparison_id), { statusCode: 409 }); assert.equal(f.data().analysis_runs?.length || 0, 0);
  }
});
test('legacy snapshots replay with the frozen original engine without adding historical hashes', async () => {
  const { evaluateComparison, LEGACY_VERSION } = await engine, { f, service } = setup(); const data = input();
  const old = { comparison_id: 99, organization_id: 7, project_name: data.project_name, input: { candidates: data.candidates, criteria: data.criteria, observations: data.observations }, result: evaluateComparison(data, { version: LEGACY_VERSION }) };
  f.data().soi_comparisons = [structuredClone(old)]; const before = structuredClone(f.data());
  const report = await service.verify(context, 99); assert.equal(report.status, 'legacy_replayed'); assert.equal(report.historical_integrity, false); assert.deepEqual(f.data(), before);
  const project = await service.createProject(context, 99); assert.equal(project.metadata.analysis_context.version, LEGACY_VERSION); assert.equal(project.metadata.analysis_context.historical_integrity, 'not_recorded');
  const invalid = { ...structuredClone(old), comparison_id: 100, input: { ...old.input, criteria: [] } }; invalid.result = evaluateComparison(invalid.input, { version: LEGACY_VERSION }); f.data().soi_comparisons.push(invalid);
  assert.equal((await service.verify(context, 100)).status, 'invalid_input'); await assert.rejects(service.createProject(context, 100), { statusCode: 409 });
});
test('unknown engine versions are preserved for reading and explicitly refuse replay/project creation', async () => {
  const { f, service } = setup(), row = await service.save(context, input()); f.data().soi_comparisons[0].result.version = 'unavailable-future-engine';
  assert.equal((await service.verify(context, row.comparison_id)).status, 'unsupported_version'); assert.equal((await service.get(context, row.comparison_id)).result.version, 'unavailable-future-engine');
  await assert.rejects(service.createProject(context, row.comparison_id), { statusCode: 409 });
});
test('projects reference immutable snapshot hashes, stay idempotent and cannot cross organizations', async () => {
  const { service, f } = setup(), row = await service.save(context, input()); const project = await service.createProject(context, row.comparison_id);
  assert.equal(project.metadata.analysis_context.manifest_sha256, row.analysis.manifest_sha256);
  assert.equal((await service.createProject(context, row.comparison_id)).analysis_run_id, project.analysis_run_id); assert.equal(f.data().analysis_runs.length, 1);
  await assert.rejects(service.verify({ ...context, organizationId: 8 }, row.comparison_id), { statusCode: 404 }); await assert.rejects(service.exportSnapshot({ ...context, organizationId: 8 }, row.comparison_id), { statusCode: 404 });
});
test('snapshot and audit are rolled back together if contract save cannot commit', async () => {
  const { f, infra } = setup(); const service = createComparisonService({ ...infra, withMongoTransaction: operation => infra.withMongoTransaction(async (db, session) => { await operation(db, session); throw new Error('INJECTED COMMIT FAILURE'); }) });
  await assert.rejects(service.save(context, input()), /INJECTED COMMIT FAILURE/); assert.equal(f.data().soi_comparisons?.length || 0, 0); assert.equal(f.data().soi_audit_events?.length || 0, 0);
});
test('HTTP verification/export apply current role and tenant; read-only viewer may verify but cannot save', async t => {
  const { service } = setup(), row = await service.save(context, input()); const orgs = require('../services/organization.service'); let memberships = [{ organization_id: 7, role: 'viewer' }];
  const express = require('express'), app = express(); app.use(express.json()); app.use('/comparisons', require('../routes/comparisons.routes').createComparisonsRouter(service, { getUserMemberships: async () => memberships, resolveMembership: orgs.resolveMembership })); app.use((e, req, res, next) => res.status(e.statusCode || 500).json({ error: e.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
  const headers = { Authorization: `Bearer ${require('../auth').createToken({ user_id: 1, organization_id: 7, role: 'admin' })}`, 'Content-Type': 'application/json' }; const url = `http://127.0.0.1:${server.address().port}/comparisons/${row.comparison_id}`;
  assert((await (await fetch(url + '/reproducibility', { headers })).json()).data.verified); assert.equal((await fetch(url + '/export', { headers })).status, 200);
  assert.equal((await fetch(url.replace(/\/\d+$/, ''), { method: 'POST', headers, body: JSON.stringify(input()) })).status, 403);
  memberships = []; assert.equal((await fetch(url + '/reproducibility', { headers })).status, 403);
});
