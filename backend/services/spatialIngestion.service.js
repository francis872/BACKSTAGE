const ApiError = require('../utils/ApiError');
const { createSpatialStore } = require('../spatial/store');
const { SpatialIngestionPipeline } = require('../spatial/ingestion');
const TileCache = require('../spatial/tileCache');
const { fetchGeoJSON } = require('../spatial/remoteSources');

let pipelinePromise;
const tileCache = new TileCache({
  maxEntries: Number(process.env.SPATIAL_TILE_CACHE_MAX || 500),
  ttlMs: Number(process.env.SPATIAL_TILE_CACHE_TTL_MS || 300000),
});

function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const store = createSpatialStore();
      await store.initialize();
      return new SpatialIngestionPipeline(store);
    })();
  }
  return pipelinePromise;
}

function scopedWorldId(organizationId, requested = 'earth') {
  const name = String(requested).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) throw new ApiError(400, 'worldId contiene caracteres inválidos.');
  return `${organizationId}:${name}`;
}

function translate(error) {
  if (error instanceof ApiError) throw error;
  const status = /no encontrada/i.test(error.message) ? 404 : 400;
  throw new ApiError(status, error.message);
}

async function registerSource(organizationId, payload) {
  try {
    const pipeline = await getPipeline();
    return pipeline.registerSource({ ...payload, organizationId });
  } catch (error) { return translate(error); }
}

async function ingestGeoJSON(organizationId, payload) {
  try {
    const pipeline = await getPipeline();
    const result = await pipeline.ingestGeoJSON({
      organizationId,
      worldId: scopedWorldId(organizationId, payload.worldId),
      sourceId: payload.sourceId,
      collection: payload.collection,
      minZoom: Number(payload.minZoom ?? payload.zoom ?? 8),
      maxZoom: Number(payload.maxZoom ?? payload.zoom ?? 12),
    });
    tileCache.clear();
    return result;
  } catch (error) { return translate(error); }
}

async function ingestRemote(organizationId, payload) {
  try {
    const collection = await fetchGeoJSON(payload.sourceUrl);
    return ingestGeoJSON(organizationId, { ...payload, collection });
  } catch (error) { return translate(error); }
}

async function getTile(organizationId, params, query) {
  try {
    const pipeline = await getPipeline();
    const worldId = scopedWorldId(organizationId, query.worldId);
    const cacheKey = `${organizationId}:${worldId}:${params.z}/${params.x}/${params.y}`;
    const cached = tileCache.get(cacheKey);
    if (cached) return { ...cached, metadata: { ...cached.metadata, cache: 'hit' } };
    const result = await pipeline.getTile({
      organizationId,
      worldId,
      z: Number(params.z), x: Number(params.x), y: Number(params.y),
    });
    result.metadata.cache = 'miss';
    tileCache.set(cacheKey, result);
    return result;
  } catch (error) { return translate(error); }
}

async function listSources(organizationId) {
  const pipeline = await getPipeline();
  return pipeline.listSources(organizationId);
}

async function listJobs(organizationId) {
  const pipeline = await getPipeline();
  return pipeline.listJobs(organizationId);
}

async function setSourceStatus(organizationId, sourceId, status) {
  try {
    const pipeline = await getPipeline();
    const result = await pipeline.setSourceStatus({ organizationId, sourceId, status });
    tileCache.clear();
    return result;
  } catch (error) { return translate(error); }
}

function getStatus() {
  return {
    provider: String(process.env.SPATIAL_STORE || 'memory').toLowerCase(),
    persistent: String(process.env.SPATIAL_STORE || 'memory').toLowerCase() === 'atlas',
    atlasConfigured: Boolean(process.env.MONGODB_URI),
    tileCacheEntries: tileCache.size,
    remoteHosts: ['www.datos.gov.co', 'datos.gov.co', 'mapas2.igac.gov.co'],
  };
}

module.exports = { getPipeline, scopedWorldId, registerSource, ingestGeoJSON, ingestRemote, getTile, listSources, listJobs, setSourceStatus, getStatus };
