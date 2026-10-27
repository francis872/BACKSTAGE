import test from 'node:test';
import assert from 'node:assert/strict';
import { propertyMapContext } from '../src/lib/horizontalProperty.mjs';
import { CORE_NAVIGATION } from '../src/lib/navigationRegistry.mjs';

test('an unlocated PH unit opens its ancestor geometry while keeping the unit selection and project context', () => {
  const unit = { location_id: 9, name: 'Unit without geometry', geometry: null };
  const polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  const detail = { data: unit, spatial_reference: { mode: 'linked_ancestor', location_id: 2, name: 'Building', geometry: polygon } };
  const result = propertyMapContext(detail);
  assert.equal(result.property_entity_id, 9); assert.equal(result.territory.location_id, 2);
  assert.equal(result.territory.geometry, polygon); assert.equal(unit.geometry, null);
  assert.equal(result.preserveProject, true); assert.equal(result.territory.coordinates, undefined);
  assert.equal(propertyMapContext({ data: unit, spatial_reference: { mode: 'unlocated', geometry: null } }), null);
});

test('PH remains a map layer and does not add a fifth primary destination', () => {
  assert.deepEqual(CORE_NAVIGATION.map(row => row.key), ['territorial-explorer', 'feed', 'profile', 'organization-settings']);
  const result = propertyMapContext({ data: { location_id: 1 }, spatial_reference: { location_id: 1, name: 'Zero', geometry: { type: 'Point', coordinates: [0, 0] } } });
  assert.deepEqual(result.mapContext.center, [0, 0]); assert.equal(result.property_layer_open, true);
});
