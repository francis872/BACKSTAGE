const ApiError = require('../utils/ApiError');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const EXPLICIT_COUNTRIES = new Set([
  'colombia', 'peru', 'perú', 'usa', 'united states', 'estados unidos', 'mexico', 'méxico',
  'ecuador', 'venezuela', 'chile', 'argentina', 'brazil', 'brasil', 'canada', 'canadá',
  'spain', 'españa', 'france', 'francia', 'united kingdom', 'reino unido', 'uk',
  'germany', 'alemania', 'italy', 'italia', 'japan', 'japón', 'australia',
]);

function createTerritoryResolver({
  fetchImpl = globalThis.fetch,
  baseUrl = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org/search',
  userAgent = process.env.NOMINATIM_USER_AGENT || 'BACKSTAGE/3.1.0 (https://backstage-v310.vercel.app)',
  countryCodes = process.env.TERRITORY_COUNTRY_CODES || '',
  minIntervalMs = 1000,
  cacheMaxEntries = CACHE_MAX_ENTRIES,
  now = Date.now,
} = {}) {
  const cache = new Map();
  let requestQueue = Promise.resolve();
  let lastRequestAt = 0;

  async function queryProvider(url) {
    const previous = requestQueue;
    let release;
    requestQueue = new Promise((resolve) => { release = resolve; });
    await previous;

    try {
      const waitMs = Math.max(0, minIntervalMs - (now() - lastRequestAt));
      if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
      lastRequestAt = now();
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': userAgent },
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 429) throw new ApiError(503, 'El servicio territorial público está limitando solicitudes.');
      if (!response.ok) throw new ApiError(503, 'El servicio territorial público no está disponible.');
      return response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'El servicio territorial público no respondió.');
    } finally {
      release();
    }
  }

  function normalizedQuery(value) {
    const query = String(value || '').trim().replace(/\s+/g, ' ');
    if (query.length < 2 || query.length > 120) {
      throw new ApiError(400, 'La búsqueda debe tener entre 2 y 120 caracteres.');
    }
    return query;
  }

  function normalizeResult(item, query) {
    if (!item || typeof item !== 'object') return null;
    const address = item.address || {};
    const bounds = (item.boundingbox || []).map(Number);
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const [south, north, west, east] = bounds;
    const validBounds = [south, north, west, east].every(Number.isFinite);
    const name = item.name || address.city || address.town || address.municipality || address.county || query;
    return {
      id: `nominatim:${item.osm_type || 'place'}:${item.osm_id || `${query}:${latitude}:${longitude}`}`,
      name,
      displayName: item.display_name || name,
      type: item.type || item.category || 'place',
      country: address.country || null,
      countryCode: address.country_code || null,
      region: address.state || address.region || null,
      municipality: address.city || address.town || address.municipality || address.county || null,
      coordinates: [longitude, latitude],
      bounds: validBounds ? [west, south, east, north] : null,
      geometry: item.geojson || { type: 'Point', coordinates: [longitude, latitude] },
      provider: 'OpenStreetMap Nominatim',
      objectType: 'geocoded_place',
      properties: {
        name,
        displayName: item.display_name || name,
        type: item.type || item.category || 'place',
        city: address.city || address.town || address.municipality || null,
        municipality: address.city || address.town || address.municipality || address.county || null,
        region: address.state || address.region || null,
        country: address.country || null,
        countryCode: address.country_code || null,
        osmType: item.osm_type || null,
        osmId: item.osm_id || null,
      },
      sourceId: 'openstreetmap-nominatim',
      provenance: {
        source: 'OpenStreetMap Nominatim',
        dataset: 'OpenStreetMap geocoding index',
        license: 'ODbL-1.0',
        dataMode: 'derived',
        sourceCount: 1,
        confidence: null,
        updatedAt: null,
        query,
      },
    };
  }

  function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (now() >= entry.expiresAt) {
      cache.delete(key);
      return undefined;
    }
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
  }

  function cacheSet(key, value) {
    cache.delete(key);
    cache.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
    while (cache.size > Math.max(1, Number(cacheMaxEntries) || CACHE_MAX_ENTRIES)) {
      cache.delete(cache.keys().next().value);
    }
  }

  function applyContext(url, query, context) {
    const finalToken = query.split(/[;,]/).pop().trim().toLocaleLowerCase();
    const explicitCountry = EXPLICIT_COUNTRIES.has(finalToken) || /^[a-z]{2}$/i.test(finalToken);
    const countryBias = String(context.countryBias || '').trim();
    const regionBias = String(context.regionBias || '').trim();
    const contextualQuery = [query, explicitCountry ? '' : regionBias, explicitCountry || /^[a-z]{2}$/i.test(countryBias) ? '' : countryBias]
      .filter(Boolean)
      .join(', ');
    url.searchParams.set('q', contextualQuery);
    const countryCodeBias = explicitCountry ? '' : /^[a-z]{2}$/i.test(countryBias) ? countryBias : countryCodes;
    if (countryCodeBias) url.searchParams.set('countrycodes', countryCodeBias.toLowerCase());

    const viewbox = context.viewboxBias;
    if (!explicitCountry && Array.isArray(viewbox) && viewbox.length === 4 && viewbox.every((value) => Number.isFinite(Number(value)))) {
      const [west, south, east, north] = viewbox.map(Number);
      if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
        throw new ApiError(400, 'viewbox debe ser un rectángulo WGS84 válido.');
      }
      url.searchParams.set('viewbox', `${west},${north},${east},${south}`);
      if (context.bounded === true) url.searchParams.set('bounded', '1');
    }
    if (context.includeGeometry === true) url.searchParams.set('polygon_geojson', '1');
    return url;
  }

  async function geocode(value, context = {}) {
    const query = normalizedQuery(value);
    const limit = Math.min(5, Math.max(1, Number(context.limit) || 5));
    const key = `search:${JSON.stringify({ query: query.toLocaleLowerCase(), countryBias: context.countryBias || countryCodes, regionBias: context.regionBias || '', viewboxBias: context.viewboxBias || null, bounded: context.bounded === true, includeGeometry: context.includeGeometry === true, limit })}`;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;

    const url = applyContext(new URL(baseUrl), query, context);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', String(limit));
    const results = await queryProvider(url);
    const normalized = (Array.isArray(results) ? results : [])
      .map((item) => normalizeResult(item, query))
      .filter(Boolean);
    cacheSet(key, normalized);
    return normalized;
  }

  async function reverseGeocode(longitudeValue, latitudeValue, context = {}) {
    const longitude = Number(longitudeValue);
    const latitude = Number(latitudeValue);
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new ApiError(400, 'Las coordenadas deben estar dentro del rango WGS84.');
    }
    const zoom = Number(context.zoom || 18);
    if (!Number.isInteger(zoom) || zoom < 0 || zoom > 18) throw new ApiError(400, 'El nivel de detalle debe estar entre 0 y 18.');
    const key = `reverse:${longitude.toFixed(6)}:${latitude.toFixed(6)}:${zoom}`;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;

    const url = new URL(baseUrl);
    url.pathname = /\/search\/?$/.test(url.pathname)
      ? url.pathname.replace(/\/search\/?$/, '/reverse')
      : `${url.pathname.replace(/\/$/, '')}/reverse`;
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('zoom', String(zoom));
    const item = await queryProvider(url);
    const normalized = item ? normalizeResult(item, `${longitude},${latitude}`) : null;
    cacheSet(key, normalized);
    return normalized;
  }

  return {
    geocode,
    reverseGeocode,
    async resolve(query, context) {
      return (await geocode(query, context))[0] || null;
    },
  };
}

const defaultResolver = createTerritoryResolver();

module.exports = {
  createTerritoryResolver,
  geocodeTerritories: (query, context) => defaultResolver.geocode(query, context),
  reverseGeocode: (longitude, latitude, context) => defaultResolver.reverseGeocode(longitude, latitude, context),
  resolveTerritory: (query, context) => defaultResolver.resolve(query, context),
};