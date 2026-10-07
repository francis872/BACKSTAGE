const ApiError = require('../utils/ApiError');
const { analyzeTerrain, buildTerrainSurface, resampleGrid } = require('../spatial/terrain');
const { generateContours } = require('../spatial/contours');
const { analyzeHydrology, topographicProfile } = require('../spatial/hydrology');

function asNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseBbox(value) {
  const bbox = String(value || '').split(',').map(Number);
  if (bbox.length !== 4 || !bbox.every(Number.isFinite)) throw new ApiError(400, 'bbox debe tener formato minLng,minLat,maxLng,maxLat.');
  return bbox;
}

function getSurface(query) {
  try {
    return buildTerrainSurface({
      bbox: parseBbox(query.bbox),
      resolution: Math.round(asNumber(query.resolution, 33)),
      contourInterval: asNumber(query.contourInterval, 100),
      seed: asNumber(query.seed, 17),
      lod: Math.max(0, Math.round(asNumber(query.lod, 0))),
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, error.message);
  }
}

function analyze(payload = {}) {
  try {
    const elevation = payload.targetRows && payload.targetColumns
      ? resampleGrid(payload.grid, Number(payload.targetRows), Number(payload.targetColumns))
      : payload.grid;
    const terrain = analyzeTerrain(elevation, { cellSizeM: asNumber(payload.cellSizeM, 30) });
    return {
      ...terrain,
      contours: generateContours(terrain.elevation, {
        interval: asNumber(payload.contourInterval, 10),
        originX: asNumber(payload.originX, 0),
        originY: asNumber(payload.originY, 0),
        cellSizeX: asNumber(payload.cellSizeX, 1),
        cellSizeY: asNumber(payload.cellSizeY, 1),
      }),
    };
  } catch (error) {
    throw new ApiError(400, error.message);
  }
}

function hydrology(payload = {}) {
  try {
    return analyzeHydrology(payload.grid, {
      bbox: payload.bbox?.map(Number), cellSizeM: asNumber(payload.cellSizeM, 30),
      streamThreshold: asNumber(payload.streamThreshold, 10),
      curvatureThreshold: asNumber(payload.curvatureThreshold, 0.000001), outlet: payload.outlet,
    });
  } catch (error) { throw new ApiError(400, error.message); }
}

function profile(payload = {}) {
  try {
    return topographicProfile(payload.grid, {
      bbox: payload.bbox?.map(Number), start: payload.start?.map(Number), end: payload.end?.map(Number),
      samples: Number(payload.samples || 100),
    });
  } catch (error) { throw new ApiError(400, error.message); }
}

module.exports = { parseBbox, getSurface, analyze, hydrology, profile };
