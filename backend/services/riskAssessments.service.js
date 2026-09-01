const { query } = require('../db');
const ApiError = require('../utils/ApiError');

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
  return result.rows;
}

async function getAssessmentById(id, organizationId) {
  const result = await query(
    'SELECT * FROM risk_assessments WHERE risk_id = $1 AND organization_id = $2',
    [id, organizationId]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Evaluación de riesgo no encontrada.');
  return result.rows[0];
}

async function createAssessment(data, organizationId) {
  const { location_id, flood_risk, landslide_risk, crime_risk, climate_exposure, score, details } = data;
  if (!location_id) {
    throw new ApiError(400, 'location_id es requerido.');
  }
  await assertLocationBelongsToOrganization(location_id, organizationId);
  const result = await query(
    `INSERT INTO risk_assessments (location_id, flood_risk, landslide_risk, crime_risk, climate_exposure, score, details, organization_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [location_id, flood_risk || null, landslide_risk || null, crime_risk || null, climate_exposure || null, score || null, details || null, organizationId]
  );
  return result.rows[0];
}

async function updateAssessment(id, data, organizationId) {
  const { flood_risk, landslide_risk, crime_risk, climate_exposure, score, details } = data;
  const result = await query(
    `UPDATE risk_assessments SET
       flood_risk = $1, landslide_risk = $2, crime_risk = $3, climate_exposure = $4, score = $5, details = $6
     WHERE risk_id = $7
       AND organization_id = $8
     RETURNING *`,
    [flood_risk || null, landslide_risk || null, crime_risk || null, climate_exposure || null, score || null, details || null, id, organizationId]
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

module.exports = { listAssessments, getAssessmentById, createAssessment, updateAssessment, deleteAssessment };
