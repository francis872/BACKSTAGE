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

async function listRecommendations(organizationId) {
  const result = await query(
    'SELECT * FROM recommendations WHERE organization_id = $1 ORDER BY requested_at DESC LIMIT 50',
    [organizationId]
  );
  return result.rows;
}

async function getRecommendationById(id, organizationId) {
  const result = await query(
    'SELECT * FROM recommendations WHERE recommendation_id = $1 AND organization_id = $2',
    [id, organizationId]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Recomendación no encontrada.');
  return result.rows[0];
}

async function createRecommendation(data, sessionUser, organizationContext) {
  const { location_id, query_type, parameters, result: resultPayload, score } = data;
  if (!location_id || !query_type) {
    throw new ApiError(400, 'location_id y query_type son requeridos.');
  }
  await assertLocationBelongsToOrganization(location_id, organizationContext.organization_id);
  const inserted = await query(
    `INSERT INTO recommendations (location_id, query_type, parameters, result, score, organization_id, requested_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
     location_id,
     query_type,
     parameters || null,
     resultPayload || null,
     score || null,
     organizationContext.organization_id,
     sessionUser.user_id,
    ]
  );
  return inserted.rows[0];
}

async function updateRecommendation(id, data, organizationContext) {
  const { location_id, query_type, parameters, result: resultPayload, score } = data;
  await assertLocationBelongsToOrganization(location_id, organizationContext.organization_id);
  const updated = await query(
    `UPDATE recommendations SET
       location_id = $1, query_type = $2, parameters = $3, result = $4, score = $5
     WHERE recommendation_id = $6
       AND organization_id = $7
     RETURNING *`,
    [location_id, query_type, parameters || null, resultPayload || null, score || null, id, organizationContext.organization_id]
  );
  if (updated.rows.length === 0) throw new ApiError(404, 'Recomendación no encontrada.');
  return updated.rows[0];
}

async function deleteRecommendation(id, organizationContext) {
  const deleted = await query(
    'DELETE FROM recommendations WHERE recommendation_id = $1 AND organization_id = $2 RETURNING *',
    [id, organizationContext.organization_id]
  );
  if (deleted.rows.length === 0) throw new ApiError(404, 'Recomendación no encontrada.');
  return deleted.rows[0];
}

async function getExampleRecommendation() {
  const locationResult = await query(
    `SELECT l.name, l.address, h.metric->>'queue_minutes' AS queue_minutes, h.metric->>'occupancy' AS occupancy
     FROM locations l
     LEFT JOIN location_histories h ON h.location_id = l.location_id
     WHERE l.external_id = 'mcd-001'
     ORDER BY h.observed_at DESC LIMIT 1`
  );

  const restaurant = locationResult.rows[0];
  if (!restaurant) {
    return { message: 'No se encontró un restaurante de ejemplo en la base de datos.' };
  }

  const queueMinutes = restaurant.queue_minutes ? Number(restaurant.queue_minutes) : null;
  const occupancy = restaurant.occupancy ? Number(restaurant.occupancy) : null;
  const message = queueMinutes
    ? `El restaurante ${restaurant.name} tiene una fila estimada de ${queueMinutes} minutos. Si recorres 600 metros adicionales ahorrarás 14 minutos.`
    : `El restaurante ${restaurant.name} no tiene datos de espera en este momento, pero está disponible para análisis.`;

  return {
    message,
    location: { name: restaurant.name, address: restaurant.address, queue_minutes: queueMinutes, occupancy },
  };
}

module.exports = {
  listRecommendations,
  getRecommendationById,
  createRecommendation,
  updateRecommendation,
  deleteRecommendation,
  getExampleRecommendation,
};
