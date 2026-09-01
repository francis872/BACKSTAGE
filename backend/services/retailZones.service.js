const { query } = require('../db');
const ApiError = require('../utils/ApiError');

async function listZones() {
  const result = await query('SELECT * FROM retail_zones ORDER BY retail_zone_id');
  return result.rows;
}

async function getZoneById(id) {
  const result = await query('SELECT * FROM retail_zones WHERE retail_zone_id = $1', [id]);
  if (result.rows.length === 0) throw new ApiError(404, 'Zona retail no encontrada.');
  return result.rows[0];
}

async function createZone(data) {
  const { name, city, region, country, population_density, pedestrian_traffic_score, vehicle_traffic_score, purchasing_power_index } = data;
  if (!name || !city) {
    throw new ApiError(400, 'name y city son requeridos.');
  }
  const result = await query(
    `INSERT INTO retail_zones (name, city, region, country, population_density, pedestrian_traffic_score, vehicle_traffic_score, purchasing_power_index)
     VALUES ($1, $2, $3, COALESCE($4, 'Colombia'), $5, $6, $7, $8) RETURNING *`,
    [name, city, region || null, country || null, population_density || null, pedestrian_traffic_score || null, vehicle_traffic_score || null, purchasing_power_index || null]
  );
  return result.rows[0];
}

async function updateZone(id, data) {
  const { name, city, region, country, population_density, pedestrian_traffic_score, vehicle_traffic_score, purchasing_power_index } = data;
  const result = await query(
    `UPDATE retail_zones SET
       name = $1, city = $2, region = $3, country = COALESCE($4, 'Colombia'),
       population_density = $5, pedestrian_traffic_score = $6, vehicle_traffic_score = $7, purchasing_power_index = $8
     WHERE retail_zone_id = $9 RETURNING *`,
    [name, city, region || null, country || null, population_density || null, pedestrian_traffic_score || null, vehicle_traffic_score || null, purchasing_power_index || null, id]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Zona retail no encontrada.');
  return result.rows[0];
}

async function deleteZone(id) {
  const result = await query('DELETE FROM retail_zones WHERE retail_zone_id = $1 RETURNING *', [id]);
  if (result.rows.length === 0) throw new ApiError(404, 'Zona retail no encontrada.');
  return result.rows[0];
}

module.exports = { listZones, getZoneById, createZone, updateZone, deleteZone };
