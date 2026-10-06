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
    organizationId: 7, worldId: '7:earth', sourceId: source._id, collection: pointCollection, zoom: 12,
  });
  assert.equal(job.status, 'completed');
  assert.equal(job.featureCount, 1);
  assert.equal(job.tileCount, 1);
  const tile = await pipeline.getTile({ organizationId: 7, worldId: '7:earth', z: 12, x: 1175, y: 1983 });
  assert.equal(tile.features.length, 1);
  assert.equal(tile.features[0].properties.sourceId, source._id);
});

test('aísla las fuentes por organización', async () => {
  const pipeline = new SpatialIngestionPipeline(new MemorySpatialStore());
  const source = await pipeline.registerSource({
    organizationId: 1, provider: 'Entidad', dataset: 'vías', version: '1', license: 'ODC',
  });
  await assert.rejects(() => pipeline.ingestGeoJSON({
    organizationId: 2, worldId: '2:earth', sourceId: source._id, collection: pointCollection, zoom: 12,
  }), /organización activa/);
});
