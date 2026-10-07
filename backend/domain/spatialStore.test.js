const test = require('node:test');
const assert = require('node:assert/strict');
const WorldModel = require('../spatial/worldModel');
const { COLLECTIONS, AtlasSpatialStore, MemorySpatialStore, createSpatialStore } = require('../spatial/store');
const { translate } = require('../services/spatialIngestion.service');

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

test('Atlas crea singleton reutilizable con URI y memory funciona sin credenciales', () => {
  const memoryStore = createSpatialStore({ SPATIAL_STORE: 'memory' });
  assert.ok(memoryStore instanceof MemorySpatialStore);

  const atlasStore1 = createSpatialStore({ SPATIAL_STORE: 'atlas', MONGODB_URI: 'mongodb://localhost:27017/backstage_spatial' });
  const atlasStore2 = createSpatialStore({ SPATIAL_STORE: 'atlas', MONGODB_URI: 'mongodb://localhost:27017/backstage_spatial' });
  assert.equal(atlasStore1, atlasStore2);
  assert.equal(atlasStore1.constructor.name, 'AtlasSpatialStore');
});

test('producción exige Atlas y no cae silenciosamente a memoria', () => {
  assert.throws(() => createSpatialStore({ NODE_ENV: 'production' }), { statusCode: 503 });
  assert.throws(() => createSpatialStore({ NODE_ENV: 'production', SPATIAL_STORE: 'memory' }), { statusCode: 503 });
});

test('Atlas namespacea IDs por organización y exige tenant en lecturas', async () => {
  const documents = new Map();
  const collection = {
    replaceOne: async (filter, document) => documents.set(filter._id, document),
    findOne: async (filter) => {
      const document = documents.get(filter._id);
      return document && Object.entries(filter).every(([key, value]) => document[key] === value) ? document : null;
    },
  };
  const store = new AtlasSpatialStore({ uri: 'mongodb://localhost:27017/test', client: {} });
  store.db = { collection: () => collection };

  await store.upsert(COLLECTIONS.objects, { id: 'same-feature', organizationId: 'ORG_A', properties: { name: 'A' } });
  await store.upsert(COLLECTIONS.objects, { id: 'same-feature', organizationId: 'ORG_B', properties: { name: 'B' } });

  assert.equal((await store.get(COLLECTIONS.objects, 'same-feature', 'ORG_A')).properties.name, 'A');
  assert.equal((await store.get(COLLECTIONS.objects, 'same-feature', 'ORG_B')).properties.name, 'B');
  assert.equal(await store.get(COLLECTIONS.objects, 'ORG_B::same-feature', 'ORG_A'), null);
});

test('errores del driver Atlas se convierten a 503 sin filtrar detalles', () => {
  const error = Object.assign(new Error('MongoDB connection details must remain private'), { name: 'MongoServerSelectionError' });
  assert.throws(() => translate(error), (translated) => translated.statusCode === 503
    && !translated.message.includes('connection details'));
});
