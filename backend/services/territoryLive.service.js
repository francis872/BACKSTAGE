const ApiError = require('../utils/ApiError');
const { createPublicMapEvidenceService } = require('./publicMapEvidence.service');

function validateCoordinates(lat, lng) {
  const valid = (value) => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
  if (!valid(lat) || !valid(lng) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) {
    throw new ApiError(400, 'Selecciona coordenadas geográficas válidas.');
  }
  return [Number(lng), Number(lat)];
}

function createTerritoryLiveService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const vectorMap = createPublicMapEvidenceService({ fetchImpl, now });
  const cache = new Map();
  const pending = new Map();
  const failures = new Map();
  const providerFailures = new Map();
  async function cached(key, ttl, query) {
    const entry = cache.get(key);
    if (entry && now() - entry.at < ttl) return entry.value;
    const failed = failures.get(key);
    if (failed && now() - failed.at < 60000) throw failed.error;
    if (pending.has(key)) return pending.get(key);
    const task = query().then((value) => {
      cache.set(key, { at: now(), value });
      failures.delete(key);
      while (cache.size > 256) cache.delete(cache.keys().next().value);
      return value;
    }).catch((error) => {
      failures.set(key, { at: now(), error });
      while (failures.size > 256) failures.delete(failures.keys().next().value);
      throw error;
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  async function json(url, options = {}) {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new ApiError(503, 'La fuente territorial no está disponible temporalmente.');
    const body = await response.text();
    if (body.length > 4000000) throw new ApiError(503, 'La respuesta territorial supera el tamaño permitido.');
    return JSON.parse(body);
  }
  function weather(lat, lng) {
    const coordinates = validateCoordinates(lat, lng);
    // Cache keys keep the exact requested point; a nearby grid cell is never substituted silently.
    return cached(`weather:${coordinates}`, 5 * 60000, async () => {
      const params = new URLSearchParams({ latitude: String(coordinates[1]), longitude: String(coordinates[0]),
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code', forecast_days: '3', timezone: 'UTC' });
      const key = process.env.OPEN_METEO_API_KEY;
      if (key) params.set('apikey', key);
      const host = key ? 'customer-api.open-meteo.com' : 'api.open-meteo.com';
      const data = await json(`https://${host}/v1/forecast?${params}`);
      if (!data.current?.time || !data.current_units) throw new ApiError(503, 'La fuente meteorológica no devolvió condiciones actuales.');
      return { status: 'available', coordinates, gridCoordinates: [data.longitude, data.latitude],
        current: data.current, units: data.current_units, daily: data.daily || null, dailyUnits: data.daily_units || null,
        elevationM: Number.isFinite(data.elevation) ? data.elevation : null,
        validAt: `${data.current.time}Z`, fetchedAt: new Date(now()).toISOString(),
        source: { name: 'Open-Meteo', url: 'https://open-meteo.com/', license: 'CC BY 4.0', dataMode: 'modelled' } };
    });
  }
  function mapContext(lat, lng, radiusM = 1200) {
    const coordinates = validateCoordinates(lat, lng);
    const radius = Number(radiusM);
    if (!Number.isFinite(radius) || radius < 100 || radius > 5000) throw new ApiError(400, 'El radio debe estar entre 100 y 5000 metros.');
    return cached(`osm:${coordinates}:${radius}`, 15 * 60000, async () => {
      const query = `[out:json][timeout:10];(nwr(around:${radius},${coordinates[1]},${coordinates[0]})[amenity];nwr(around:${radius},${coordinates[1]},${coordinates[0]})[public_transport];nwr(around:${radius},${coordinates[1]},${coordinates[0]})[leisure=park];);out center 250;`;
      const endpoints = process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : [
        'https://overpass.private.coffee/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      ];
      let data;
      let providerUrl;
      for (const endpoint of endpoints) {
        if (providerFailures.has(endpoint) && now() - providerFailures.get(endpoint) < 5 * 60000) continue;
        try {
          // Both public instances document worldwide coverage. Try each at most once.
          data = await json(endpoint, {
            method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BACKSTAGE-Territorial/3.1 (https://backstage-web-seven.vercel.app)' }, body: new URLSearchParams({ data: query }).toString() });
          if (!Array.isArray(data.elements)) { data = null; providerFailures.set(endpoint, now()); continue; }
          providerUrl = endpoint;
          providerFailures.delete(endpoint);
          break;
        } catch { data = null; providerFailures.set(endpoint, now()); }
      }
      if (!data) return vectorMap.mapContext(lat, lng, radius);
      if (!Array.isArray(data.elements)) throw new ApiError(503, 'La fuente cartográfica no devolvió una muestra válida.');
      const features = data.elements.slice(0, 250).flatMap((item) => {
        const point = item.center || item;
        if (!Number.isFinite(point.lon) || !Number.isFinite(point.lat)) return [];
        return [{ type: 'Feature', id: `${item.type}/${item.id}`, geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
          properties: { ...item.tags, osmId: `${item.type}/${item.id}`, name: item.tags?.name || item.tags?.amenity || item.tags?.public_transport || 'Parque', source: 'OpenStreetMap' } }];
      });
      const count = (predicate) => features.filter((feature) => predicate(feature.properties)).length;
      return { status: 'available', coordinates, radiusM: radius, limited: data.elements.length >= 250,
        counts: { mappedPlaces: features.length, health: count((p) => ['hospital', 'clinic', 'doctors', 'pharmacy'].includes(p.amenity)),
          education: count((p) => ['school', 'university', 'college', 'kindergarten'].includes(p.amenity)),
          transport: count((p) => Boolean(p.public_transport) || ['bus_station', 'ferry_terminal'].includes(p.amenity)), parks: count((p) => p.leisure === 'park') },
        geojson: { type: 'FeatureCollection', features }, fetchedAt: new Date(now()).toISOString(),
        sourceUpdatedAt: data.osm3s?.timestamp_osm_base || null,
        source: { name: 'OpenStreetMap · Overpass', url: 'https://www.openstreetmap.org/copyright', providerUrl, license: 'ODbL 1.0' } };
    });
  }
  async function liveContext(lat, lng, radius) {
    const coordinates = validateCoordinates(lat, lng);
    if (radius !== undefined && (!Number.isFinite(Number(radius)) || Number(radius) < 100 || Number(radius) > 5000)) throw new ApiError(400, 'El radio debe estar entre 100 y 5000 metros.');
    const outcomes = await Promise.allSettled([weather(lat, lng), mapContext(lat, lng, radius)]);
    const section = (result) => result.status === 'fulfilled' ? result.value : { status: 'unavailable', message: 'La fuente no respondió. Puedes volver a consultar.' };
    return { coordinates, fetchedAt: new Date(now()).toISOString(), weather: section(outcomes[0]), cartography: section(outcomes[1]) };
  }
  return { weather, mapContext, liveContext };
}
module.exports = { validateCoordinates, createTerritoryLiveService, ...createTerritoryLiveService() };
