const test = require('node:test');
const assert = require('node:assert/strict');

const { flowAccumulation, watershed, analyzeHydrology, topographicProfile } = require('../spatial/hydrology');

test('D8 dirige y acumula flujo hacia el punto más bajo', () => {
  const grid = [[9, 8, 7], [6, 5, 4], [3, 2, 1]];
  const result = flowAccumulation(grid, { cellSizeM: 10 });
  assert.equal(result.directions[2][2], null);
  assert.equal(result.accumulation[2][2], 9);
});

test('delimita la cuenca de aporte de una salida', () => {
  const cells = watershed([[9, 8, 7], [6, 5, 4], [3, 2, 1]], { row: 2, col: 2 });
  assert.equal(cells.length, 9);
});

test('genera drenajes y formas del terreno como GeoJSON trazable', () => {
  const result = analyzeHydrology([[9, 8, 7], [6, 2, 4], [3, 2, 1]], {
    bbox: [-77, 5, -76, 6], cellSizeM: 10, streamThreshold: 3, curvatureThreshold: 0.001,
    outlet: { row: 2, col: 2 },
  });
  assert.equal(result.features.type, 'FeatureCollection');
  assert.equal(result.drainage.type, 'FeatureCollection');
  assert.ok(result.drainage.features.length > 0);
  assert.ok(result.statistics.streamCellCount > 0);
  assert.ok(result.statistics.valleyCellCount > 0);
  assert.ok(result.statistics.watershedCellCount > 0);
});

test('calcula un perfil topográfico interpolado y distancia acumulada', () => {
  const result = topographicProfile([[0, 10], [10, 20]], {
    bbox: [0, 0, 1, 1], start: [0, 0], end: [1, 1], samples: 3,
  });
  assert.equal(result.points[0].elevationM, 0);
  assert.equal(result.points[1].elevationM, 10);
  assert.equal(result.points[2].elevationM, 20);
  assert.ok(result.totalDistanceM > 150000);
});

test('rechaza salidas y perfiles fuera de contrato', () => {
  assert.throws(() => watershed([[1, 0], [2, 1]], { row: 9, col: 9 }), /outlet/);
  assert.throws(() => topographicProfile([[1, 0], [2, 1]], { bbox: [0, 0, 1, 1], start: [0, 0], end: [1, 1], samples: 1 }), /samples/);
});
