const test = require('node:test');
const assert = require('node:assert/strict');
const { createSoiGeoService, coordinate } = require('./soiGeo.service');

const points = [[-80.1918, 25.7617], [-118.2437, 34.0522]];
const fakeRoute = { distance: 4400000, duration: 145000, geometry: { type: 'LineString', coordinates: points }, legs: [{ distance: 4400000, duration: 145000, summary: 'fixture road', steps: [{ name: 'fixture road', distance: 10, duration: 1, mode: 'driving', maneuver: { type: 'depart' } }] }] };

test('[unit/isolated] WGS84 rejects blanks, null, booleans and out of range values', () => {
  for (const value of [[null, 1], ['', 1], [false, 1], [181, 1], [1, -91], [NaN, 0]]) assert.throws(() => coordinate(value), { statusCode: 400 });
  assert.deepEqual(coordinate(['-80.1918', '25.7617']), points[0]);
});

test('[unit/isolated] geocoder reuses resolver and labels precision without invented accuracy', async () => {
  let observed;
  const service = createSoiGeoService({ resolver: { geocodeTerritories: async (q, context) => { observed = { q, context }; return [{ name: 'Miami', type: 'city', coordinates: points[0] }]; } } });
  const result = await service.geocode(5, { q: 'Miami, USA', countryBias: 'us' });
  assert.equal(observed.q, 'Miami, USA');
  assert.equal(observed.context.countryBias, 'us');
  assert.equal(result.results[0].precision.level, 'locality');
  assert.equal(result.results[0].precision.accuracyM, null);
  assert.equal(result.results[0].validation.address, 'provider_match_unverified');
  await assert.rejects(() => service.geocode(null, { q: 'Miami' }), { statusCode: 401 });
  await assert.rejects(() => service.geocode(5, { q: 'Miami', viewbox: '0,0,0,1' }), { statusCode: 400 });
});

test('[unit/isolated] reverse preserves requested point distinct from provider match', async () => {
  const service = createSoiGeoService({ resolver: { reverseGeocode: async () => ({ name: 'Nearby', type: 'house', coordinates: [-80.192, 25.762] }) } });
  const result = await service.reverse(5, { lng: -80.1918, lat: 25.7617 });
  assert.deepEqual(result.requestedCoordinates, points[0]);
  assert.notDeepEqual(result.result.coordinates, result.requestedCoordinates);
  assert.equal(result.validation.result, 'nearest_provider_match_unverified');
});

test('[unit/isolated] explicit longitude,latitude resolves without a network call', async () => {
  let network = false;
  const service = createSoiGeoService({ resolver: { geocodeTerritories: async () => { network = true; throw new Error('must not call'); } } });
  const result = await service.geocode(5, { q: '-80.1918, 25.7617' });
  assert.deepEqual(result.results[0].coordinates, points[0]);
  assert.equal(result.results[0].precision.level, 'user_coordinates');
  assert.equal(result.source.dataMode, 'user_provided');
  assert.equal(result.validation.result, 'user_coordinates');
  await assert.rejects(() => service.geocode(5, { q: '200,25' }), { statusCode: 400 });
  assert.equal(network, false);
});

test('[unit/isolated] capabilities lists only explicitly available routing profiles', () => {
  const service = createSoiGeoService({ photonUrl: '', osrmUrls: { driving: 'https://route.example', walking: 'https://walk.example' } });
  assert.deepEqual(service.capabilities(5).profiles, ['driving', 'walking']);
  assert.equal(service.capabilities(5).autocomplete, false);
  assert.throws(() => service.capabilities(null), { statusCode: 401 });
});

test('[unit/isolated] autocomplete never calls public Nominatim', async () => {
  let calls = 0;
  const service = createSoiGeoService({ photonUrl: '', fetchImpl: async () => { calls += 1; } });
  await assert.rejects(() => service.autocomplete(5, { q: 'Mia' }), { statusCode: 503 });
  assert.equal(calls, 0);
});

