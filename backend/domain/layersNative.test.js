const test = require('node:test');
const assert = require('node:assert/strict');

const { parseBbox, geometryIntersectsBbox } = require('../repositories/layers.repository');

test('parseBbox converts a valid bounding box to numbers', () => {
  assert.deepEqual(parseBbox('-74.2,4.5,-74.0,4.8'), [-74.2, 4.5, -74, 4.8]);
});

test('parseBbox rejects malformed bounding boxes', () => {
  assert.throws(() => parseBbox('-74.2,4.5,-74.0'), /bbox debe tener formato/);
});

test('geometryIntersectsBbox detects points and polygons without PostGIS', () => {
  const bbox = [-74.2, 4.5, -74, 4.8];
  assert.equal(geometryIntersectsBbox({ type: 'Point', coordinates: [-74.1, 4.65] }, bbox), true);
  assert.equal(geometryIntersectsBbox({ type: 'Point', coordinates: [-75, 5] }, bbox), false);
  assert.equal(geometryIntersectsBbox({
    type: 'Polygon',
    coordinates: [[[-74.3, 4.6], [-74.1, 4.6], [-74.1, 4.7], [-74.3, 4.6]]],
  }, bbox), true);
});
