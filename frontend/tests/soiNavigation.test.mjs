import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceM, routeProgress, validGps } from '../src/lib/soiNavigation.mjs';
test('progress follows road segments and recognizes a deviation', () => {
  const road = { type: 'LineString', coordinates: [[0, 0], [0, 1], [1, 1]] };
  const progress = routeProgress([0, 0.5], road);
  assert.ok(progress.offRouteM < 1);
  assert.ok(progress.remainingM > 160000 && progress.remainingM < 170000);
  assert.ok(routeProgress([0.2, 0.5], road).offRouteM > 20000);
  assert.ok(distanceM([0, 0], [0, 1]) > 111000);
});
test('GPS rejects stale positions and invalid accuracy', () => {
  const position = { timestamp: 100000, coords: { longitude: 0, latitude: 0, accuracy: 8 } };
  assert.equal(validGps(position, 100001), true);
  assert.equal(validGps(position, 200001), false);
  assert.equal(validGps({ ...position, coords: { ...position.coords, accuracy: -1 } }, 100001), false);
});
