const { query } = require('../db');
const ApiError = require('../utils/ApiError');
const { computeTerritorialIndex, getLatestIndexSnapshot, detectGaps, simulateInfrastructure } = require('../earthart');

async function listUnits() {
  const result = await query('SELECT * FROM territorial_units ORDER BY unit_id');
  return result.rows;
}

async function getUnitById(id) {
  const result = await query('SELECT * FROM territorial_units WHERE unit_id = $1', [id]);
  if (result.rows.length === 0) throw new ApiError(404, 'Unidad territorial no encontrada.');
  return result.rows[0];
}

async function createUnit(data) {
  const { external_id, name, unit_type, parent_unit_id, city, region, country, population, population_growth_pct, area_km2, latitude, longitude } = data;
  if (!name || !unit_type) {
    throw new ApiError(400, 'name y unit_type son requeridos.');
  }
  const result = await query(
    `INSERT INTO territorial_units
       (external_id, name, unit_type, parent_unit_id, city, region, country, population, population_growth_pct, area_km2, latitude, longitude, geom)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Colombia'), $8, $9, $10, $11, $12,
       CASE WHEN $11 IS NOT NULL AND $12 IS NOT NULL THEN ST_SetSRID(ST_MakePoint($12, $11), 4326) ELSE NULL END)
     RETURNING *`,
    [external_id || null, name, unit_type, parent_unit_id || null, city || null, region || null, country || null, population || null, population_growth_pct || null, area_km2 || null, latitude || null, longitude || null]
  );
  return result.rows[0];
}

async function updateUnit(id, data) {
  const { external_id, name, unit_type, parent_unit_id, city, region, country, population, population_growth_pct, area_km2, latitude, longitude } = data;
  const result = await query(
    `UPDATE territorial_units SET
       external_id = $1, name = $2, unit_type = $3, parent_unit_id = $4, city = $5, region = $6,
       country = COALESCE($7, 'Colombia'), population = $8, population_growth_pct = $9, area_km2 = $10,
       latitude = $11, longitude = $12,
       geom = CASE WHEN $11 IS NOT NULL AND $12 IS NOT NULL THEN ST_SetSRID(ST_MakePoint($12, $11), 4326) ELSE NULL END,
       updated_at = now()
     WHERE unit_id = $13 RETURNING *`,
    [external_id || null, name, unit_type, parent_unit_id || null, city || null, region || null, country || null, population || null, population_growth_pct || null, area_km2 || null, latitude || null, longitude || null, id]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Unidad territorial no encontrada.');
  return result.rows[0];
}

async function deleteUnit(id) {
  const result = await query('DELETE FROM territorial_units WHERE unit_id = $1 RETURNING *', [id]);
  if (result.rows.length === 0) throw new ApiError(404, 'Unidad territorial no encontrada.');
  return result.rows[0];
}

async function listFacilities(unitId) {
  const result = unitId
    ? await query('SELECT * FROM territorial_facilities WHERE unit_id = $1 ORDER BY facility_id', [unitId])
    : await query('SELECT * FROM territorial_facilities ORDER BY facility_id LIMIT 200');
  return result.rows;
}

async function createFacility(data) {
  const { unit_id, location_id, facility_type, name, capacity, latitude, longitude } = data;
  if (!unit_id || !facility_type || !name) {
    throw new ApiError(400, 'unit_id, facility_type y name son requeridos.');
  }
  const result = await query(
    `INSERT INTO territorial_facilities (unit_id, location_id, facility_type, name, capacity, latitude, longitude, geom)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
       CASE WHEN $6 IS NOT NULL AND $7 IS NOT NULL THEN ST_SetSRID(ST_MakePoint($7, $6), 4326) ELSE NULL END)
     RETURNING *`,
    [unit_id, location_id || null, facility_type, name, capacity || null, latitude || null, longitude || null]
  );
  return result.rows[0];
}

async function listDimensionScores(unitId) {
  const result = unitId
    ? await query('SELECT * FROM territorial_dimension_scores WHERE unit_id = $1 ORDER BY dimension, measured_at DESC', [unitId])
    : await query('SELECT * FROM territorial_dimension_scores ORDER BY unit_id, dimension LIMIT 200');
  return result.rows;
}

async function upsertDimensionScore(data) {
  const { unit_id, dimension, score, measured_at, details } = data;
  if (!unit_id || !dimension || score === undefined) {
    throw new ApiError(400, 'unit_id, dimension y score son requeridos.');
  }
  const result = await query(
    `INSERT INTO territorial_dimension_scores (unit_id, dimension, score, measured_at, details)
     VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5)
     ON CONFLICT (unit_id, dimension, measured_at)
     DO UPDATE SET score = EXCLUDED.score, details = EXCLUDED.details
     RETURNING *`,
    [unit_id, dimension, score, measured_at || null, details || {}]
  );
  return result.rows[0];
}

async function getUnitIndex(unitId) {
  const existing = await getLatestIndexSnapshot(unitId);
  if (existing) return existing;
  const computed = await computeTerritorialIndex(unitId);
  return computed.snapshot;
}

async function recomputeUnitIndex(unitId) {
  const computed = await computeTerritorialIndex(unitId);
  return computed.snapshot;
}

async function listUnitGaps(unitId) {
  const result = await query(
    'SELECT * FROM territorial_gaps WHERE unit_id = $1 ORDER BY detected_at DESC LIMIT 50',
    [unitId]
  );
  return result.rows;
}

async function detectUnitGaps(unitId) {
  return detectGaps(unitId);
}

async function listGlobalGaps() {
  const result = await query(
    `SELECT g.*, u.name AS unit_name FROM territorial_gaps g
     JOIN territorial_units u ON u.unit_id = g.unit_id
     WHERE g.resolved = false
     ORDER BY g.detected_at DESC LIMIT 100`
  );
  return result.rows;
}

async function simulateUnit(unitId, params) {
  const simulation = await simulateInfrastructure(unitId, params || {});
  if (!simulation) throw new ApiError(404, 'Unidad territorial no encontrada.');
  return simulation;
}

module.exports = {
  listUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
  listFacilities,
  createFacility,
  listDimensionScores,
  upsertDimensionScore,
  getUnitIndex,
  recomputeUnitIndex,
  listUnitGaps,
  detectUnitGaps,
  listGlobalGaps,
  simulateUnit,
};