test('[unit/isolated] Photon autocomplete has source, coordinates and unverified precision', async () => {
  const service = createSoiGeoService({ photonUrl: 'https://photon.example/api/', fetchImpl: async (url) => {
    assert.equal(url.searchParams.get('q'), 'Mia');
    return { ok: true, json: async () => ({ features: [{ geometry: { coordinates: points[0] }, properties: { name: 'Miami', osm_type: 'R', osm_id: 1, osm_value: 'city' } }] }) };
  } });
  const result = await service.autocomplete(5, { q: 'Mia' });
  assert.equal(result.results[0].source.name, 'Photon / OpenStreetMap');
  assert.equal(result.results[0].precision.level, 'locality');
});

test('[unit/isolated] OSRM contract requests road geometry, stops, steps and alternatives', async () => {
  let url;
  const service = createSoiGeoService({ osrmUrls: { driving: 'https://osrm.example' }, fetchImpl: async (value) => {
    url = value;
    return { ok: true, json: async () => ({ code: 'Ok', routes: [fakeRoute, fakeRoute], waypoints: points.map((location) => ({ location })) }) };
  } });
  const result = await service.route(5, { coordinates: points });
  assert.equal(url.pathname, '/route/v1/driving/-80.1918,25.7617;-118.2437,34.0522');
  assert.equal(url.searchParams.get('steps'), 'true');
  assert.equal(url.searchParams.get('geometries'), 'geojson');
  assert.equal(result.routes[0].durationS, 145000);
  assert.equal(result.routes[0].steps[0].maneuver.type, 'depart');
  assert.equal(result.validation.alternatives, 1);
  assert.equal(result.source.traffic, 'not_live');
  await assert.rejects(() => service.route(5, { coordinates: points, profile: 'walking' }), { statusCode: 503 });
});

test('[unit/isolated] route never replaces no-route, failures or incomplete provider response with straight line', async () => {
  for (const body of [{ code: 'NoRoute' }, { code: 'NoSegment' }, { code: 'Ok', routes: [] }, { code: 'Ok', routes: [{ ...fakeRoute, geometry: null }] }, { code: 'Ok', routes: [{ ...fakeRoute, legs: [] }] }]) {
    const service = createSoiGeoService({ fetchImpl: async () => ({ ok: true, json: async () => body }) });
    await assert.rejects(() => service.route(5, { coordinates: points }), { statusCode: body.code === 'Ok' ? 502 : 422 });
  }
  const service = createSoiGeoService({ fetchImpl: async () => { throw new Error('network failure'); } });
  await assert.rejects(() => service.route(5, { coordinates: points }), { statusCode: 503 });
});

test('[unit/isolated] ordered intermediate stops remain in OSRM request and response legs', async () => {
  const via = [points[0], [-95.3698, 29.7604], points[1]];
  const service = createSoiGeoService({ fetchImpl: async (url) => {
    assert.ok(url.pathname.includes('-95.3698,29.7604'));
    return { ok: true, json: async () => ({ code: 'Ok', routes: [{ ...fakeRoute, legs: [fakeRoute.legs[0], fakeRoute.legs[0]] }] }) };
  } });
  const result = await service.route(5, { coordinates: via, alternatives: false });
  assert.equal(result.routes[0].legs.length, 2);
  assert.deepEqual(result.requestedCoordinates, via);
});

test('[unit/isolated] DEM samples actual response with 90m resolution and no synthetic fallback', async () => {
  const service = createSoiGeoService({ fetchImpl: async (url) => {
    assert.equal(url.searchParams.get('latitude'), '25.7617');
    return { ok: true, json: async () => ({ elevation: [8] }) };
  } });
  const result = await service.elevation(5, { lng: points[0][0], lat: points[0][1] });
  assert.equal(result.elevationM, 8);
  assert.equal(result.source.dataMode, 'modelled');
  assert.equal(result.precision.verticalAccuracyM, null);
  const missing = createSoiGeoService({ fetchImpl: async () => ({ ok: true, json: async () => ({ elevation: [null] }) }) });
  await assert.rejects(() => missing.elevation(5, { lng: 0, lat: 0 }), { statusCode: 502 });
});

