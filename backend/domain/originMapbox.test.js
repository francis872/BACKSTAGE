const test = require('node:test');
const assert = require('node:assert/strict');
const { createGeographyService } = require('../services/geography.service');
const feature = { type: 'Feature', geometry: { type: 'Point', coordinates: [-76.653, 5.691] }, properties: { mapbox_id: 'fixture:quibdo', name: 'Quibdó', feature_type: 'place', full_address: 'Quibdó, Chocó, Colombia', context: { country: { name: 'Colombia', country_code: 'CO' }, region: { name: 'Chocó' } } } };

test('Mapbox autocomplete is disabled without both server token and permanent storage configuration', async () => {
  for (const options of [{ mapboxToken: '', mapboxPermanent: true }, { mapboxToken: 'fixture-private-token', mapboxPermanent: false }]) {
    const service = createGeographyService({ ...options, photonUrl: '', fetchImpl: () => { throw Error('must not contact provider'); } });
    assert.equal(service.capabilities(1).autocomplete, false);
    assert(!JSON.stringify(service.capabilities(1)).includes('fixture-private-token'));
    await assert.rejects(service.autocomplete(1, { q: 'Quib' }), e => e.statusCode === 503);
  }
});

test('authorized autocomplete requests permanent Mapbox Geocoding and preserves typed provenance without secrets', async () => {
  let requested;
  const service = createGeographyService({ mapboxToken: 'fixture-private-token', mapboxPermanent: true, photonUrl: '', fetchImpl: async url => { requested = new URL(url); return { ok: true, json: async () => ({ features: [feature], attribution: 'Fixture attribution' }) }; } });
  const result = await service.autocomplete(1, { q: 'Quib', countryBias: 'CO' });
  assert.equal(requested.origin, 'https://api.mapbox.com');
  assert.equal(requested.pathname, '/search/geocode/v6/forward');
  for (const [key, value] of Object.entries({ permanent: 'true', autocomplete: 'true', language: 'es', country: 'co', access_token: 'fixture-private-token' })) assert.equal(requested.searchParams.get(key), value);
  assert.deepEqual(result.results[0].coordinates, feature.geometry.coordinates);
  assert.equal(result.results[0].precision.level, 'locality');
  assert.equal(result.results[0].validation.address, 'provider_match_unverified');
  assert.equal(result.results[0].source.storage, 'permanent');
  assert.equal(result.results[0].country, 'Colombia');
  assert(!JSON.stringify(result).includes('fixture-private-token'));
  assert.equal(service.capabilities(1).autocomplete_provider, 'mapbox_geocoding_v6_permanent');
});

test('Mapbox errors and invalid provider geometry fail safely without leaking URLs, credentials or replacement locations', async () => {
  for (const fetchImpl of [async url => { throw Error(String(url)); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ features: [{ ...feature, geometry: { type: 'Point', coordinates: [181, 4] } }] }) })]) {
    const service = createGeographyService({ mapboxToken: 'fixture-private-token', mapboxPermanent: true, fetchImpl });
    await assert.rejects(service.autocomplete(1, { q: 'Quib' }), error => [502, 503].includes(error.statusCode) && !error.message.includes('fixture-private-token') && !error.message.includes('https://'));
  }
});

test('Mapbox validates requests and keeps existing explicit geocoder independent', async () => {
  let calls = 0;
  const service = createGeographyService({ mapboxToken: 'fixture-private-token', mapboxPermanent: true, photonUrl: '', fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ features: [] }) }; }, resolver: { geocodeTerritories: async () => [] } });
  for (const query of [{ q: 'a;b' }, { q: 'name', countryBias: { $ne: '' } }, { q: Array(21).fill('name').join(' ') }]) await assert.rejects(service.autocomplete(1, query), e => e.statusCode === 400);
  assert.equal(calls, 0);
  await assert.rejects(service.autocomplete(null, { q: 'Quib' }), e => e.statusCode === 401);
  assert.deepEqual((await service.geocode(1, { q: 'Quibdó' })).results, []);
  assert.deepEqual((await service.autocomplete(1, { q: 'No match' })).results, []);
});
