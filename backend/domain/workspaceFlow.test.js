const test = require('node:test');
const assert = require('node:assert/strict');
process.env.MONGODB_URI = '';
process.env.JWT_SECRET = 'isolated-workspace-flow-test-key';
const { fixture } = require('./helpers/soiMongoMemoryFixture');
const { createComparisonService } = require('../services/comparisons.service');
const { createAssetsService } = require('../services/assets.service');
const { workspaceTerritory } = require('./workspaceContext');
const context = { organizationId: 7, userId: 1, role: 'analyst' };
function setup() {
  const f = fixture({ locations: [{ organization_id: 7, location_id: 1, name: 'General', type: 'equipment', longitude: 0, latitude: 0 }], soi_assets: [{ organization_id: 7, location_id: 1, name: 'Sanitary', geometry: { type: 'Point', coordinates: [1, 2] } }], soi_configuration: [{ organization_id: 7, capabilities: ['assets'] }] });
  const infra = { getMongoDatabase: async () => f.options.database, withMongoTransaction: f.options.transaction, nextId: f.options.nextId, cleanDocument: row => row && Object.fromEntries(Object.entries(row).filter(([key]) => key !== '_id')) };
  return { f, infra, service: createComparisonService(infra) };
}
const input = { project_name: 'Equipment decision', candidates: [{ id: 'platform:1', name: 'General', lat: 0, lng: 0 }, { id: 'soi:1', name: 'Sanitary', lat: 2, lng: 1 }], criteria: [{ id: 'cost', name: 'Cost', definition: 'Quoted cost', unit: 'test-unit', source: 'isolated fixture', weight: 1, direction: 'cost', normalization: 'minmax', missing: 'block' }], observations: { 'platform:1': { cost: { value: 1 } }, 'soi:1': { cost: { value: 2 } } } };

test('territory validation retains geographic zero and never grants a verification claim', () => {
  const row = workspaceTerritory({ name: 'Zero', coordinates: [0, 0], provenance: { validated: true } });
  assert.deepEqual(row.coordinates, [0, 0]); assert.equal(row.provenance.validated, false);
  for (const coordinates of [[null, 0], ['', 0], [181, 0], [0, 91]]) assert.throws(() => workspaceTerritory({ coordinates }), { statusCode: 400 });
});

test('project territory retains bounded provider attribution and storage metadata without accepting secrets or verification claims', () => {
  const row = workspaceTerritory({ name: 'Declared place', coordinates: [0, 0], source: { name: 'Mapbox Geocoding v6', attribution: 'Fixture attribution', license: 'Fixture license', storage: 'permanent', access_token: 'fixture-private-value' }, provenance: { validated: true } });
  assert.equal(row.source_metadata.attribution, 'Fixture attribution');
  assert.equal(row.source_metadata.storage, 'permanent');
  assert.equal(row.source_metadata.access_token, undefined);
  assert.equal(row.provenance.validated, false);
  assert(!JSON.stringify(row).includes('fixture-private-value'));
  const restored = workspaceTerritory(row);
  assert.deepEqual(restored.source_metadata, row.source_metadata);
});

test('comparison links one original project atomically, retaining both asset identities and immutable evidence', async () => {
  const { f, service } = setup();
  const snapshot = await service.save(context, input);
  const before = structuredClone(f.data().soi_assets);
  // analysis_run_id now explicitly links an existing scoped project. An unknown
  // target must fail atomically instead of being ignored while creating a new one.
  await assert.rejects(service.createProject(context, snapshot.comparison_id, { analysis_run_id: 999, organization_id: 99 }), { statusCode: 404 });
  assert.equal(f.data().analysis_runs?.length || 0, 0);
  const project = await service.createProject(context, snapshot.comparison_id, { territory: { name: 'Workspace', coordinates: [0, 0] }, organization_id: 99 });
  assert.equal(project.organization_id, 7); assert.equal(project.status, 'pending');
  assert.equal(project.metadata.analysis_type, 'operational_project');
  assert.deepEqual(project.metadata.territory.coordinates, [0, 0]);
  assert.deepEqual(project.metadata.selected_assets.map(row => row.asset_id), ['platform:1', 'soi:1']);
  assert.deepEqual(project.metadata.comparison_candidates.map(({ id, name, lat, lng }) => ({ id, name, lat, lng })), snapshot.input.candidates);
  assert.equal(project.metadata.comparison_snapshot_id, snapshot.comparison_id);
  assert.equal(f.data().soi_comparisons[0].project_analysis_run_id, project.analysis_run_id);
  assert.deepEqual(f.data().soi_assets, before);
  assert.equal(f.data().analysis_results?.length || 0, 0);
  assert.deepEqual((await service.get(context, snapshot.comparison_id)).input, JSON.parse(JSON.stringify(snapshot.input)));
  // Retries must work even if an asset has subsequently been removed.
  f.data().locations.length = 0;
  assert.equal((await service.createProject(context, snapshot.comparison_id)).analysis_run_id, project.analysis_run_id);
  assert.equal(f.data().analysis_runs.length, 1);
});

