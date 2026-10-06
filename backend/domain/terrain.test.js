const test = require('node:test');
const assert = require('node:assert/strict');

const { connectSegments } = require('../spatial/contours');
const { analyzeTerrain, resampleGrid, proceduralTerrain, buildTerrainSurface } = require('../spatial/terrain');
const terrainService = require('../services/terrain.service');

test('calcula pendiente, orientación y relieve para una superficie', () => {
  const result = analyzeTerrain([[0, 10, 20], [0, 10, 20], [0, 10, 20]], { cellSizeM: 10 });
  assert.equal(result.statistics.relief, 20);
  assert.ok(result.slope[1][1] > 40 && result.slope[1][1] < 50);
  assert.equal(result.aspect[1][1], 90);
  assert.equal(result.curvature[1][1], 0);
});

test('reescala una malla con interpolación bilineal', () => {
  const grid = resampleGrid([[0, 10], [10, 20]], 3, 3);
  assert.equal(grid[1][1], 10);
  assert.deepEqual(grid[0], [0, 5, 10]);
});

test('genera terreno procedimental determinista y niveles de detalle', () => {
  const options = { bbox: [-74.2, 4.5, -74, 4.8], resolution: 33, seed: 9 };
  assert.deepEqual(proceduralTerrain(options), proceduralTerrain(options));
  const surface = buildTerrainSurface({ ...options, contourInterval: 25, lod: 1 });
  assert.equal(surface.resolution, 17);
  assert.equal(surface.dataMode, 'procedural');
  assert.ok(surface.contours.length > 0);
});

test('conecta segmentos contiguos en polilíneas', () => {
  const lines = connectSegments([[[0, 0], [1, 0]], [[2, 0], [1, 0]], [[2, 0], [3, 0]]]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].length, 4);
});

test('servicio rechaza bbox inválido', () => {
  assert.throws(() => terrainService.getSurface({ bbox: '0,1,2' }), /bbox debe tener formato/);
});
