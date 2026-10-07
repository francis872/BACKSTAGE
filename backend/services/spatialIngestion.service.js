const ApiError = require('../utils/ApiError');
const { createSpatialStore } = require('../spatial/store');
const { SpatialIngestionPipeline } = require('../spatial/ingestion');
const TileCache = require('../spatial/tileCache');
const { fetchGeoJSON } = require('../spatial/remoteSources');
const { buildRoadGraph, shortestPath } = require('../spatial/routing');
const { evaluateRisk } = require('../spatial/riskModels');
const { evaluateScenario } = require('../spatial/riskScenarios');
const { measureGeometry } = require('../spatial/geometryTools');

let pipelinePromise;
const tileCache = new TileCache({
  maxEntries: Number(process.env.SPATIAL_TILE_CACHE_MAX || 500),
  ttlMs: Number(process.env.SPATIAL_TILE_CACHE_TTL_MS || 300000),
});
const graphCache = new Map();

function getPipeline() {
  if (!pipelinePromise) {
    const pending = (async () => {
      const store = createSpatialStore();
      await store.initialize();
      return new SpatialIngestionPipeline(store);
    })();
    pipelinePromise = pending.catch((error) => {
      pipelinePromise = null;
      throw error;
    });
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
  if (error?.statusCode === 503) throw new ApiError(503, 'Almacén espacial temporalmente no disponible.');
  if (error?.name?.startsWith('Mongo') || String(process.env.SPATIAL_STORE).toLowerCase() === 'atlas' && !process.env.MONGODB_URI) {
    throw new ApiError(503, 'Almacén espacial temporalmente no disponible.');
  }
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
    graphCache.clear();
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

async function search(organizationId, query) {
  try {
    const pipeline = await getPipeline();
    return pipeline.search({ organizationId, worldId: scopedWorldId(organizationId, query.worldId), query: query.q, limit: query.limit });
  } catch (error) { return translate(error); }
}

async function nearby(organizationId, query) {
  try {
    const pipeline = await getPipeline();
    return pipeline.nearby({
      organizationId, worldId: scopedWorldId(organizationId, query.worldId),
      lng: query.lng, lat: query.lat, radiusM: Number(query.radiusM || 1000), limit: query.limit,
    });
  } catch (error) { return translate(error); }
}

async function computeRoute(organizationId, payload) {
  try {
    const worldId = scopedWorldId(organizationId, payload.worldId);
    const key = `${organizationId}:${worldId}`;
    let graph = graphCache.get(key);
    if (!graph) {
      const pipeline = await getPipeline();
      graph = buildRoadGraph(await pipeline.roadFeatures({ organizationId, worldId }));
      graphCache.set(key, graph);
    }
    const validateCoordinate = (coordinate, name) => {
      if (!Array.isArray(coordinate) || coordinate.length !== 2 || !coordinate.every((value) => Number.isFinite(Number(value)))) {
        throw new TypeError(`${name} debe ser [lng,lat].`);
      }
      return coordinate.map(Number);
    };
    return shortestPath(graph, validateCoordinate(payload.start, 'start'), validateCoordinate(payload.end, 'end'), payload.algorithm || 'astar');
  } catch (error) { return translate(error); }
}

function evaluateTerritorialRisk(payload) {
  try { return evaluateRisk(payload); } catch (error) { return translate(error); }
}

function evaluateTerritorialScenario(payload) {
  try { return evaluateScenario(payload); } catch (error) { return translate(error); }
}

function measureTerritorialGeometry(payload) {
  try { return measureGeometry(payload.geometry); } catch (error) { return translate(error); }
}

async function setSourceStatus(organizationId, sourceId, status) {
  try {
    const pipeline = await getPipeline();
    const result = await pipeline.setSourceStatus({ organizationId, sourceId, status });
    tileCache.clear();
    graphCache.clear();
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

module.exports = { getPipeline, scopedWorldId, translate, registerSource, ingestGeoJSON, ingestRemote, getTile, listSources, listJobs, search, nearby, computeRoute, evaluateTerritorialRisk, evaluateTerritorialScenario, measureTerritorialGeometry, setSourceStatus, getStatus };
