const test = require('node:test');
const assert = require('node:assert/strict');
const { createDataResolver } = require('../services/dataResolver.service');

test('resolves tenant metrics and Atlas context with explicit missing fields and no invented confidence', async () => {
  const calls = [];
  const resolver = createDataResolver({
    resolveMetrics: async (input) => {
      calls.push(input);
      return {
        population_total_zone: 12000,
        poi_count_1200m: 4,
        competitor_distance_m: null,
        own_store_distance_m: null,
        flood_risk: null,
        landslide_risk: null,
        crime_risk: null,
        climate_exposure: null,
        provenance: {
          sources: [{ source: 'DANE', dataset: 'demographic_indicators', updated_at: '2026-01-01' }],
          source_count: 1,
          confidence: null,
        },
      };
    },
    resolveNearby: async (organizationId, query) => {
      calls.push({ organizationId, query });
      return [{ id: 'road-1', sourceId: 'dataset-5', distanceM: 14 }];
    },
  });

  const result = await resolver.resolve({
    organizationId: 17,
    territory: {
      id: 'medellin-1',
      properties: { name: 'Medellín', city: 'Medellín' },
      geometry: { type: 'Point', coordinates: [-75.6, 6.27] },
      provenance: { source: 'OpenStreetMap Nominatim', dataset: 'OpenStreetMap', license: 'ODbL-1.0', dataMode: 'derived' },
    },
  });

  assert.equal(calls[0].organizationId, 17);
  assert.equal(calls[1].organizationId, 17);
  assert.equal(result.status, 'partial_data');
  assert.equal(result.data_quality.data_mode, 'derived');
  assert.equal(result.data_quality.confidence, null);
  assert.ok(result.data_quality.missing_inputs.includes('flood_risk'));
  assert.equal(result.sources.length, 3);
  assert.ok(result.sources.some((source) => source.source === 'DANE' && source.updatedAt === '2026-01-01'));
  assert.equal(result.spatial_context[0].id, 'road-1');
  assert.equal(result.risk.status, 'insufficient_data');
});

test('does not query metric stores when territory coordinates are absent', async () => {
  let called = false;
  const resolver = createDataResolver({
    resolveMetrics: async () => { called = true; return {}; },
    resolveNearby: async () => { called = true; return []; },
  });
  const result = await resolver.resolve({ organizationId: 9, territory: { properties: { name: 'Unknown' } } });
  assert.equal(called, false);
  assert.equal(result.status, 'insufficient_data');
  assert.equal(result.coordinates, null);
  assert.ok(result.data_quality.missing_inputs.includes('coordinates'));
});