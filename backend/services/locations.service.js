const { query } = require('../db');
const ApiError = require('../utils/ApiError');
const { haversineDistance } = require('../spatial/core');

async function listLocations({ organizationId, limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const result = await query(
    'SELECT * FROM locations WHERE organization_id = $1 ORDER BY location_id LIMIT $2',
    [organizationId, safeLimit]
  );
  return result.rows;
}

async function findNearby({ lat, lng, radius = 2000, organizationId }) {
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new ApiError(400, 'Latitud y longitud válidas son requeridas.');
  }

  const result = await query(
    `SELECT
       l.*,
       COALESCE(ra.score, NULL) AS risk_score
     FROM locations l
     LEFT JOIN risk_assessments ra ON ra.location_id = l.location_id
     WHERE l.latitude IS NOT NULL
       AND l.longitude IS NOT NULL
       AND l.organization_id = $1
     LIMIT 5000`,
    [organizationId]
  );
  return result.rows
    .map((row) => ({
      ...row,
      distance_m: haversineDistance(
        { lat, lng },
        { lat: Number(row.latitude), lng: Number(row.longitude) }
      ),
    }))
    .filter((row) => row.distance_m <= radius)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 100);
}

async function getLocationById(id, organizationId) {
  const result = await query('SELECT * FROM locations WHERE location_id = $1 AND organization_id = $2', [id, organizationId]);
  if (result.rows.length === 0) {
    throw new ApiError(404, 'Ubicación no encontrada.');
  }
  return result.rows[0];
}

async function createLocation(data, organizationId) {
  const { external_id, name, type, address, city, region, country, latitude, longitude, capacity } = data;
  if (!name || !type) {
    throw new ApiError(400, 'name y type son requeridos.');
  }
  const result = await query(
    `INSERT INTO locations (external_id, name, type, address, city, region, country, latitude, longitude, capacity, organization_id)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Colombia'), $8, $9, $10, $11)
     RETURNING *`,
    [
     external_id || null,
     name,
     type,
     address || null,
     city || null,
     region || null,
     country || null,
     latitude || null,
     longitude || null,
     capacity || null,
     organizationId,
    ]
  );
  return result.rows[0];
}

async function updateLocation(id, data, organizationId) {
  const { external_id, name, type, address, city, region, country, latitude, longitude, capacity } = data;
  const result = await query(
    `UPDATE locations SET
       external_id = $1, name = $2, type = $3, address = $4, city = $5, region = $6,
       country = COALESCE($7, 'Colombia'), latitude = $8, longitude = $9, capacity = $10,
       updated_at = now()
     WHERE location_id = $11
       AND organization_id = $12
     RETURNING *`,
    [external_id || null, name, type, address || null, city || null, region || null, country || null, latitude || null, longitude || null, capacity || null, id, organizationId]
  );
  if (result.rows.length === 0) {
    throw new ApiError(404, 'Ubicación no encontrada.');
  }
  return result.rows[0];
}

async function deleteLocation(id, organizationId) {
  const result = await query(
    'DELETE FROM locations WHERE location_id = $1 AND organization_id = $2 RETURNING *',
    [id, organizationId]
  );
  if (result.rows.length === 0) {
    throw new ApiError(404, 'Ubicación no encontrada.');
  }
  return result.rows[0];
}

module.exports = {
  listLocations,
  findNearby,
  getLocationById,
  createLocation,
  updateLocation,
  deleteLocation,
};
