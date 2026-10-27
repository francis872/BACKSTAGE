const test = require('node:test'), assert = require('node:assert/strict');
process.env.MONGODB_URI = ''; process.env.JWT_SECRET = 'spatial-evidence-isolated-key';
const gis = require('../services/spatialEvidence.service'), optimization = require('../services/optimizationEvidence.service');
const { fixture } = require('./helpers/soiMongoMemoryFixture'), { goldenResult } = require('./helpers/routeEvidenceFixture');
const { createSanitaryAnalytics } = require('../services/soiSanitaryAnalytics.service');
const context = { organizationId: 7, userId: 1, role: 'admin' };
const scenario = () => ({ name: 'Independent two-node fixture', analysis_run_id: 9, nodes: [{ asset_id: 1 }, { asset_id: 2, demand_kg: 5 }], vehicles: [{ vehicle_id: 3, capacity_kg: 10 }], matrix: { node_ids: ['1', '2'], distance_m: [[0, 1000], [1000, 0]], duration_s: [[0, 100], [100, 0]], source: { name: 'SIMULATED fixture; no physical roads', data_kind: 'simulated' } }, time_limit_s: .1 });
function setup(runner = async () => goldenResult()) {
  const f = fixture({ soi_configuration: [{ organization_id: 7, capabilities: ['assets', 'fleet', 'optimization'] }], soi_assets: [{ organization_id: 7, location_id: 1, name: 'Depot', geometry: { type: 'Point', coordinates: [0, 0] } }, { organization_id: 7, location_id: 2, name: 'Point', geometry: { type: 'Point', coordinates: [.01, 0] } }], soi_vehicles: [{ organization_id: 7, vehicle_id: 3, name: 'Vehicle', status: 'available', capacity: 10, capacity_unit: 'kg' }], analysis_runs: [{ organization_id: 7, analysis_run_id: 9, metadata: {} }] });
  const infra = { getMongoDatabase: async () => f.options.database, withMongoTransaction: f.options.transaction, nextId: f.options.nextId, cleanDocument: row => row }; return { f, infra, service: createSanitaryAnalytics(infra, runner) };
}
test('GIS known equatorial and antimeridian distances preserve symmetry and are not road distances', () => {
  const p = gis.canonicalInput('gis.distance_matrix', { coordinates: [[0, 0], [1, 0], [179, 0], [-179, 0]], source: { name: 'Independent fixture' } });
  const r = gis.run('gis.distance_matrix', p); assert(Math.abs(r.distance_m[0][1] - 111195.080234) < .000002); assert(Math.abs(r.distance_m[2][3] - 222390.160467) < .000002);
  r.distance_m.forEach((row, i) => row.forEach((v, j) => { assert.equal(v, r.distance_m[j][i]); if (i === j) assert.equal(v, 0); })); assert.equal(r.road_distance, false); assert.equal(r.physical_accuracy_m, null);
});
test('GIS closed ring reports boundary separately and rejects ambiguous coordinates, CRS and antimeridian polygons', () => {
  const raw = { source: { name: 'Fixture' }, point: [.5, .5], ring: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]] };
  assert.equal(gis.run('gis.point_in_polygon', gis.canonicalInput('gis.point_in_polygon', raw)).inside, true);
  assert.equal(gis.run('gis.point_in_polygon', gis.canonicalInput('gis.point_in_polygon', { ...raw, point: [2, 2] })).inside, false);
  const boundary = gis.run('gis.point_in_polygon', gis.canonicalInput('gis.point_in_polygon', { ...raw, point: [1, .5] })); assert(boundary.on_boundary && !boundary.inside);
  for (const coordinates of [[[null, 0], [1, 1]], [[true, 0], [1, 1]], [['0', 0], [1, 1]], [[181, 0], [0, 0]], [[0, 91], [0, 0]]]) assert.throws(() => gis.canonicalInput('gis.distance_matrix', { coordinates, source: raw.source }), { statusCode: 400 });
  assert.throws(() => gis.canonicalInput('gis.point_in_polygon', { ...raw, crs: 'EPSG:3857' }));
  assert.throws(() => gis.canonicalInput('gis.point_in_polygon', { ...raw, ring: [[179, 0], [-179, 0], [-179, 1], [179, 0]] }));
});
test('GIS contract detects input/result/reference/rule tampering and never trusts a declared certification', () => {
  const params = gis.canonicalInput('gis.distance_matrix', { coordinates: [[0, 0], [1, 0]], source: { name: 'Fixture', data_type: 'REAL_VERIFIED' } }), result = gis.run('gis.distance_matrix', params);
  const row = { params, result, algorithm_name: 'gis.distance_matrix', algorithm_version: gis.VERSION, status: 'succeeded', analysis: gis.build('gis.distance_matrix', params, result) };
  assert(gis.verify(row).verified); assert.equal(row.analysis.provenance.data_type, 'UNKNOWN');
  for (const mutate of [r => r.params.coordinates[0][0] = 2, r => r.result.distance_m[0][1] = 1, r => r.params.spatial_reference = { crs: 'other' }, r => r.analysis.business_rules.version = 'other']) { const changed = structuredClone(row); mutate(changed); assert.equal(gis.verify(changed).verified, false); }
});
test('optimization materializes existing defaults, rules, source and resource state; links one immutable project reference', async () => {
  const { service, f } = setup(), record = await service.optimize(context, scenario());
  assert.equal(record.input.rule_context.version, gis.rules.version); assert.equal(record.input.vehicles[0].capacity_kg, 10); assert.equal(record.input.nodes[1].service_s, 0); assert.deepEqual(record.input.nodes[1].time_window_s, [0, 86400]);
  assert.equal(record.input.planning_context.gps_provider, null); assert.equal(record.input.matrix.source.verification, 'ORGANIZATION_DECLARED_NOT_INDEPENDENTLY_VERIFIED');
  assert((await service.verify(context, record.record_id)).verified); assert.equal(f.data().analysis_runs[0].metadata.spatial_evidence[0].manifest_sha256, record.analysis.manifest_sha256);
  assert.equal((await service.optimize(context, scenario())).record_id, record.record_id); assert.equal(f.data().analysis_runs[0].metadata.spatial_evidence.length, 1);
});
test('business constraints validate source, capacities, duplicate IDs, matrix units/order and objectives before search', async () => {
  for (const mutate of [p => p.nodes.push({ asset_id: 2 }), p => p.vehicles.push({ vehicle_id: 3, capacity_kg: 10 }), p => p.matrix.duration_s[0][1] = null, p => p.matrix.node_ids.reverse(), p => p.nodes[1].demand_kg = true, p => { p.objective = { weights: { cost: 1 } }; p.nodes[1].demand_kg = 100; }, p => p.objective = { weights: { emissions: 1 } }]) { const { service } = setup(), p = scenario(); mutate(p); await assert.rejects(service.optimize(context, p)); }
  const { service, f } = setup(); f.data().soi_vehicles[0].capacity_unit = 'm3'; await assert.rejects(service.optimize(context, scenario()));
});
test('tampering, resource changes and changed business configuration block new approval', async () => {
  for (const mutate of [f => delete f.data().soi_optimization_scenarios[0].analysis, f => f.data().soi_optimization_scenarios[0].result.result.routes[0].visits[1].arrival_s = 1, f => f.data().soi_vehicles[0].capacity_unit = 'm3', f => f.data().soi_assets[1].geometry.coordinates = [1, 1], f => f.data().soi_configuration[0].revision = 1]) {
    const { service, f } = setup(), r = await service.optimize(context, scenario()); mutate(f); await assert.rejects(service.approve(context, r.record_id, { revision: r.revision }), { statusCode: 409 });
  }
});
test('independent verifier rejects mathematically invalid routes even if a new manifest is computed', async () => {
  const { service } = setup(), r = await service.optimize(context, scenario());
  for (const mutate of [x => x.result.routes[0].visits[1].arrival_s = 1, x => x.result.routes[0].visits[1].load_kg = 20, x => x.result.routes[0].distance_m = 5, x => x.result.objective.normalized_weighted_sum = 0, x => x.result.served_node_ids = []]) { const result = structuredClone(r.result); mutate(result); const changed = { ...r, result, analysis: optimization.build(r.input, result) }; assert.equal(optimization.verify(changed).verified, false); }
});
test('repeated bounded search excludes timing noise, accepts another valid schedule and never overwrites the snapshot', async () => {
  let calls = 0; const { service, f } = setup(async () => { const r = goldenResult(); if (calls++) { r.result.routes[0].visits[1].arrival_s = 110; r.result.routes[0].visits[2].arrival_s = 210; r.result.routes[0].duration_s = 210; r.result.totals.duration_s = 210; r.duration_ms = 9; } return r; });
  const r = await service.optimize(context, scenario()), before = structuredClone(f.data().soi_optimization_scenarios[0]); const report = await service.reproduce(context, r.record_id);
  assert(report.solution_validation.valid); assert.equal(report.exact_result_matches, false); assert.deepEqual(f.data().soi_optimization_scenarios[0], before);
  const again = await service.reproduce(context, r.record_id); assert.notEqual(again.replay_event_id, report.replay_event_id); assert.equal(f.data().soi_domain_events.filter(e => e.type === 'optimization.reproduced').length, 2);
  assert.equal(f.data().soi_domain_events.at(-1).metadata.result_sha256, again.result_sha256);
  assert.equal(optimization.verify({ ...r, result: { ...r.result, duration_ms: 900 } }).verified, true);
});
test('capacity proof is independently checked and time-limited absence is not certified as a proof', async () => {
  const { service } = setup(async () => ({ version: 'soi-scientific-1.0.0', result: { feasible: false, status: 'INFEASIBLE_CAPACITY' } })); const p = scenario(); p.nodes[1].demand_kg = 20;
  const r = await service.optimize(context, p); assert.equal(r.state, 'INFEASIBLE'); assert((await service.verify(context, r.record_id)).verified);
  assert.equal(optimization.validateSolution(r.input, { result: { feasible: false, status: 'NO_SOLUTION_FOUND_WITHIN_LIMIT' } }).mathematical_proof_recomputed, false);
  const changed = structuredClone(r.input); changed.nodes[1].demand_kg = 5; assert.equal(optimization.validateSolution(changed, r.result).valid, false);
});
test('real unchanged Python solver satisfies independently checked known tour and capacity infeasibility', async () => {
  const { executeSoiPython } = require('../services/bsie.service'); const { service } = setup(executeSoiPython);
  const r = await service.optimize(context, scenario()); assert.equal(r.result.result.totals.distance_m, 2000); assert((await service.verify(context, r.record_id)).verified);
  const p = scenario(); p.nodes[1].demand_kg = 11; const infeasible = await service.optimize(context, p); assert.equal(infeasible.state, 'INFEASIBLE'); assert((await service.verify(context, infeasible.record_id)).verified);
});
test('result, project reference and domain event roll back together after a completion failure', async () => {
  const { f, infra } = setup(); const transaction = infra.withMongoTransaction;
  infra.withMongoTransaction = work => transaction(async (...args) => { const result = await work(...args); if (f.data().soi_optimization_scenarios?.[0]?.state === 'PROPOSED') throw Error('INJECTED COMPLETION FAILURE'); return result; });
  const service = createSanitaryAnalytics(infra, async () => goldenResult()); await assert.rejects(service.optimize(context, scenario()), /INJECTED/);
  assert.equal(f.data().soi_optimization_scenarios[0].state, 'FAILED'); assert.equal(f.data().soi_optimization_scenarios[0].result, undefined); assert.equal(f.data().analysis_runs[0].metadata.spatial_evidence, undefined);
  assert(!f.data().soi_domain_events.some(e => e.event_type === 'optimization-scenarios.completed'));
});
test('configuration revisions and their audit fact commit together without inventing an operational rule', async () => {
  const { f, infra } = setup(), service = require('../services/soiMongo.service').createMongoSoiService(infra);
  const row = await service.saveConfiguration(context, { sector: 'general', capabilities: ['assets', 'optimization'] }); assert.equal(row.revision, 1);
  assert.equal(f.data().soi_audit_events.at(-1).action, 'configuration.updated');
  await assert.rejects(service.saveConfiguration({ ...context, role: 'analyst' }, { sector: 'general', capabilities: [] }), { statusCode: 403 });
});
test('optimization HTTP allows current viewers to inspect/export but rejects replay, foreign organization and revoked access', async t => {
  const { f, infra, service } = setup(), r = await service.optimize(context, scenario());
  f.data().soi_configuration.push({ organization_id: 8, capabilities: ['optimization'] });
  const { createSanitaryService } = require('../services/soiSanitary.service'), { createSanitaryRouter } = require('../routes/soiSanitary.routes');
  const express = require('express'), app = express(); let memberships = [{ organization_id: 7, role: 'viewer' }, { organization_id: 8, role: 'viewer' }];
  app.use(express.json()); app.use('/sanitary', createSanitaryRouter(createSanitaryService(infra), { analytics: service, organizationService: { getUserMemberships: async () => memberships, resolveMembership: require('../services/organization.service').resolveMembership } })); app.use((e, req, res, next) => res.status(e.statusCode || 500).json({ error: e.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
  const headers = { Authorization: `Bearer ${require('../auth').createToken({ user_id: 1, organization_id: 7, role: 'admin' })}`, 'Content-Type': 'application/json' }, url = `http://127.0.0.1:${server.address().port}/sanitary/optimization/${r.record_id}`;
  assert((await (await fetch(url + '/reproducibility', { headers })).json()).data.verified);
  const exported = await fetch(url + '/export', { headers }); assert.equal(exported.status, 200); assert.match(exported.headers.get('content-disposition'), /attachment/);
  assert.equal((await fetch(url + '/reproduce', { headers, method: 'POST', body: '{}' })).status, 403);
  assert.equal((await fetch(url + '/export', { headers: { ...headers, 'X-Organization-Id': '8' } })).status, 404);
  memberships = []; assert.equal((await fetch(url + '/reproducibility', { headers })).status, 403);
});