test('[unit/isolated] DEM profile follows input polyline and computes sample ascent/descent', async () => {
  const service = createSoiGeoService({ fetchImpl: async (url) => {
    assert.equal(url.searchParams.get('latitude').split(',').length, 3);
    return { ok: true, json: async () => ({ elevation: [5, 15, 10] }) };
  } });
  const result = await service.profile(5, { coordinates: [[0, 0], [0.01, 0], [0.01, 0.01]], samples: 3 });
  assert.ok(Math.abs(result.samples[1].coordinates[0] - 0.01) < 0.000001);
  assert.equal(result.ascentM, 10);
  assert.equal(result.descentM, 5);
  assert.equal(result.validation.hydrologyValidated, false);
  await assert.rejects(() => service.profile(5, { coordinates: points, samples: 101 }), { statusCode: 400 });
});

test('[unit/isolated] real DEM surface uses provider grid and compatible terrain fields, then cache', async () => {
  let calls = 0;
  const service = createSoiGeoService({ fetchImpl: async (url) => {
    calls += 1;
    assert.equal(url.searchParams.get('latitude').split(',').length, 64);
    return { ok: true, json: async () => ({ elevation: Array.from({ length: 64 }, (_, i) => i * 2) }) };
  } });
  const result = await service.surface(5, { bbox: '-75,6,-74.99,6.01', resolution: 8 });
  assert.equal(result.dataMode, 'dem');
  assert.equal(result.resolution, 8);
  assert.equal(result.elevation.length, 8);
  assert.equal(result.elevation[7][7], 126);
  assert.equal(result.statistics.maxElevation, 126);
  assert.equal(result.slope.length, 8);
  assert.ok(Array.isArray(result.contours));
  assert.ok(result.contours.length > 0);
  assert.equal(result.provenance.validated, false);
  assert.equal(result.provenance.data_type, 'EXTERNAL_API');
  assert.ok(result.statistics.cellSizeXM > 0);
  await service.surface(5, { bbox: '-75,6,-74.99,6.01', resolution: 8 });
  assert.equal(calls, 1);
  await service.surface(6, { bbox: '-75,6,-74.99,6.01', resolution: 8 });
  assert.equal(calls, 2, 'cache does not cross tenant context');
});

test('[unit/isolated] DEM surface rejects excess resolution and missing provider data without procedural fallback', async () => {
  let calls = 0;
  const service = createSoiGeoService({ fetchImpl: async () => { calls += 1; throw new Error('unavailable'); } });
  await assert.rejects(() => service.surface(5, { bbox: '0,0,1,1', resolution: 11 }), { statusCode: 400 });
  await assert.rejects(() => service.surface(5, { bbox: '1,1,0,0', resolution: 8 }), { statusCode: 400 });
  assert.equal(calls, 0);
  await assert.rejects(() => service.surface(5, { bbox: '0,0,1,1', resolution: 8 }), { statusCode: 503 });
});

test('[unit/isolated] DEM per-organization quotas stop excess samples before provider calls and reset', async () => {
  let time = 0;
  let calls = 0;
  const service = createSoiGeoService({ now: () => time, fetchImpl: async () => { calls += 1; return { ok: true, json: async () => ({ elevation: Array(100).fill(1) }) }; } });
  for (let i = 0; i < 10; i += 1) await service.profile(5, { coordinates: points, samples: 100 });
  await assert.rejects(() => service.profile(5, { coordinates: points, samples: 100 }), { statusCode: 429 });
  assert.equal(calls, 10);
  await service.profile(6, { coordinates: points, samples: 100 });
  time = 60001;
  await service.profile(5, { coordinates: points, samples: 100 });
  assert.equal(calls, 12);
  await assert.rejects(() => service.profile(5, { coordinates: points, extra: 'x'.repeat(300000) }), { statusCode: 413 });
});

