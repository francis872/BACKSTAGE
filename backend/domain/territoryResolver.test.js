const test = require('node:test');
const assert = require('node:assert/strict');
const { createTerritoryResolver } = require('../services/territoryResolver.service');

test('resolves real geocoder fields, bounds, ODbL attribution, and caches the result', async () => {
  let requests = 0;
  let requestUrl;
  let requestHeaders;
  const resolver = createTerritoryResolver({
    minIntervalMs: 0,
    fetchImpl: async (url, options) => {
      requests += 1;
      requestUrl = new URL(url);
      requestHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        json: async () => [{
          place_id: 1,
          osm_type: 'relation',
          osm_id: 1343264,
          name: 'Medellín',
          display_name: 'Medellín, Antioquia, Colombia',
          lat: '6.2697324',
          lon: '-75.6025597',
          boundingbox: ['6.1633051', '6.3764208', '-75.7194283', '-75.4736400'],
          address: { city: 'Medellín', state: 'Antioquia', country: 'Colombia' },
        }],
      };
    },
  });

  const first = await resolver.resolve('Medellín');
  const cached = await resolver.resolve('Medellín');

  assert.equal(requests, 1);
  assert.equal(requestUrl.searchParams.get('countrycodes'), 'co');
  assert.match(requestHeaders['User-Agent'], /BACKSTAGE/);
  assert.equal(first.id, 'nominatim:relation:1343264');
  assert.deepEqual(first.geometry.coordinates, [-75.6025597, 6.2697324]);
  assert.deepEqual(first.bounds, [-75.7194283, 6.1633051, -75.47364, 6.3764208]);
  assert.equal(first.properties.city, 'Medellín');
  assert.equal(first.provenance.license, 'ODbL-1.0');
  assert.equal(first.provenance.confidence, null);
  assert.equal(cached.id, first.id);
});

test('returns null when the public provider has no matching territory', async () => {
  const resolver = createTerritoryResolver({
    minIntervalMs: 0,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] }),
  });
  assert.equal(await resolver.resolve('Lugar sin coincidencia'), null);
});

test('translates provider throttling to service unavailable', async () => {
  const resolver = createTerritoryResolver({
    minIntervalMs: 0,
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => [] }),
  });
  await assert.rejects(resolver.resolve('Medellín'), (error) => error.statusCode === 503);
});