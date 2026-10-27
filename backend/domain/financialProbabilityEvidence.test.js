const test = require('node:test'), assert = require('node:assert/strict');
process.env.MONGODB_URI = ''; process.env.JWT_SECRET = 'financial-probability-isolated-key';
const evidence = require('../services/analyticsEvidence.service');
const service = require('../services/analytics.service');
const d = require('../infrastructure/atlasDocuments');
const { fixture } = require('./helpers/soiMongoMemoryFixture');
const financial = import('../../shared/financial.v2.mjs');
const metadata = { currency: 'COP', period: 'year', source: 'SIMULATED independent test', data_type: 'SIMULATED', assumptions: ['Explicit equally spaced test cash flows'] };
const monte = () => ({ factors: { b: { mean: 20, stdDev: 3 }, a: { mean: 100, stdDev: 10 } }, factorWeights: { a: 2, b: -1 }, iterations: 10000, seed: 17, unit: 'test-unit', source: 'SIMULATED parameters', data_type: 'SIMULATED' });
async function snapshot(name, raw) { const params = await evidence.canonicalInput(name, raw), result = await evidence.run(name, params); return { algorithm_name: name, algorithm_version: evidence.versionFor(name), status: 'succeeded', params, result, analysis: await evidence.build(name, params, result) }; }

