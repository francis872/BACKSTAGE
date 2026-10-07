const { query } = require('../db');
const ApiError = require('../utils/ApiError');
const { normalizeRiskComponent, canonicalComponentType } = require('../domain/riskComponent');

function normalizeStored(row) { return { ...row, component_type: canonicalComponentType(row.component_type) }; }

const SELECT_CONTEXT = `SELECT rc.*, ra.location_id, ra.assessed_at, ra.score AS assessment_score,
  l.name AS location_name, l.city, l.latitude, l.longitude
  FROM risk_components rc
  JOIN risk_assessments ra ON ra.risk_id = rc.risk_id
  JOIN locations l ON l.location_id = ra.location_id`;

async function assertRiskBelongsToOrganization(riskId, organizationId) {
  const result = await query('SELECT risk_id FROM risk_assessments WHERE risk_id = $1 AND organization_id = $2', [riskId, organizationId]);
  if (!result.rows.length) throw new ApiError(400, 'risk_id no pertenece a la organización activa.');
}

async function listComponents(organizationId) {
  const result = await query(`${SELECT_CONTEXT} WHERE ra.organization_id = $1 ORDER BY ra.assessed_at DESC, rc.component_id DESC LIMIT 500`, [organizationId]);
  return result.rows.map(normalizeStored);
}

async function getComponentById(id, organizationId) {
  const result = await query(`${SELECT_CONTEXT} WHERE rc.component_id = $1 AND ra.organization_id = $2`, [id, organizationId]);
  if (result.rows.length === 0) throw new ApiError(404, 'Componente de riesgo no encontrado.');
  return normalizeStored(result.rows[0]);
}

async function createComponent(data, organizationId) {
  let normalized;
  try { normalized = normalizeRiskComponent(data); } catch (error) { throw new ApiError(400, error.message); }
  const { risk_id, component_type, component_score, notes } = normalized;
  await assertRiskBelongsToOrganization(risk_id, organizationId);
  const result = await query(
    `INSERT INTO risk_components (risk_id, component_type, component_score, notes)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [risk_id, component_type, component_score, notes]
  );
  return result.rows[0];
}

async function updateComponent(id, data, organizationId) {
  await getComponentById(id, organizationId);
  let normalized;
  try { normalized = normalizeRiskComponent(data); } catch (error) { throw new ApiError(400, error.message); }
  const { risk_id, component_type, component_score, notes } = normalized;
  await assertRiskBelongsToOrganization(risk_id, organizationId);
  const result = await query(
    `UPDATE risk_components SET
       risk_id = $1, component_type = $2, component_score = $3, notes = $4
     WHERE component_id = $5 RETURNING *`,
    [risk_id, component_type, component_score, notes, id]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Componente de riesgo no encontrado.');
  return result.rows[0];
}

async function deleteComponent(id, organizationId) {
  await getComponentById(id, organizationId);
  const result = await query('DELETE FROM risk_components WHERE component_id = $1 RETURNING *', [id]);
  if (result.rows.length === 0) throw new ApiError(404, 'Componente de riesgo no encontrado.');
  return result.rows[0];
}

module.exports = { listComponents, getComponentById, createComponent, updateComponent, deleteComponent };
