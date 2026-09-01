const { query } = require('../db');
const ApiError = require('../utils/ApiError');
const { evaluateLocation } = require('../scoring');

async function evaluate(locationId, modelId) {
  if (!locationId) {
    throw new ApiError(400, 'location_id es requerido.');
  }
  return evaluateLocation(locationId, modelId || null);
}

async function getLatest(locationId) {
  const result = await query(
    `SELECT * FROM scoring_results
     WHERE location_id = $1
     ORDER BY evaluated_at DESC
     LIMIT 1`,
    [locationId]
  );
  if (result.rows.length === 0) {
    throw new ApiError(404, 'No existe una puntuación para esta ubicación.');
  }
  return result.rows[0];
}

module.exports = { evaluate, getLatest };