test('financial v2 independently known values, cents above safe integers, DCF and half-away rounding', async () => {
  const { runFinancial: run } = await financial;
  assert.equal(run('financial.npv_irr', { cashFlows: ['-100', '110'], discountRate: '.1' }).npv_decimal, '0.000000');
  assert.equal(run('financial.npv_irr', { cashFlows: ['-9007199254740992.01', '9007199254740992.02'], discountRate: '0' }).npv_decimal, '0.010000');
  assert.equal(run('financial.npv_irr', { cashFlows: ['-0.0000005', '0'], discountRate: '0' }).npv_decimal, '-0.000001');
  const result = run('financial.dcf', { projectedCashFlows: ['100'], discountRate: '.1', terminalValue: '1100' });
  assert.equal(result.presentValueOfTerminal_decimal, '1000.000000'); assert.equal(result.totalValue_decimal, '1090.909091');
  assert.equal(run('financial.cap_rate', { netOperatingIncome: '50000', propertyValue: '1000000' }).capRate, 5);
  assert.deepEqual(run('financial.payback', { cashFlows: ['-1000', '400', '400', '400'], discountRate: '0' }), { simple: 2.5, discounted: 2.5 });
  assert.equal(run('financial.payback', { cashFlows: ['-1000', '100'], discountRate: '0' }).simple, null);
  assert.equal(run('financial.payback', { cashFlows: ['0', '100'] }).simple, 0);
});
test('IRR reports root convergence, negative return and ambiguity instead of fabricating a root', async () => {
  const { runFinancial: run } = await financial, irr = flows => run('financial.npv_irr', { cashFlows: flows, discountRate: '0' }).irr;
  assert.equal(irr(['-100', '110']).irr, .1); assert.equal(irr(['-100', '90']).irr, -.1);
  assert.equal(irr(['100', '110']).reason, 'no_sign_change');
  assert.equal(irr(['-100', '230', '-132']).reason, 'multiple_sign_changes');
  assert.equal(irr(['-100', '2000']).reason, 'root_outside_bounds');
});
test('strict financial inputs reject silent coercion, invalid rates, unit-period mismatch and excessive horizon', async () => {
  const { runFinancial: run } = await financial;
  for (const value of [true, null, Infinity, NaN, '', '1,5', Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(evidence.canonicalInput('financial.npv_irr', { cashFlows: [-100, value], discountRate: .1 }));
  for (const discountRate of ['-1', '-.999', '11']) assert.throws(() => run('financial.npv_irr', { cashFlows: ['-100', '110'], discountRate }));
  for (const extra of [{ currency: 'COP', unit: 'USD' }, { period: 'year', rate_period: 'month' }]) await assert.rejects(evidence.canonicalInput('financial.npv_irr', { cashFlows: [-100, 110], discountRate: .1, ...extra }), { statusCode: 400 });
  assert.throws(() => run('financial.payback', { cashFlows: Array(122).fill('1') }));
});
test('new analysis is server-owned, canonical and repeatable; every manifest dimension is checked without writes', async () => {
  const row = await snapshot('financial.npv_irr', { ...metadata, cashFlows: ['-100.00', '110'], discountRate: '.1', analysis: { forged: true }, result: 123 });
  assert.equal(row.params.cashFlows[0], '-100'); assert.equal(row.analysis.uncertainty.confidence_interval, null);
  const before = structuredClone(row); assert((await evidence.verify(row)).verified); assert.deepEqual(row, before);
  for (const mutate of [r => r.params.cashFlows[0] = '-101', r => r.result.npv = 2, r => r.params.currency = 'USD', r => r.analysis.provenance.source = 'forged', r => r.analysis.engine.id = 'other', r => r.analysis.manifest_sha256 = 'x', r => delete r.analysis]) { const changed = structuredClone(row); mutate(changed); assert.equal((await evidence.verify(changed)).verified, false); }
  const changed = structuredClone(row); changed.algorithm_version = 'unknown'; assert.equal((await evidence.verify(changed)).status, 'unsupported_version');
});
test('Monte Carlo records actual defaults/model and is invariant to submitted object key order', async () => {
  const a = await snapshot('risk.monte_carlo', monte()), input = monte();
  input.factors = { a: input.factors.a, b: input.factors.b }; const b = await snapshot('risk.monte_carlo', input);
  assert.deepEqual(a.result, b.result); assert.equal(a.analysis.manifest_sha256, b.analysis.manifest_sha256); assert((await evidence.verify(a)).verified);
  assert(Math.abs(a.result.mean - 180) < 1); assert(Math.abs(a.result.stdDev - Math.sqrt(409)) < 1);
  const c = await snapshot('risk.monte_carlo', { ...input, seed: 18 }); assert.notDeepEqual(a.result, c.result);
  assert.equal(a.analysis.reproducibility.random_seed, 17); assert.equal(a.analysis.uncertainty.confidence_interval, null);
  const defaults = await evidence.canonicalInput('risk.monte_carlo', { factors: { x: { mean: 5, stdDev: 0 } } });
  assert.equal(defaults.seed, 42); assert.equal(defaults.iterations, 10000); assert.equal(defaults.factorWeights.x, 1);
  const zero = await evidence.run('risk.monte_carlo', defaults); for (const k of ['p5', 'p50', 'p95', 'mean', 'min', 'max']) assert.equal(zero[k], 5);
});
test('Monte Carlo rejects malformed distributions, unsafe seeds, hostile factor names and unbounded requests', async () => {
  for (const update of [{ seed: 1.2 }, { seed: -1 }, { seed: 4294967296 }, { seed: '17' }, { iterations: 99 }, { iterations: 200001 }, { factors: { x: { mean: null, stdDev: 1 } } }, { factors: { x: { mean: Infinity, stdDev: 1 } } }, { factors: { constructor: { mean: 1, stdDev: 0 } } }, { factors: { x: { mean: 1, stdDev: -1 } } }, { factorWeights: { missing: 1 } }, { model: 'arbitrary_code' }]) await assert.rejects(evidence.canonicalInput('risk.monte_carlo', { ...monte(), ...update }));
});
test('legacy financial and seeded simulation preserve their original results and do not backfill integrity', async () => {
  const legacy = require('../domain/analytics/financial'), risk = require('../domain/analytics/risk');
  const params = { cashFlows: [-100, 110], discountRate: .1 }, row = { algorithm_name: 'financial.npv_irr', algorithm_version: '1.0.0', status: 'succeeded', params, result: { npv: legacy.netPresentValue(params.cashFlows, .1), irr: legacy.internalRateOfReturn(params.cashFlows) } };
  const before = structuredClone(row), report = await evidence.verify(row); assert.equal(report.status, 'legacy_replayed'); assert.equal(report.historical_integrity, false); assert.deepEqual(row, before);
  const p = monte(), keys = Object.keys(p.factors); const r = { algorithm_name: 'risk.monte_carlo', algorithm_version: '1.0.0', status: 'succeeded', params: p, result: risk.monteCarloSimulate({ ...p, combine: s => keys.reduce((v, k) => v + s[k] * p.factorWeights[k], 0) }) };
  assert.equal((await evidence.verify(r)).status, 'legacy_replayed');
});
function setup(t, failCommit = false) {
  const f = fixture({ analysis_runs: [{ organization_id: 7, analysis_run_id: 9, metadata: {} }] });
  const originals = Object.fromEntries(['getMongoDatabase', 'withMongoTransaction', 'nextId'].map(k => [k, d[k]]));
  d.getMongoDatabase = async () => f.options.database; d.nextId = f.options.nextId;
  d.withMongoTransaction = work => f.options.transaction(async (...args) => { const result = await work(...args); if (failCommit) throw Error('INJECTED COMMIT FAILURE'); return result; });
  // atlasDocuments closes over its own adapters; redirect only its collection operations for isolated tests.
  for (const k of ['insert', 'one', 'find', 'update']) originals[k] = d[k];
  d.one = async (name, q) => f.options.database.collection(name).findOne(q);
  d.find = async (name, q, sort, limit) => f.options.database.collection(name).find(q).sort(sort).limit(limit).toArray();
  d.insert = async (name, id, data) => { const row = { ...data, [id]: await d.nextId(), created_at: new Date() }; await f.options.database.collection(name).insertOne(row); return row; };
  d.update = async (name, q, data) => f.options.database.collection(name).findOneAndUpdate(q, { $set: data });
  t.after(() => Object.assign(d, originals)); return f;
}
const ctx = { sessionUser: { user_id: 1 }, organization: { organization_id: 7 }, context: { module: 'isolated_test' } };
test('job, project reference and audit commit together; tenant and client forged metadata cannot override authority', async t => {
  const f = setup(t), result = await service.executeAlgorithm('financial.npv_irr', { ...metadata, cashFlows: ['-100', '110'], discountRate: '.1', analysis_run_id: 9, organization_id: 99, analysis: { forged: true } }, ctx);
  const saved = await service.getJob(result.analytics_job_id, 7); assert.equal(saved.organization_id, 7); assert.equal(saved.requested_by_user_id, 1); assert.equal(saved.params.analysis, undefined);
  assert((await service.verifyJob(saved.analytics_job_id, 7)).verified);
  assert.equal(f.data().analysis_runs[0].metadata.analytics_evidence[0].manifest_sha256, saved.analysis.manifest_sha256);
  assert(f.data().soi_audit_events.some(e => e.action === 'analysis.saved' && e.resource_type === 'analytics_jobs'));
  assert.equal((await service.listJobs(7, { projectId: 9 })).length, 1);
  assert.equal((await service.exportJob(saved.analytics_job_id, 7)).format, 'backstage-analytics-export-1');
  await assert.rejects(service.getJob(saved.analytics_job_id, 8), { statusCode: 404 }); await assert.rejects(service.executeAlgorithm('financial.npv_irr', { ...metadata, cashFlows: [-100, 110], discountRate: .1, analysis_run_id: 9 }, { ...ctx, organization: { organization_id: 8 } }), { statusCode: 404 });
});
test('failure after real transaction operations rolls back result, project reference and audit together', async t => {
  const f = setup(t, true);
  await assert.rejects(service.executeAlgorithm('financial.npv_irr', { cashFlows: [-100, 110], discountRate: .1, analysis_run_id: 9 }, ctx), /INJECTED COMMIT FAILURE/);
  assert.equal(f.data().analytics_jobs[0].status, 'failed'); assert.equal(f.data().analytics_jobs[0].result, undefined); assert.equal(f.data().analysis_runs[0].metadata.analytics_evidence, undefined); assert.equal(f.data().soi_audit_events?.length || 0, 0); assert.equal(f.rolledBack(), 1);
});
test('HTTP replay/export use current membership, allow viewer reading and deny writes, revoked and foreign tenants', async t => {
  setup(t);
  const row = await service.executeAlgorithm('financial.npv_irr', { cashFlows: [-100, 110], discountRate: .1 }, ctx);
  const orgs = require('../services/organization.service'), original = orgs.getUserMemberships;
  let memberships = [{ organization_id: 7, role: 'viewer' }, { organization_id: 8, role: 'viewer' }];
  orgs.getUserMemberships = async () => memberships; t.after(() => { orgs.getUserMemberships = original; });
  const express = require('express'), app = express(); app.use(express.json()); app.use('/analytics', require('../routes/analytics.routes')); app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
  const headers = { Authorization: `Bearer ${require('../auth').createToken({ user_id: 1, organization_id: 7, role: 'admin' })}`, 'Content-Type': 'application/json' }, url = `http://127.0.0.1:${server.address().port}/analytics`;
  assert((await (await fetch(`${url}/jobs/${row.analytics_job_id}/reproducibility`, { headers })).json()).verified);
  assert.equal((await fetch(`${url}/jobs/${row.analytics_job_id}/export`, { headers })).status, 200);
  assert.equal((await fetch(`${url}/jobs/${row.analytics_job_id}/export`, { headers: { ...headers, 'X-Organization-Id': '8' } })).status, 404);
  assert.equal((await fetch(`${url}/financial`, { headers, method: 'POST', body: JSON.stringify({ cashFlows: [-100, 110], discountRate: .1 }) })).status, 403);
  memberships = []; assert.equal((await fetch(`${url}/jobs/${row.analytics_job_id}/reproducibility`, { headers })).status, 403);
});
