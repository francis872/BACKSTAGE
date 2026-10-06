const test = require('node:test');
const assert = require('node:assert/strict');

const { MemorySpatialStore } = require('../spatial/store');
const { SpatialIngestionPipeline, validateFeatureCollection, validateSource } = require('../spatial/ingestion');
const { lonLatToTile, tileBounds, tilesForGeometry } = require('../spatial/tiles');

const pointCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature', id: 'quibdo-center',
    geometry: { type: 'Point', coordinates: [-76.658, 5.694] },
    properties: { name: 'Centro territorial', objectType: 'place' },
  }],
};

test('convierte coordenadas WGS84 a teselas XYZ y recupera sus límites', () => {
  const tile = lonLatToTile(-76.658, 5.694, 12);
  assert.deepEqual(tile, { z: 12, x: 1175, y: 1983 });
  const bounds = tileBounds(tile.z, tile.x, tile.y);
  assert.ok(bounds[0] <= -76.658 && bounds[2] >= -76.658);
  assert.ok(bounds[1] <= 5.694 && bounds[3] >= 5.694);
});

test('asigna una geometría a las teselas que cubre', () => {
  const tiles = tilesForGeometry(pointCollection.features[0].geometry, 12);
  assert.deepEqual(tiles, ['12/1175/1983']);
});

test('exige licencia y rechaza coordenadas fuera de WGS84', () => {
  assert.throws(() => validateSource({ provider: 'x', dataset: 'y', version: '1' }), /license/);
  assert.throws(() => validateFeatureCollection({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [300, 4] } }],
  }), /fuera de WGS84/);
});

test('ingiere GeoJSON con procedencia y lo sirve por tesela', async () => {
  const store = new MemorySpatialStore();
  const pipeline = new SpatialIngestionPipeline(store);
  const source = await pipeline.registerSource({
    organizationId: 7, provider: 'Municipio', dataset: 'lugares', version: '2026-01',
    license: 'Datos abiertos', dataMode: 'measured', confidence: 0.9,
  });
  const job = await pipeline.ingestGeoJSON({
    organizationId: 7, worldId: '7:earth', sourceId: source._id, collection: pointCollection, minZoom: 10, maxZoom: 12,
  });
  assert.equal(job.status, 'completed');
  assert.equal(job.featureCount, 1);
  assert.equal(job.tileCount, 3);
  const tile = await pipeline.getTile({ organizationId: 7, worldId: '7:earth', z: 12, x: 1175, y: 1983 });
  assert.equal(tile.features.length, 1);
  assert.equal(tile.features[0].properties.sourceId, source._id);
  const lowerTile = lonLatToTile(-76.658, 5.694, 10);
  const lower = await pipeline.getTile({ organizationId: 7, worldId: '7:earth', ...lowerTile });
  assert.equal(lower.features.length, 1);
  const archived = await pipeline.setSourceStatus({ organizationId: 7, sourceId: source._id, status: 'archived' });
  assert.equal(archived.affectedObjects, 1);
  const hidden = await pipeline.getTile({ organizationId: 7, worldId: '7:earth', z: 12, x: 1175, y: 1983 });
  assert.equal(hidden.features.length, 0);
});

test('aísla las fuentes por organización', async () => {
  const pipeline = new SpatialIngestionPipeline(new MemorySpatialStore());
  const source = await pipeline.registerSource({
    organizationId: 1, provider: 'Entidad', dataset: 'vías', version: '1', license: 'ODC',
  });
  await assert.rejects(() => pipeline.ingestGeoJSON({
    organizationId: 2, worldId: '2:earth', sourceId: source._id, collection: pointCollection, minZoom: 12, maxZoom: 12,
  }), /organización activa/);
});

test('organizaciones pueden reutilizar IDs sin leer ni sobrescribir objetos ajenos', async () => {
  const store = new MemorySpatialStore();
  const pipeline = new SpatialIngestionPipeline(store);
  const sharedSource = { id: 'shared-source', provider: 'Entidad', dataset: 'lugares', version: '1', license: 'ODC' };
  const sourceA = await pipeline.registerSource({ ...sharedSource, organizationId: 'ORG_A' });
  const sourceB = await pipeline.registerSource({ ...sharedSource, organizationId: 'ORG_B' });
  const collectionA = structuredClone(pointCollection);
  const collectionB = structuredClone(pointCollection);
  collectionA.features[0].properties.name = 'ORG_A';
  collectionB.features[0].properties.name = 'ORG_B';

  await pipeline.ingestGeoJSON({ organizationId: 'ORG_A', worldId: 'ORG_A:earth', sourceId: sourceA._id, collection: collectionA, minZoom: 12, maxZoom: 12 });
  await pipeline.ingestGeoJSON({ organizationId: 'ORG_B', worldId: 'ORG_B:earth', sourceId: sourceB._id, collection: collectionB, minZoom: 12, maxZoom: 12 });

  assert.equal((await pipeline.search({ organizationId: 'ORG_A', worldId: 'ORG_A:earth', query: 'ORG_A' })).length, 1);
  assert.equal((await pipeline.search({ organizationId: 'ORG_A', worldId: 'ORG_A:earth', query: 'ORG_B' })).length, 0);
  assert.equal((await pipeline.search({ organizationId: 'ORG_B', worldId: 'ORG_B:earth', query: 'ORG_B' })).length, 1);
  await pipeline.setSourceStatus({ organizationId: 'ORG_A', sourceId: sourceA._id, status: 'archived' });
  assert.equal((await pipeline.search({ organizationId: 'ORG_B', worldId: 'ORG_B:earth', query: 'ORG_B' })).length, 1);
});
