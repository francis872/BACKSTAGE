const test = require('node:test');
const assert = require('node:assert/strict');
const { createTerritoryLiveService, validateCoordinates } = require('../services/territoryLive.service');
const response = (value) => ({ ok: true, text: async () => JSON.stringify(value) });
const conditions = { latitude: 6.2, longitude: -75.6, elevation: 1490, current: { time: '2026-10-11T12:00', temperature_2m: 0, precipitation: null, weather_code: 0 }, current_units: { temperature_2m: '°C', precipitation: 'mm' } };

test('rechaza coordenadas ausentes y fuera de rango, preservando el cero geográfico', () => {
  for (const pair of [[null, 1], ['', 1], [91, 0], [0, -181], [undefined, 0], ['x', 2]]) assert.throws(() => validateCoordinates(...pair), { statusCode: 400 });
  assert.deepEqual(validateCoordinates('0', '0'), [0, 0]);
});
test('consulta el punto seleccionado y conserva valores nulos, unidades y procedencia del modelo', async () => {
  let url;
  const service = createTerritoryLiveService({ fetchImpl: async (value) => { url = new URL(value); return response(conditions); } });
  const weather = await service.weather(24.4539, 54.3773);
  assert.equal(url.searchParams.get('latitude'), '24.4539');
  assert.equal(url.searchParams.get('longitude'), '54.3773');
  assert.deepEqual(weather.coordinates, [54.3773, 24.4539]);
  assert.equal(weather.current.temperature_2m, 0);
  assert.equal(weather.current.precipitation, null);
  assert.equal(weather.source.dataMode, 'modelled');
  assert.equal(weather.validAt, '2026-10-11T12:00Z');
  assert.equal(weather.population, undefined);
  assert.equal(weather.risk, undefined);
});
test('deduplica solicitudes simultáneas, reutiliza la caché y la renueva al vencer', async () => {
  let requests = 0, time = 0;
  const service = createTerritoryLiveService({ now: () => time, fetchImpl: async () => { requests++; return response(conditions); } });
  await Promise.all([service.weather(0, 0), service.weather(0, 0)]);
  await service.weather(0, 0);
  assert.equal(requests, 1);
  time = 300001;
  await service.weather(0, 0);
  assert.equal(requests, 2);
});
test('la cartografía limita radio y tamaño y conserva la fecha y atribución OSM', async () => {
  let body;
  const service = createTerritoryLiveService({ fetchImpl: async (_, options) => {
    body = options.body;
    return response({ osm3s: { timestamp_osm_base: '2026-10-11T12:00:00Z' }, elements: [
      { type: 'node', id: 1, lat: 6.2, lon: -75.6, tags: { amenity: 'hospital', name: 'Hospital registrado' } },
      { type: 'way', id: 2, center: { lat: 6.21, lon: -75.61 }, tags: { public_transport: 'platform' } },
      { type: 'node', id: 3, lat: 6.22, lon: -75.62, tags: { leisure: 'park' } },
    ] });
  } });
  await assert.rejects(() => service.liveContext(6, -75, '9000'), { statusCode: 400 });
  const map = await service.mapContext(6.2, -75.6);
  assert.match(new URLSearchParams(body).get('data'), /out center 250/);
  assert.equal(map.counts.health, 1);
  assert.equal(map.counts.transport, 1);
  assert.equal(map.counts.parks, 1);
  assert.equal(map.source.license, 'ODbL 1.0');
  assert.equal(map.sourceUpdatedAt, '2026-10-11T12:00:00Z');
  assert.equal(map.traffic, undefined);
});
test('una fuente caída no oculta la otra ni fabrica valores meteorológicos', async () => {
  let requests = 0;
  const service = createTerritoryLiveService({ fetchImpl: async (url) => {
    requests++;
    if (String(url).includes('open-meteo')) throw new Error('provider offline');
    return response({ elements: [] });
  } });
  const result = await service.liveContext(6.2, -75.6);
  assert.equal(result.weather.status, 'unavailable');
  assert.equal(result.weather.current, undefined);
  assert.equal(result.cartography.status, 'available');
  assert.equal(result.cartography.counts.mappedPlaces, 0);
  await service.liveContext(6.2, -75.6);
  assert.equal(requests, 2, 'reutiliza el resultado y la pausa de la fuente caída');
});
test('consulta una alternativa cartográfica cuando falla la primera y comunica su procedencia', async () => {
  const urls = [];
  const service = createTerritoryLiveService({ fetchImpl: async (url) => {
    urls.push(String(url));
    if (String(url).includes('private.coffee')) return { ok: false };
    return response({ elements: [] });
  } });
  const map = await service.mapContext(6.2, -75.6);
  assert.equal(urls.length, 2);
  assert.equal(map.status, 'available');
  assert.match(map.source.providerUrl, /maps.mail.ru/);
});
test('los endpoints actuales requieren sesión y contexto de organización', async (context) => {
  const app = require('../index');
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  for (const path of ['/spatial/weather?lat=0&lng=0', '/spatial/live-context?lat=0&lng=0', '/spatial/intent?q=Medellin']) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    assert.equal(res.status, 401);
  }
});
