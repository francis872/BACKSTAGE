const { query } = require('../db');
const ApiError = require('../utils/ApiError');

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

  const point = `SRID=4326;POINT(${lng} ${lat})`;
  const result = await query(
    `SELECT
       l.*,
       COALESCE(ra.score, NULL) AS risk_score,
       ST_Distance(l.geom::geography, ST_GeomFromText($1)::geography) AS distance_m
     FROM locations l
     LEFT JOIN risk_assessments ra ON ra.location_id = l.location_id
     WHERE l.geom IS NOT NULL
       AND l.organization_id = $3
       AND ST_DWithin(l.geom::geography, ST_GeomFromText($1)::geography, $2)
     ORDER BY distance_m
     LIMIT 100`,
    [point, radius, organizationId]
  );
  return result.rows;
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
    `INSERT INTO locations (external_id, name, type, address, city, region, country, latitude, longitude, capacity, organization_id, geom)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Colombia'), $8, $9, $10, $11,
       CASE WHEN $8 IS NOT NULL AND $9 IS NOT NULL THEN ST_SetSRID(ST_MakePoint($9, $8), 4326) ELSE NULL END)
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
       geom = CASE WHEN $8 IS NOT NULL AND $9 IS NOT NULL THEN ST_SetSRID(ST_MakePoint($9, $8), 4326) ELSE NULL END,
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
