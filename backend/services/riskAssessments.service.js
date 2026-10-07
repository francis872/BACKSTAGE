const { query } = require('../db');
const ApiError = require('../utils/ApiError');
const { normalizeAssessmentInput, classifyAssessment } = require('../domain/riskAssessment');

async function assertLocationBelongsToOrganization(locationId, organizationId) {
  const location = await query(
    'SELECT location_id FROM locations WHERE location_id = $1 AND organization_id = $2',
    [locationId, organizationId]
  );
  if (location.rows.length === 0) {
    throw new ApiError(400, 'location_id no pertenece a la organización activa.');
  }
}

async function listAssessments(organizationId) {
  const result = await query(
    `SELECT ra.*, l.name AS location_name, l.city
     FROM risk_assessments ra
     JOIN locations l ON l.location_id = ra.location_id
     WHERE ra.organization_id = $1
     ORDER BY ra.assessed_at DESC LIMIT 200`,
    [organizationId]
  );
  return result.rows.map((row) => ({ ...row, severity: classifyAssessment(row) }));
}

async function getAssessmentById(id, organizationId) {
  const result = await query(
    `SELECT ra.*, l.name AS location_name, l.city, l.latitude, l.longitude
     FROM risk_assessments ra JOIN locations l ON l.location_id = ra.location_id
     WHERE ra.risk_id = $1 AND ra.organization_id = $2`,
    [id, organizationId]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Evaluación de riesgo no encontrada.');
  return { ...result.rows[0], severity: classifyAssessment(result.rows[0]) };
}

async function getLocationHistory(locationId, organizationId) {
  await assertLocationBelongsToOrganization(locationId, organizationId);
  const result = await query(
    `SELECT ra.*, l.name AS location_name, l.city, l.latitude, l.longitude
     FROM risk_assessments ra JOIN locations l ON l.location_id = ra.location_id
     WHERE ra.location_id = $1 AND ra.organization_id = $2
     ORDER BY ra.assessed_at DESC, ra.risk_id DESC LIMIT 100`,
    [locationId, organizationId]
  );
  return result.rows.map((row) => ({ ...row, severity: classifyAssessment(row) }));
}

async function createAssessment(data, organizationId) {
  let normalized;
  try { normalized = normalizeAssessmentInput(data, { requireLocation: true }); } catch (error) { throw new ApiError(400, error.message); }
  const { location_id, flood_risk, landslide_risk, crime_risk, climate_exposure, score, details } = normalized;
  await assertLocationBelongsToOrganization(location_id, organizationId);
  const result = await query(
    `INSERT INTO risk_assessments (location_id, flood_risk, landslide_risk, crime_risk, climate_exposure, score, details, organization_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [location_id, flood_risk, landslide_risk, crime_risk, climate_exposure, score, details, organizationId]
  );
  return result.rows[0];
}

async function updateAssessment(id, data, organizationId) {
  let normalized;
  try { normalized = normalizeAssessmentInput(data); } catch (error) { throw new ApiError(400, error.message); }
  const { flood_risk, landslide_risk, crime_risk, climate_exposure, score, details } = normalized;
  const result = await query(
    `UPDATE risk_assessments SET
       flood_risk = $1, landslide_risk = $2, crime_risk = $3, climate_exposure = $4, score = $5, details = $6
     WHERE risk_id = $7
       AND organization_id = $8
     RETURNING *`,
    [flood_risk, landslide_risk, crime_risk, climate_exposure, score, details, id, organizationId]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Evaluación de riesgo no encontrada.');
  return result.rows[0];
}

async function deleteAssessment(id, organizationId) {
  const result = await query(
    'DELETE FROM risk_assessments WHERE risk_id = $1 AND organization_id = $2 RETURNING *',
    [id, organizationId]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Evaluación de riesgo no encontrada.');
  return result.rows[0];
}

module.exports = { listAssessments, getAssessmentById, getLocationHistory, createAssessment, updateAssessment, deleteAssessment };
