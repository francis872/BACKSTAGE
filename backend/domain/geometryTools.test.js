const test = require('node:test');
const assert = require('node:assert/strict');
const { lineDistance, polygonArea, measureGeometry } = require('../spatial/geometryTools');

test('mide una línea geodésica sobre la superficie terrestre', () => {
  const distance = lineDistance([[0, 0], [1, 0]]);
  assert.ok(distance > 111000 && distance < 111300);
});

test('calcula área y perímetro de un polígono GeoJSON', () => {
  const ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  const area = polygonArea(ring);
  assert.ok(area > 12.3e9 && area < 12.5e9);
  const result = measureGeometry({ type: 'Polygon', coordinates: [ring] });
  assert.equal(result.vertexCount, 4);
  assert.ok(result.perimeterM > 443000 && result.perimeterM < 446000);
});

test('rechaza geometrías no admitidas o incompletas', () => {
  assert.throws(() => measureGeometry({ type: 'MultiPoint', coordinates: [[0, 0]] }), /Solo se admiten/);
  assert.throws(() => measureGeometry({ type: 'Polygon', coordinates: [[]] }), /tres vértices/);
});