test('[unit/Mongo isolated] saved road plans preserve provider data and scope all operations to organization', async () => {
  const calls = [];
  const session = { fixture: true };
  let saved;
  const plans = {
    insertOne: async (document, options) => { assert.equal(options.session, session); saved = { ...document, _id: 'internal' }; calls.push(['insert', document.organization_id]); },
    findOne: async (filter) => { calls.push(['get', filter]); return saved && filter.organization_id === saved.organization_id && filter.route_plan_id === saved.route_plan_id ? saved : null; },
    find: (filter, options) => {
      calls.push(['list', filter]); assert.deepEqual(options.projection, { _id: 0, result: 0 });
      return { sort: (order) => { assert.deepEqual(order, { route_plan_id: -1 }); return { limit: (limit) => { assert.equal(limit, 50); return { toArray: async () => [] }; } }; } };
    },
  };
  const repository = { collection: (name) => name === 'soi_route_plans' ? plans : { findOne: async (filter) => { calls.push(['operation', filter]); return filter.organization_id === 5 ? { operation_id: 7 } : null; } } };
  const mongoInfrastructure = {
    getMongoDatabase: async () => repository,
    withMongoTransaction: async (fn) => fn(repository, session),
    nextId: async (kind, activeSession) => { assert.equal(kind, 'soi_route_plans'); assert.equal(activeSession, session); return 42; },
    cleanDocument: ({ _id, ...document }) => document,
  };
  const service = createSoiGeoService({ mongoInfrastructure, fetchImpl: async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [fakeRoute] }) }) });
  const result = await service.saveRoutePlan(5, { name: 'Road plan', operation_id: 7, coordinates: points, result: { forged: true } }, 3);
  assert.equal(result.data.route_plan_id, 42);
  assert.equal(result.data.result.source.name, 'OSRM / OpenStreetMap');
  assert.equal(result.data.result.routes[0].distanceM, 4400000);
  assert.equal(result.data.result.forged, undefined);
  assert.equal(result.data.organization_id, 5);
  assert.equal(result.data._id, undefined);
  assert.equal((await service.getRoutePlan(5, 42)).data.route_plan_id, 42);
  await assert.rejects(() => service.getRoutePlan(6, 42), { statusCode: 404 });
  await assert.rejects(() => service.saveRoutePlan(6, { name: 'Foreign', operation_id: 7, coordinates: points }, 3), { statusCode: 404 });
  assert.deepEqual((await service.listRoutePlans(5)).data, []);
  assert.ok(calls.filter(([kind]) => kind === 'operation').every(([, filter]) => Object.keys(filter).includes('organization_id')));
});

test('[unit/Mongo isolated] MongoDB failure does not fall back to SQL or memory', async () => {
  const unavailable = Object.assign(new Error('fixture database unavailable'), { name: 'MongoNetworkError' });
  const service = createSoiGeoService({ mongoInfrastructure: { getMongoDatabase: async () => { throw unavailable; } } });
  await assert.rejects(() => service.listRoutePlans(5), unavailable);
  await assert.rejects(() => service.getRoutePlan(5, 42), unavailable);
});

test('[integration/live opt-in] Miami to Los Angeles real road route', { skip: process.env.SOI_LIVE_GEO_TEST !== '1' }, async () => {
  const service = createSoiGeoService();
  const result = await service.route(1, { coordinates: points, alternatives: true });
  assert.ok(result.routes[0].distanceM > 3500000);
  assert.ok(result.routes[0].distanceM < 6000000);
  assert.ok(result.routes[0].durationS > 100000);
  assert.ok(result.routes[0].geometry.coordinates.length > 100);
  assert.ok(result.routes[0].steps.length > 10);
  console.log(JSON.stringify({ verification: 'live_osrm_miami_los_angeles', distanceM: result.routes[0].distanceM, durationS: result.routes[0].durationS, geometryPoints: result.routes[0].geometry.coordinates.length, steps: result.routes[0].steps.length, observedAt: result.source.observedAt }));
});
