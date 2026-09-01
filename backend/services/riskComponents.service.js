const { query } = require('../db');
const ApiError = require('../utils/ApiError');

async function listComponents() {
  const result = await query('SELECT * FROM risk_components ORDER BY component_id');
  return result.rows;
}

async function getComponentById(id) {
  const result = await query('SELECT * FROM risk_components WHERE component_id = $1', [id]);
  if (result.rows.length === 0) throw new ApiError(404, 'Componente de riesgo no encontrado.');
  return result.rows[0];
}

async function createComponent(data) {
  const { risk_id, component_type, component_score, notes } = data;
  if (!risk_id || !component_type) {
    throw new ApiError(400, 'risk_id y component_type son requeridos.');
  }
  const result = await query(
    `INSERT INTO risk_components (risk_id, component_type, component_score, notes)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [risk_id, component_type, component_score || null, notes || null]
  );
  return result.rows[0];
}

async function updateComponent(id, data) {
  const { risk_id, component_type, component_score, notes } = data;
  const result = await query(
    `UPDATE risk_components SET
       risk_id = $1, component_type = $2, component_score = $3, notes = $4
     WHERE component_id = $5 RETURNING *`,
    [risk_id, component_type, component_score || null, notes || null, id]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Componente de riesgo no encontrado.');
  return result.rows[0];
}

async function deleteComponent(id) {
  const result = await query('DELETE FROM risk_components WHERE component_id = $1 RETURNING *', [id]);
  if (result.rows.length === 0) throw new ApiError(404, 'Componente de riesgo no encontrado.');
  return result.rows[0];
}

module.exports = { listComponents, getComponentById, createComponent, updateComponent, deleteComponent };
