const test = require('node:test'), assert = require('node:assert/strict');
const { setup } = require('./helpers/computationalFixture');
const { createHorizontalPropertyService } = require('../services/horizontalProperty.service');
const { createMongoAuditService } = require('../services/mongoAudit.service');
const C = require('./horizontalProperty');
const input = (name, kind = 'coproperty', parent_id = null, extra = {}) => ({ name, kind, parent_id, source_name: 'Synthetic organization fixture', ...extra });
function fixture() { const s = setup(); return { ...s, ph: createHorizontalPropertyService(s.infra) }; }
const create = async (s, data, context = s.owner) => (await s.ph.create(context, data, `fixture_${require('node:crypto').randomUUID()}`)).data;

test('PH reuses canonical assets, preserves zero coordinates and links unlocated units without inventing geometry', async () => {
  const s = fixture(), root = await create(s, input('Root', 'coproperty', null, { geometry: { type: 'Point', coordinates: [0, 0] } }));
  const tower = await create(s, input('Tower', 'tower', root.location_id)), unit = await create(s, input('Unit', 'private_unit', tower.location_id));
  assert.equal(s.f.data().locations.length, 3); assert.equal(unit.geometry, null); assert.equal(unit.root_id, root.location_id);
  const detail = await s.ph.get(s.viewer, unit.location_id);
  assert.deepEqual(detail.ancestors.map(r => r.location_id), [root.location_id, tower.location_id]);
  assert.equal(detail.spatial_reference.mode, 'linked_ancestor'); assert.deepEqual(detail.spatial_reference.geometry.coordinates, [0, 0]);
  const layer = await s.ph.geojson(s.viewer); assert.equal(layer.features.length, 1); assert.equal(layer.features[0].id, root.location_id);
  assert.equal(unit.provenance.verified, false); assert.equal(unit.provenance.data_type, 'ORGANIZATION_PROVIDED');
  assert.equal(detail.allocation.unassigned_private_units, 1); assert.equal(detail.allocation.complete, false);
  assert.equal((await createMongoAuditService(s.infra).verifyAuditChain(10)).valid, true);
});

test('PH rejects invalid hierarchy, tenant injection, cross-organization references and arbitrary geometry', async () => {
  const s = fixture(), root = await create(s, input('Root')), unit = await create(s, input('Unit', 'private_unit', root.location_id));
  await assert.rejects(create(s, input('Bad tower', 'tower', unit.location_id)), { statusCode: 400 });
  await assert.rejects(create(s, input('Foreign parent', 'tower', root.location_id), s.other), { statusCode: 404 });
  await assert.rejects(s.ph.get(s.other, root.location_id), { statusCode: 404 });
  await assert.rejects(create(s, { ...input('Injected'), organization_id: 20 }), { statusCode: 400 });
  await assert.rejects(create(s, input('Invalid', 'coproperty', null, { geometry: { type: 'Point', coordinates: [181, 0] } })), { statusCode: 400 });
  await assert.rejects(create(s, input('Projected', 'coproperty', null, { crs: 'EPSG:3857' })), { statusCode: 400 });
  assert.equal(Object.keys(s.ph.catalog().kinds).length, 13);
});

test('PH coefficients use exact integer arithmetic and serialize competing allocations at the common root', async () => {
  const s = fixture(), root = await create(s, input('Root'));
  const a = await create(s, input('A', 'private_unit', root.location_id, { coefficient_pct: '0.1000' }));
  await create(s, input('B', 'private_unit', root.location_id, { coefficient_pct: '0.2' }));
  assert.equal((await s.ph.get(s.viewer, a.location_id)).allocation.total_pct, .3);
  const attempts = await Promise.allSettled([1, 2].map(n => create(s, input(`Large ${n}`, 'private_unit', root.location_id, { coefficient_pct: '60' }))));
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(r => r.status === 'rejected').reason.statusCode, 409);
  assert.equal((await s.ph.get(s.viewer, root.location_id)).allocation.total_pct, 60.3);
  for (const value of [-1, 100.1, '0.00001', true, '1e-3']) assert.throws(() => C.coefficient(value), { statusCode: 400 });
});

