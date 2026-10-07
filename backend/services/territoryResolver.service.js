const ApiError = require('../utils/ApiError');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function createTerritoryResolver({
  fetchImpl = globalThis.fetch,
  baseUrl = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org/search',
  userAgent = process.env.NOMINATIM_USER_AGENT || 'BACKSTAGE/3.1.0 (https://backstage-v310.vercel.app)',
  countryCodes = process.env.TERRITORY_COUNTRY_CODES || 'co',
  minIntervalMs = 1000,
  now = Date.now,
} = {}) {
  const cache = new Map();
  let requestQueue = Promise.resolve();
  let lastRequestAt = 0;

  async function queryProvider(query) {
    const previous = requestQueue;
    let release;
    requestQueue = new Promise((resolve) => { release = resolve; });
    await previous;

    try {
      const waitMs = Math.max(0, minIntervalMs - (now() - lastRequestAt));
      if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
      lastRequestAt = now();

      const url = new URL(baseUrl);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('limit', '1');
      if (countryCodes) url.searchParams.set('countrycodes', countryCodes);

      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': userAgent },
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 429) throw new ApiError(503, 'El servicio territorial público está limitando solicitudes.');
      if (!response.ok) throw new ApiError(503, 'El servicio territorial público no está disponible.');
      const results = await response.json();
      const item = Array.isArray(results) ? results[0] : null;
      if (!item) return null;

      const [south, north, west, east] = (item.boundingbox || []).map(Number);
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      if (![latitude, longitude, south, north, west, east].every(Number.isFinite)) return null;

      const address = item.address || {};
      const name = item.name || address.city || address.town || address.municipality || address.county || query;
      return {
        id: `nominatim:${item.osm_type || 'place'}:${item.osm_id || query}`,
        objectType: 'territory',
        properties: {
          name,
          displayName: item.display_name || name,
          city: address.city || address.town || address.municipality || null,
          region: address.state || address.region || null,
          country: address.country || 'Colombia',
          osmType: item.osm_type || null,
          osmId: item.osm_id || null,
        },
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
        bounds: [west, south, east, north],
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
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'El servicio territorial público no respondió.');
    } finally {
      release();
    }
  }

  return {
    async resolve(query) {
      const normalizedQuery = String(query || '').trim().replace(/\s+/g, ' ');
      if (normalizedQuery.length < 2 || normalizedQuery.length > 120) {
        throw new ApiError(400, 'El nombre territorial debe tener entre 2 y 120 caracteres.');
      }
      const key = `${countryCodes}:${normalizedQuery.toLocaleLowerCase()}`;
      const cached = cache.get(key);
      if (cached && now() < cached.expiresAt) return cached.value;

      const value = await queryProvider(normalizedQuery);
      cache.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
      return value;
    },
  };
}

const defaultResolver = createTerritoryResolver();

module.exports = { createTerritoryResolver, resolveTerritory: (query) => defaultResolver.resolve(query) };