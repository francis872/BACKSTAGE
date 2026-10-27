const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { fixture } = require('./helpers/soiMongoMemoryFixture');
const { createGeographyService } = require('../services/geography.service');
const points = [[0, 0], [0.01, 0.01]];
function setup() {
  const f = fixture({ analysis_runs: [{ analysis_run_id: 7, organization_id: 1, objective: 'Preserve purpose', metadata: { analysis_type: 'operational_project', territory: { coordinates: [0, 0] } } }] });
  const infrastructure = { getMongoDatabase: async () => f.options.database, withMongoTransaction: f.options.transaction, nextId: f.options.nextId, cleanDocument: value => value };
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 100, duration: 20, geometry: { type: 'LineString', coordinates: points }, legs: [{ distance: 100, duration: 20, steps: [] }] }] }) }; };
  const options = { mongoInfrastructure: infrastructure, fetchImpl };
  return { f, infrastructure, options, calls: () => calls, service: createGeographyService(options), payload: { name: 'Fixture route', coordinates: points, analysis_run_id: 7, result: { forged: true } } };
}

test('road plan and project retain an atomic evidence reference, server-calculated hash and original purpose', async () => {
  const { f, service, payload } = setup();
  const plan = (await service.saveRoutePlan(1, payload, 10)).data;
  assert.equal(plan.analysis_run_id, 7);
  assert.equal(plan.calculation_contract, 'backstage-road-plan-v1');
  assert.equal(plan.result_sha256, crypto.createHash('sha256').update(JSON.stringify(plan.result)).digest('hex'));
  assert.equal(plan.result.forged, undefined);
  assert.equal(plan.result.source.traffic, 'not_live');
  assert.deepEqual(f.data().analysis_runs[0].metadata.route_plan_ids, [plan.route_plan_id]);
  assert.equal(f.data().analysis_runs[0].objective, 'Preserve purpose');
  assert.equal(f.data().soi_audit_events[0].action, 'route_plan.project_linked');
  assert(!JSON.stringify(f.data().soi_audit_events).includes('coordinates'));
});

test('foreign project denies provider calls and failed audit rolls back both route plan and project reference', async () => {
  const { f, service, payload, calls, options, infrastructure } = setup();
  await assert.rejects(service.saveRoutePlan(2, payload, 10), e => e.statusCode === 404);
  await assert.rejects(service.saveRoutePlan(1, { ...payload, analysis_run_id: true }, 10), e => e.statusCode === 400);
  assert.equal(calls(), 0);
  const failing = createGeographyService({ ...options, mongoInfrastructure: { ...infrastructure, withMongoTransaction: work => f.options.transaction((db, session) => work({ collection(name) { const col = db.collection(name); if (name === 'soi_audit_events') col.insertOne = async () => { throw Error('fixture audit failure'); }; return col; } }, session)) } });
  await assert.rejects(failing.saveRoutePlan(1, payload, 10), /fixture audit failure/);
  assert.equal(f.data().soi_route_plans?.length || 0, 0);
  assert.equal(f.data().analysis_runs[0].metadata.route_plan_ids, undefined);
  assert.equal(f.rolledBack(), 1);
});
