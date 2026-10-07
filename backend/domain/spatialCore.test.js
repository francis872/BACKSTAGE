const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineDistance, pointInPolygon, Quadtree } = require('../spatial/core');

test('distancia nativa es cero para el mismo punto', () => {
  assert.equal(haversineDistance({ lat: 4.7, lng: -74 }, { lat: 4.7, lng: -74 }), 0);
});

test('distancia nativa aproxima un grado sobre el ecuador', () => {
  const meters = haversineDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
  assert.ok(meters > 111000 && meters < 112000);
});

test('point-in-polygon clasifica interior y exterior', () => {
  const ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(pointInPolygon({ lng: 5, lat: 5 }, ring), true);
  assert.equal(pointInPolygon({ lng: 12, lat: 5 }, ring), false);
});

test('quadtree indexa y consulta puntos', () => {
  const tree = new Quadtree([-180, -90, 180, 90], 1);
  tree.insert({ id: 1, lng: -74, lat: 4.7 });
  tree.insert({ id: 2, lng: -77, lat: 6.2 });
  assert.deepEqual(tree.query([-75, 4, -73, 5]).map((item) => item.id), [1]);
});
