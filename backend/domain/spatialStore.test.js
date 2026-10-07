const test = require('node:test');
const assert = require('node:assert/strict');
const WorldModel = require('../spatial/worldModel');
const { COLLECTIONS, MemorySpatialStore, createSpatialStore } = require('../spatial/store');

test('crea mundo, celda y objeto espacial versionado', async () => {
  const store = new MemorySpatialStore();
  const world = new WorldModel(store);
  await world.createWorld({ id: 'earth-v1', name: 'Earth' });
  await world.upsertCell({ cellId: 'cell-1', worldId: 'earth-v1', level: 1, bounds: [-77, 4, -76, 5] });
  await world.upsertSpatialObject({ id: 'river-1', worldId: 'earth-v1', cellId: 'cell-1', geometry: { type: 'LineString', coordinates: [[-76.9, 4.1], [-76.2, 4.8]] }, version: 1 });
  await world.upsertSpatialObject({ id: 'river-1', worldId: 'earth-v1', cellId: 'cell-1', geometry: { type: 'LineString', coordinates: [[-76.9, 4.1], [-76.1, 4.9]] }, version: 2 });
  assert.equal((await store.get(COLLECTIONS.objects, 'river-1')).version, 2);
  assert.ok(await store.get(COLLECTIONS.versions, 'river-1:1'));
});

test('registra procedencia obligatoria', async () => {
  const world = new WorldModel(new MemorySpatialStore());
  await assert.rejects(() => world.registerSource({ provider: 'IGAC' }), /dataset/);
  const source = await world.registerSource({ provider: 'IGAC', dataset: 'cartografia', version: '2026' });
  assert.equal(source.provider, 'IGAC');
});

test('Atlas exige URI y memory funciona sin credenciales', () => {
  assert.ok(createSpatialStore({ SPATIAL_STORE: 'memory' }) instanceof MemorySpatialStore);
  assert.throws(() => createSpatialStore({ SPATIAL_STORE: 'atlas' }), /MONGODB_URI/);
});
