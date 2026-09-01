const { query } = require('../db');

async function findLocationById(locationId, organizationId) {
  const result = await query(
    `SELECT
      location_id,
      name,
      city,
      latitude::double precision AS latitude,
      longitude::double precision AS longitude,
      geom
     FROM locations
     WHERE location_id = $1
       AND organization_id = $2`,
    [locationId, organizationId]
  );
  if (
    !result.rows[0] ||
    (result.rows[0].latitude == null || result.rows[0].longitude == null) && !result.rows[0].geom
  ) {
    return null;
  }
  return result.rows[0];
}

async function buildCandidateFromCoordinates({ name, city, lat, lng }) {
  return {
    location_id: null,
    name: name || 'Candidato',
    city: city || null,
    latitude: Number(lat),
    longitude: Number(lng),
  };
}

async function computeCandidateMetrics({ city, latitude, longitude, ownBrandName = 'McDonald%' }) {
  const result = await query(
    `WITH candidate AS (
      SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS geom
    ),
    nearest_competitor AS (
      SELECT MIN(ST_Distance(c.geom::geography, candidate.geom::geography)) AS value
      FROM competitors c
      CROSS JOIN candidate
      WHERE c.geom IS NOT NULL
        AND ($3::text IS NULL OR c.city = $3)
    ),
    nearest_own_store AS (
      SELECT MIN(ST_Distance(l.geom::geography, candidate.geom::geography)) AS value
      FROM business_locations bl
      JOIN locations l ON l.location_id = bl.location_id
      CROSS JOIN candidate
      WHERE l.geom IS NOT NULL
        AND bl.is_active = true
        AND bl.brand_name ILIKE $4
        AND ($3::text IS NULL OR l.city = $3)
    ),
    nearby_poi AS (
      SELECT COUNT(*)::int AS value
      FROM points_of_interest poi
      CROSS JOIN candidate
      WHERE poi.geom IS NOT NULL
        AND ST_DWithin(poi.geom::geography, candidate.geom::geography, 1200)
        AND ($3::text IS NULL OR poi.city = $3)
    ),
    nearest_risk AS (
      SELECT
        ra.flood_risk,
        ra.landslide_risk,
        ra.crime_risk,
        ra.climate_exposure
      FROM risk_assessments ra
      JOIN locations l ON l.location_id = ra.location_id
      CROSS JOIN candidate
      WHERE l.geom IS NOT NULL
        AND ($3::text IS NULL OR l.city = $3)
      ORDER BY ST_Distance(l.geom::geography, candidate.geom::geography)
      LIMIT 1
    ),
    population_zone AS (
      SELECT
        COALESCE(di.value, tz.population_total::numeric, 0) AS value
      FROM territorial_zones tz
      CROSS JOIN candidate
      LEFT JOIN demographic_indicators di
        ON di.zone_id = tz.zone_id
       AND di.indicator_name = 'population_total'
      WHERE tz.geom IS NOT NULL
        AND ST_Intersects(tz.geom, candidate.geom)
        AND ($3::text IS NULL OR tz.city = $3)
      ORDER BY di.as_of_date DESC NULLS LAST
      LIMIT 1
    )
    SELECT
      (SELECT value FROM nearest_competitor) AS competitor_distance_m,
      (SELECT value FROM nearest_own_store) AS own_store_distance_m,
      (SELECT value FROM nearby_poi) AS poi_count_1200m,
      (SELECT value FROM population_zone) AS population_total_zone,
      (SELECT flood_risk FROM nearest_risk) AS flood_risk,
      (SELECT landslide_risk FROM nearest_risk) AS landslide_risk,
      (SELECT crime_risk FROM nearest_risk) AS crime_risk,
      (SELECT climate_exposure FROM nearest_risk) AS climate_exposure`,
    [longitude, latitude, city || null, ownBrandName]
  );

  return result.rows[0];
}

async function createAnalysisRun({
  projectName,
  city,
  objective,
  criteriaWeights,
  requestedByUserId,
  organizationId,
  metadata,
}) {
  const result = await query(
    `INSERT INTO analysis_runs
      (project_name, city, objective, criteria_weights, requested_by_user_id, organization_id, metadata, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
     RETURNING analysis_run_id, created_at`,
    [
      projectName,
      city || null,
      objective || null,
      criteriaWeights || {},
      requestedByUserId || null,
      organizationId || null,
      metadata || {},
    ]
  );

  return result.rows[0];
}

async function insertAnalysisResult({
  analysisRunId,
  rankPosition,
  candidateName,
  locationId,
  scoreTotal,
  scoreByDimension,
  metrics,
  explanation,
}) {
  await query(
    `INSERT INTO analysis_results
      (analysis_run_id, rank_position, candidate_name, location_id, score_total, score_by_dimension, metrics, explanation)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      analysisRunId,
      rankPosition,
      candidateName,
      locationId || null,
      scoreTotal,
      scoreByDimension || {},
      metrics || {},
      explanation || {},
    ]
  );
}

async function setAnalysisRecommendation(analysisRunId, recommendationText, recommendationPayload) {
  await query(
    `UPDATE analysis_runs
     SET recommendation_text = $1,
         recommendation_payload = $2,
         updated_at = now()
     WHERE analysis_run_id = $3`,
    [recommendationText, recommendationPayload || {}, analysisRunId]
  );
}

async function getAnalysisRunById(analysisRunId) {
  return getAnalysisRunByIdForOrganization(analysisRunId, null);
}

async function getAnalysisRunByIdForOrganization(analysisRunId, organizationId) {
  const filterByOrg = organizationId != null;
  const values = filterByOrg
    ? [analysisRunId, organizationId]
    : [analysisRunId];
  const runResult = await query(
    `SELECT
      analysis_run_id, project_name, city, objective, criteria_weights,
      recommendation_text, recommendation_payload, status, created_at, updated_at, organization_id
     FROM analysis_runs
     WHERE analysis_run_id = $1
       ${filterByOrg ? 'AND organization_id = $2' : ''}`,
    values
  );
  const run = runResult.rows[0];
  if (!run) return null;

  const results = await query(
    `SELECT
      rank_position, candidate_name, location_id, score_total,
      score_by_dimension, metrics, explanation
     FROM analysis_results
     WHERE analysis_run_id = $1
     ORDER BY rank_position ASC`,
    [analysisRunId]
  );

  return { ...run, ranking: results.rows };
}

async function listAnalysisRuns({ organizationId, limit = 20 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const result = await query(
    `SELECT
       analysis_run_id,
       project_name,
       city,
       objective,
       recommendation_text,
       status,
       created_at,
       updated_at
     FROM analysis_runs
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [organizationId, safeLimit]
  );
  return result.rows;
}

module.exports = {
  findLocationById,
  buildCandidateFromCoordinates,
  computeCandidateMetrics,
  createAnalysisRun,
  insertAnalysisResult,
  setAnalysisRecommendation,
  getAnalysisRunById,
  getAnalysisRunByIdForOrganization,
  listAnalysisRuns,
};