test('link failure rolls back project creation and allows a clean retry', async () => {
  const { f, infra, service } = setup();
  const snapshot = await service.save(context, input);
  const database = f.options.database;
  const failing = createComparisonService({ ...infra, withMongoTransaction: work => f.options.transaction((db, session) => work({ collection(name) { const collection = db.collection(name); if (name === 'soi_comparisons') collection.updateOne = async () => { throw new Error('injected link failure'); }; return collection; } }, session)) });
  await assert.rejects(failing.createProject(context, snapshot.comparison_id), /injected link failure/);
  assert.equal(f.rolledBack(), 1); assert.equal(f.data().analysis_runs?.length || 0, 0);
  assert.equal(f.data().soi_comparisons[0].project_analysis_run_id, undefined);
  assert(await service.createProject(context, snapshot.comparison_id));
  assert.equal(database, f.options.database);
});

test('project conversion enforces tenant, role, asset ownership and existing-link integrity', async () => {
  const { f, service } = setup(); const snapshot = await service.save(context, input);
  await assert.rejects(service.createProject({ ...context, organizationId: 8 }, snapshot.comparison_id), { statusCode: 404 });
  await assert.rejects(service.createProject({ ...context, role: 'viewer' }, snapshot.comparison_id), { statusCode: 403 });
  await assert.rejects(service.createProject(context, 9999), { statusCode: 404 });
  f.data().locations[0].organization_id = 8;
  await assert.rejects(service.createProject(context, snapshot.comparison_id), { statusCode: 404 });
  f.data().soi_comparisons[0].project_analysis_run_id = 9999;
  await assert.rejects(service.createProject(context, snapshot.comparison_id), { statusCode: 409 });
  assert.equal(f.data().analysis_runs?.length || 0, 0);
});

test('HTTP workflow registers an asset, saves evidence, creates and recovers the original scoped project', async t => {
  const { f, infra, service } = setup();
  const runtime = require('../infrastructure/platformMongo'), originalRuntime = { ...runtime };
  const organizations = require('../services/organization.service'), originalMemberships = organizations.getUserMemberships;
  let memberships = [{ organization_id: 7, role: 'analyst' }];
  Object.assign(runtime, infra); organizations.getUserMemberships = async () => memberships;
  t.after(() => { Object.assign(runtime, originalRuntime); organizations.getUserMemberships = originalMemberships; });
  const express = require('express'), app = express(); app.use(express.json());
  app.use('/assets', require('../routes/assets.routes').createAssetsRouter(createAssetsService(infra), organizations));
  app.use('/comparisons', require('../routes/comparisons.routes').createComparisonsRouter(service, organizations));
  app.use('/analysis', require('../routes/analysis.routes'));
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1'); t.after(() => server.close()); await new Promise(resolve => server.once('listening', resolve));
  const headers = { Authorization: `Bearer ${require('../auth').createToken({ user_id: 1, organization_id: 7, role: 'admin' })}`, 'Content-Type': 'application/json' };
  const request = async (url, body, expected = 200) => { const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, { headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }); const value = await response.json(); assert.equal(response.status, expected, JSON.stringify(value)); return value; };
  const asset = (await request('/assets', { name: 'Registered fixture', type: 'equipment', longitude: 0, latitude: 0 }, 201)).data;
  assert((await request('/assets')).data.some(row => row.asset_id === asset.asset_id));
  const snapshot = (await request('/comparisons', { ...input, candidates: [{ ...input.candidates[0], id: asset.asset_id }, input.candidates[1]], observations: { [asset.asset_id]: { cost: { value: 1 } }, 'soi:1': { cost: { value: 2 } } } }, 201)).data;
  const project = (await request(`/comparisons/${snapshot.comparison_id}/project`, { territory: { name: 'Chosen territory', coordinates: [0, 0] } })).data;
  assert.equal((await request(`/comparisons/${snapshot.comparison_id}/project`, {})).data.analysis_run_id, project.analysis_run_id);
  const restored = await request(`/analysis/${project.analysis_run_id}`);
  assert.equal(restored.metadata.comparison_snapshot_id, snapshot.comparison_id);
  assert.deepEqual(restored.metadata.selected_assets.map(row => row.asset_id), [asset.asset_id, 'soi:1']);
  assert.equal(restored.ranking.length, 0);
  assert((await request('/analysis')).some(row => row.analysis_run_id === project.analysis_run_id));
  const { contextFromProject } = await import('../../frontend/src/lib/projectContext.mjs');
  const recovered = contextFromProject(restored, 7);
  assert.equal(recovered.asset_id, asset.asset_id); assert.equal(recovered.comparison_id, snapshot.comparison_id);
  assert.deepEqual(recovered.territory.coordinates, [0, 0]);
  memberships = [{ organization_id: 7, role: 'viewer' }];
  await request(`/comparisons/${snapshot.comparison_id}/project`, {}, 403);
  memberships = [{ organization_id: 8, role: 'admin' }]; headers['X-Organization-Id'] = '8';
  await request(`/analysis/${project.analysis_run_id}`, null, 404);
  await request(`/comparisons/${snapshot.comparison_id}`, null, 404);
  assert.equal(f.data().analysis_runs.length, 1);
});
