const { query } = require('../db');
const ApiError = require('../utils/ApiError');

async function getPortfolio() {
  const result = await query(
    `WITH latest_valuations AS (
       SELECT DISTINCT ON (location_id)
         location_id, estimated_value, annual_appreciation_pct, development_potential
       FROM property_valuations
       ORDER BY location_id, valued_at DESC, valuation_id DESC
     ),
     latest_risks AS (
       SELECT DISTINCT ON (location_id) location_id, score
       FROM risk_assessments
       ORDER BY location_id, assessed_at DESC, risk_id DESC
     )
     SELECT
       COUNT(*) AS properties,
       COALESCE(SUM(pv.estimated_value), 0) AS estimated_portfolio_value,
       COALESCE(ROUND(AVG(pv.annual_appreciation_pct)::numeric, 2), 0) AS average_appreciation_pct,
       COALESCE(ROUND(AVG(lr.score * 100)::numeric, 2), 0) AS average_risk_score
     FROM locations l
     LEFT JOIN latest_valuations pv ON pv.location_id = l.location_id
     LEFT JOIN latest_risks lr ON lr.location_id = l.location_id
     WHERE l.type = 'property'`
  );
  return result.rows[0];
}

async function getProperties() {
  const result = await query(
    `SELECT
       l.location_id, l.external_id, l.name, l.address, l.city, l.region, l.latitude, l.longitude,
       pv.valuation_id, pv.valued_at, pv.land_area_m2, pv.price_per_m2, pv.estimated_value,
       pv.annual_appreciation_pct, pv.development_potential, pv.zoning, pv.details AS valuation_details,
       ra.flood_risk, ra.landslide_risk, ra.crime_risk, ra.climate_exposure, ra.score AS risk_score,
       ROUND((
         COALESCE(pv.development_potential, 0) * 0.45 +
         COALESCE(pv.annual_appreciation_pct, 0) * 4 * 0.30 +
         COALESCE(ra.score, 0) * 100 * 0.25
       )::numeric, 2) AS investment_score
     FROM locations l
     LEFT JOIN LATERAL (
       SELECT * FROM property_valuations
       WHERE location_id = l.location_id
       ORDER BY valued_at DESC, valuation_id DESC LIMIT 1
     ) pv ON true
     LEFT JOIN LATERAL (
       SELECT * FROM risk_assessments
       WHERE location_id = l.location_id
       ORDER BY assessed_at DESC, risk_id DESC LIMIT 1
     ) ra ON true
     WHERE l.type = 'property'
     ORDER BY investment_score DESC NULLS LAST, l.name`
  );
  return result.rows;
}

async function listValuations() {
  const result = await query(
    `SELECT pv.*, l.name AS location_name, l.city
     FROM property_valuations pv
     JOIN locations l ON l.location_id = pv.location_id
     ORDER BY pv.valued_at DESC, pv.valuation_id DESC LIMIT 200`
  );
  return result.rows;
}

async function getValuationById(id) {
  const result = await query('SELECT * FROM property_valuations WHERE valuation_id = $1', [id]);
  if (result.rows.length === 0) throw new ApiError(404, 'Avalúo no encontrado.');
  return result.rows[0];
}

async function createValuation(data) {
  const {
    location_id, valued_at, land_area_m2, price_per_m2, estimated_value,
    annual_appreciation_pct, development_potential, zoning, details,
  } = data;
  if (!location_id || !land_area_m2 || !price_per_m2 || !estimated_value) {
    throw new ApiError(400, 'location_id, land_area_m2, price_per_m2 y estimated_value son requeridos.');
  }
  const result = await query(
    `INSERT INTO property_valuations
       (location_id, valued_at, land_area_m2, price_per_m2, estimated_value, annual_appreciation_pct, development_potential, zoning, details)
     VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, $7, $8, COALESCE($9, '{}'::jsonb))
     RETURNING *`,
    [location_id, valued_at || null, land_area_m2, price_per_m2, estimated_value, annual_appreciation_pct || null, development_potential || null, zoning || null, details || null]
  );
  return result.rows[0];
}

async function updateValuation(id, data) {
  const {
    valued_at, land_area_m2, price_per_m2, estimated_value,
    annual_appreciation_pct, development_potential, zoning, details,
  } = data;
  const result = await query(
    `UPDATE property_valuations SET
       valued_at = COALESCE($1, valued_at),
       land_area_m2 = $2, price_per_m2 = $3, estimated_value = $4,
       annual_appreciation_pct = $5, development_potential = $6, zoning = $7,
       details = COALESCE($8, details)
     WHERE valuation_id = $9 RETURNING *`,
    [valued_at || null, land_area_m2, price_per_m2, estimated_value, annual_appreciation_pct || null, development_potential || null, zoning || null, details || null, id]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Avalúo no encontrado.');
  return result.rows[0];
}

async function deleteValuation(id) {
  const result = await query('DELETE FROM property_valuations WHERE valuation_id = $1 RETURNING *', [id]);
  if (result.rows.length === 0) throw new ApiError(404, 'Avalúo no encontrado.');
  return result.rows[0];
}

module.exports = {
  getPortfolio,
  getProperties,
  listValuations,
  getValuationById,
  createValuation,
  updateValuation,
  deleteValuation,
};