test('PH updates require revision, keep hierarchy immutable and archive leaves before parents while releasing coefficients', async () => {
  const s = fixture(), root = await create(s, input('Root')), unit = await create(s, input('Unit', 'private_unit', root.location_id, { coefficient_pct: 100 }));
  const changed = (await s.ph.update(s.analyst, unit.location_id, { revision: 1, name: 'Updated unit', coefficient_pct: '50.1250' })).data;
  assert.equal(changed.revision, 2); assert.equal(changed.coefficient_pct, 50.125);
  await assert.rejects(s.ph.update(s.owner, unit.location_id, { revision: 1, name: 'Stale' }), { statusCode: 409 });
  await assert.rejects(s.ph.update(s.owner, unit.location_id, { revision: 2, parent_id: root.location_id }), { statusCode: 400 });
  await assert.rejects(s.ph.archive(s.owner, root.location_id, { revision: 1 }), { statusCode: 409 });
  await assert.rejects(s.ph.archive(s.analyst, unit.location_id, { revision: 2 }), { statusCode: 403 });
  await s.ph.archive(s.owner, unit.location_id, { revision: 2 });
  assert.equal((await s.ph.get(s.owner, root.location_id)).allocation.total_pct, 0);
  assert.equal((await s.ph.get(s.owner, unit.location_id)).data.archived, true);
  assert.equal((await s.ph.list(s.owner, { parent_id: root.location_id })).data.length, 0);
  await s.ph.archive(s.owner, root.location_id, { revision: 1 });
  assert.equal((await s.ph.list(s.owner)).data.length, 0);
});

test('PH creation replays preserve the asset and audit fact and reject reuse for a different input', async () => {
  const s = fixture(), key = 'stable_idempotency_fixture', data = input('Root');
  const first = await s.ph.create(s.owner, data, key), replay = await s.ph.create(s.owner, data, key);
  assert(first.created); assert(!replay.created); assert.equal(first.data.location_id, replay.data.location_id);
  assert.equal(s.f.data().soi_audit_events.length, 1);
  await assert.rejects(s.ph.create(s.owner, input('Different'), key), { statusCode: 409 });
  await assert.rejects(s.ph.create(s.owner, data, 'short'), { statusCode: 400 });
});

test('PH checks current identity and membership instead of trusting a supplied role', async () => {
  const s = fixture(); await assert.rejects(create(s, input('Viewer'), { ...s.viewer, role: 'admin' }), { statusCode: 403 });
  s.f.data().identity_memberships.find(m => m.user_id === 1).role = 'viewer';
  await assert.rejects(create(s, input('Revoked writer')), { statusCode: 403 });
  s.f.data().identity_users.find(u => u.user_id === 4).status = 'disabled';
  await assert.rejects(s.ph.list(s.viewer), { statusCode: 403 });
  assert.equal(s.f.data().locations?.length || 0, 0);
});

test('generic asset writes cannot forge PH metadata, remove a hierarchy or bypass its coefficient rules', async t => {
  const s = fixture(), root = await create(s, input('Root'));
  const mongo = require('../infrastructure/platformMongo');
  t.mock.method(mongo, 'getMongoDatabase', s.infra.getMongoDatabase);
  const locations = require('../services/locations.service');
  await assert.rejects(locations.createLocation({ name: 'Forged', type: 'property', metadata: { horizontal_property: {} } }, 10), { statusCode: 400 });
  await assert.rejects(locations.updateLocation(root.location_id, { name: 'Bypass', type: 'property' }, 10, 1), { statusCode: 409 });
  await assert.rejects(locations.deleteLocation(root.location_id, 10, 1), { statusCode: 409 });
  assert.equal((await s.ph.get(s.owner, root.location_id)).data.name, 'Root');
});
