const ApiError = require('../utils/ApiError');
const { createSpatialStore } = require('../spatial/store');
const { SpatialIngestionPipeline } = require('../spatial/ingestion');

let pipelinePromise;

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
    return pipeline.ingestGeoJSON({
      organizationId,
      worldId: scopedWorldId(organizationId, payload.worldId),
      sourceId: payload.sourceId,
      collection: payload.collection,
      zoom: Number(payload.zoom ?? 12),
    });
  } catch (error) { return translate(error); }
}

async function getTile(organizationId, params, query) {
  try {
    const pipeline = await getPipeline();
    return pipeline.getTile({
      organizationId,
      worldId: scopedWorldId(organizationId, query.worldId),
      z: Number(params.z), x: Number(params.x), y: Number(params.y),
    });
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

module.exports = { getPipeline, scopedWorldId, registerSource, ingestGeoJSON, getTile, listSources, listJobs };
