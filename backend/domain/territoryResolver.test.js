const test = require('node:test');
const assert = require('node:assert/strict');
const { createTerritoryResolver } = require('../services/territoryResolver.service');

test('resolves real geocoder fields, bounds, ODbL attribution, and caches the result', async () => {
  let requests = 0;
  let requestUrl;
  let requestHeaders;
  const resolver = createTerritoryResolver({
    countryCodes: 'co',
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

test('returns ambiguous alternatives and applies only explicitly supplied context bias', async () => {
  const requests = [];
  const resolver = createTerritoryResolver({
    minIntervalMs: 0,
    countryCodes: '',
    fetchImpl: async (url) => {
      requests.push(new URL(url));
      return {
        ok: true,
        status: 200,
        json: async () => [
          { osm_type: 'relation', osm_id: 1, name: 'Medellín', lat: '6.27', lon: '-75.60', boundingbox: ['6.1', '6.4', '-75.8', '-75.4'], address: { city: 'Medellín', state: 'Antioquia', country: 'Colombia', country_code: 'co' } },
          { osm_type: 'relation', osm_id: 2, name: 'Medellín', lat: '19.43', lon: '-99.13', boundingbox: ['19.3', '19.5', '-99.2', '-99.0'], address: { city: 'Medellín', state: 'Veracruz', country: 'México', country_code: 'mx' } },
        ],
      };
    },
  });

  const results = await resolver.geocode('Medellín', {
    countryBias: 'co',
    regionBias: 'Antioquia',
    viewboxBias: [-76, 5, -75, 7],
    bounded: true,
    limit: 5,
  });

  assert.equal(results.length, 2);
  assert.deepEqual(results.map((result) => result.countryCode), ['co', 'mx']);
  assert.equal(requests[0].searchParams.get('q'), 'Medellín, Antioquia');
  assert.equal(requests[0].searchParams.get('countrycodes'), 'co');
  assert.equal(requests[0].searchParams.get('viewbox'), '-76,7,-75,5');
  assert.equal(requests[0].searchParams.get('bounded'), '1');

  await resolver.geocode('New York');
  assert.equal(requests[1].searchParams.get('countrycodes'), null);
});

test('reverse geocoding returns normalized address and provider attribution', async () => {
  let reverseUrl;
  const resolver = createTerritoryResolver({
    minIntervalMs: 0,
    fetchImpl: async (url) => {
      reverseUrl = new URL(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          osm_type: 'way', osm_id: 44, name: 'Calle 46A', display_name: 'Calle 46A, Bello, Antioquia, Colombia',
          lat: '6.33', lon: '-75.56', boundingbox: ['6.32', '6.34', '-75.57', '-75.55'],
          address: { road: 'Calle 46A', municipality: 'Bello', state: 'Antioquia', country: 'Colombia', country_code: 'co' },
        }),
      };
    },
  });

  const result = await resolver.reverseGeocode(-75.56, 6.33);
  assert.equal(reverseUrl.pathname, '/reverse');
  assert.equal(reverseUrl.searchParams.get('lon'), '-75.56');
  assert.equal(reverseUrl.searchParams.get('lat'), '6.33');
  assert.equal(result.properties.municipality, 'Bello');
  assert.equal(result.provider, 'OpenStreetMap Nominatim');
});

test('an explicit international country qualifier overrides the active territory bias', async () => {
  const requests = [];
  const resolver = createTerritoryResolver({
    minIntervalMs: 0,
    fetchImpl: async (url) => {
      requests.push(new URL(url));
      return { ok: true, status: 200, json: async () => [] };
    },
  });

  await resolver.geocode('Lima, Peru', { countryBias: 'co', regionBias: 'Antioquia', viewboxBias: [-76, 5, -75, 7] });
  await resolver.geocode('New York, USA', { countryBias: 'co', regionBias: 'Antioquia', viewboxBias: [-76, 5, -75, 7] });

  for (const url of requests) {
    assert.equal(url.searchParams.get('countrycodes'), null);
    assert.equal(url.searchParams.get('viewbox'), null);
    assert.equal(url.searchParams.get('q'), url.searchParams.get('q').includes('Lima') ? 'Lima, Peru' : 'New York, USA');
  }
});