const { query } = require('../db');
const ApiError = require('../utils/ApiError');
const { computeTerritorialIndex, getLatestIndexSnapshot, detectGaps, simulateInfrastructure } = require('../earthart');

async function listUnits(organizationId) {
  const result = await query('SELECT * FROM territorial_units WHERE organization_id = $1 ORDER BY unit_id', [organizationId]);
  return result.rows;
}

async function getUnitById(id, organizationId) {
  const result = await query('SELECT * FROM territorial_units WHERE unit_id = $1 AND organization_id = $2', [id, organizationId]);
  if (result.rows.length === 0) throw new ApiError(404, 'Unidad territorial no encontrada.');
  return result.rows[0];
}

async function createUnit(data, organizationId) {
  const { external_id, name, unit_type, parent_unit_id, city, region, country, population, population_growth_pct, area_km2, latitude, longitude } = data;
  if (!name || !unit_type) {
    throw new ApiError(400, 'name y unit_type son requeridos.');
  }
  const result = await query(
    `INSERT INTO territorial_units
       (external_id, name, unit_type, parent_unit_id, city, region, country, population, population_growth_pct, area_km2, latitude, longitude, geometry, organization_id)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Colombia'), $8, $9, $10, $11, $12,
       CASE WHEN $11 IS NOT NULL AND $12 IS NOT NULL THEN jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array($12, $11)) ELSE NULL END, $13)
     RETURNING *`,
    [external_id || null, name, unit_type, parent_unit_id || null, city || null, region || null, country || null, population || null, population_growth_pct || null, area_km2 || null, latitude || null, longitude || null, organizationId]
  );
  return result.rows[0];
}

async function updateUnit(id, data, organizationId) {
  const { external_id, name, unit_type, parent_unit_id, city, region, country, population, population_growth_pct, area_km2, latitude, longitude } = data;
  const result = await query(
    `UPDATE territorial_units SET
       external_id = $1, name = $2, unit_type = $3, parent_unit_id = $4, city = $5, region = $6,
       country = COALESCE($7, 'Colombia'), population = $8, population_growth_pct = $9, area_km2 = $10,
       latitude = $11, longitude = $12,
       geometry = CASE WHEN $11 IS NOT NULL AND $12 IS NOT NULL THEN jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array($12, $11)) ELSE NULL END,
       updated_at = now()
     WHERE unit_id = $13 AND organization_id = $14 RETURNING *`,
    [external_id || null, name, unit_type, parent_unit_id || null, city || null, region || null, country || null, population || null, population_growth_pct || null, area_km2 || null, latitude || null, longitude || null, id, organizationId]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Unidad territorial no encontrada.');
  return result.rows[0];
}

async function deleteUnit(id, organizationId) {
  const result = await query('DELETE FROM territorial_units WHERE unit_id = $1 AND organization_id = $2 RETURNING *', [id, organizationId]);
  if (result.rows.length === 0) throw new ApiError(404, 'Unidad territorial no encontrada.');
  return result.rows[0];
}

async function listFacilities(unitId, organizationId) {
  const result = unitId
    ? await query('SELECT f.* FROM territorial_facilities f JOIN territorial_units u ON u.unit_id = f.unit_id WHERE f.unit_id = $1 AND u.organization_id = $2 ORDER BY f.facility_id', [unitId, organizationId])
    : await query('SELECT f.* FROM territorial_facilities f JOIN territorial_units u ON u.unit_id = f.unit_id WHERE u.organization_id = $1 ORDER BY f.facility_id LIMIT 200', [organizationId]);
  return result.rows;
}

async function createFacility(data, organizationId) {
  const { unit_id, location_id, facility_type, name, capacity, latitude, longitude } = data;
  if (!unit_id || !facility_type || !name) {
    throw new ApiError(400, 'unit_id, facility_type y name son requeridos.');
  }
  await getUnitById(unit_id, organizationId);
  const result = await query(
    `INSERT INTO territorial_facilities (unit_id, location_id, facility_type, name, capacity, latitude, longitude, geometry)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
       CASE WHEN $6 IS NOT NULL AND $7 IS NOT NULL THEN jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array($7, $6)) ELSE NULL END)
     RETURNING *`,
    [unit_id, location_id || null, facility_type, name, capacity || null, latitude || null, longitude || null]
  );
  return result.rows[0];
}

async function listDimensionScores(unitId, organizationId) {
  const result = unitId
    ? await query('SELECT s.* FROM territorial_dimension_scores s JOIN territorial_units u ON u.unit_id = s.unit_id WHERE s.unit_id = $1 AND u.organization_id = $2 ORDER BY s.dimension, s.measured_at DESC', [unitId, organizationId])
    : await query('SELECT s.* FROM territorial_dimension_scores s JOIN territorial_units u ON u.unit_id = s.unit_id WHERE u.organization_id = $1 ORDER BY s.unit_id, s.dimension LIMIT 200', [organizationId]);
  return result.rows;
}

async function upsertDimensionScore(data, organizationId) {
  const { unit_id, dimension, score, measured_at, details } = data;
  if (!unit_id || !dimension || score === undefined) {
    throw new ApiError(400, 'unit_id, dimension y score son requeridos.');
  }
  await getUnitById(unit_id, organizationId);
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

async function getUnitIndex(unitId, organizationId) {
  await getUnitById(unitId, organizationId);
  const existing = await getLatestIndexSnapshot(unitId);
  if (existing) return existing;
  const computed = await computeTerritorialIndex(unitId);
  return computed.snapshot;
}

async function recomputeUnitIndex(unitId, organizationId) {
  await getUnitById(unitId, organizationId);
  const computed = await computeTerritorialIndex(unitId);
  return computed.snapshot;
}

async function listUnitGaps(unitId, organizationId) {
  await getUnitById(unitId, organizationId);
  const result = await query(
    'SELECT * FROM territorial_gaps WHERE unit_id = $1 ORDER BY detected_at DESC LIMIT 50',
    [unitId]
  );
  return result.rows;
}

async function detectUnitGaps(unitId, organizationId) {
  await getUnitById(unitId, organizationId);
  return detectGaps(unitId, organizationId);
}

async function listGlobalGaps(organizationId) {
  const result = await query(
    `SELECT g.*, u.name AS unit_name FROM territorial_gaps g
     JOIN territorial_units u ON u.unit_id = g.unit_id
     WHERE g.resolved = false AND u.organization_id = $1
     ORDER BY g.detected_at DESC LIMIT 100`
    , [organizationId]
  );
  return result.rows;
}

async function simulateUnit(unitId, params, organizationId) {
  await getUnitById(unitId, organizationId);
  const simulation = await simulateInfrastructure(unitId, params || {}, organizationId);
  if (!simulation) throw new ApiError(404, 'Unidad territorial no encontrada.');
  return simulation;
}

async function listUnitSimulations(unitId, organizationId) {
  await getUnitById(unitId, organizationId);
  const result = await query('SELECT * FROM territorial_simulations WHERE unit_id = $1 ORDER BY created_at DESC, simulation_id DESC LIMIT 50', [unitId]);
  return result.rows;
}

async function getUnitGap(unitId, gapId, organizationId) {
  await getUnitById(unitId, organizationId);
  const result = await query('SELECT * FROM territorial_gaps WHERE gap_id = $1 AND unit_id = $2', [gapId, unitId]);
  if (!result.rows.length) throw new ApiError(404, 'Brecha territorial no encontrada.');
  return result.rows[0];
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
  listUnitSimulations,
  getUnitGap,
};
