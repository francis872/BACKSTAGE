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
      recommendation_text, recommendation_payload, metadata, status, created_at, updated_at, organization_id
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



async function saveProbabilityResult({ analysisRunId, organizationId, probabilityResult, userId }) {
  const result = await query(
    `UPDATE analysis_runs
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
       'probability_result', $1::jsonb,
       'probability_completed_at', now(),
       'probability_completed_by_user_id', $2
     ),
     updated_at = now()
     WHERE analysis_run_id = $3
       AND organization_id = $4
     RETURNING analysis_run_id, metadata, updated_at`,
    [JSON.stringify(probabilityResult || {}), userId || null, analysisRunId, organizationId]
  );
  return result.rows[0] || null;
}

async function getProbabilityResult({ analysisRunId, organizationId }) {
  const result = await query(
    `SELECT
       analysis_run_id,
       metadata->'probability_result' AS probability_result,
       metadata->>'probability_completed_at' AS probability_completed_at,
       metadata->>'probability_completed_by_user_id' AS probability_completed_by_user_id
     FROM analysis_runs
     WHERE analysis_run_id = $1
       AND organization_id = $2`,
    [analysisRunId, organizationId]
  );
  return result.rows[0] || null;
}



async function createOperationalProject({ projectName, city, objective, requestedByUserId, organizationId }) {
  const result = await query(
    `INSERT INTO analysis_runs
       (project_name, city, objective, criteria_weights, requested_by_user_id, organization_id, metadata, status)
     VALUES ($1, $2, $3, '{}'::jsonb, $4, $5, $6, 'pending')
     RETURNING *`,
    [projectName, city || null, objective || null, requestedByUserId || null, organizationId, {
      analysis_type: 'operational_project',
      workflow_created_at: new Date().toISOString(),
    }]
  );
  return result.rows[0];
}

async function listProjectCandidates({ analysisRunId, organizationId }) {
  const result = await query(
    `SELECT
       arc.analysis_run_candidate_id,
       arc.analysis_run_id,
       arc.location_id,
       arc.selected_at,
       l.name,
       l.city,
       l.address,
       l.latitude,
       l.longitude,
       l.category
     FROM analysis_run_candidates arc
     JOIN analysis_runs ar ON ar.analysis_run_id = arc.analysis_run_id
     JOIN locations l ON l.location_id = arc.location_id
     WHERE arc.analysis_run_id = $1
       AND ar.organization_id = $2
     ORDER BY arc.selected_at ASC`,
    [analysisRunId, organizationId]
  );
  return result.rows;
}

async function addProjectCandidate({ analysisRunId, locationId, organizationId, userId }) {
  const result = await query(
    `INSERT INTO analysis_run_candidates (analysis_run_id, location_id, selected_by_user_id)
     SELECT ar.analysis_run_id, l.location_id, $4
     FROM analysis_runs ar
     JOIN locations l ON l.location_id = $2 AND l.organization_id = $3
     WHERE ar.analysis_run_id = $1 AND ar.organization_id = $3
     ON CONFLICT (analysis_run_id, location_id) DO UPDATE SET selected_at = analysis_run_candidates.selected_at
     RETURNING *`,
    [analysisRunId, locationId, organizationId, userId || null]
  );
  return result.rows[0] || null;
}

async function removeProjectCandidate({ analysisRunId, locationId, organizationId }) {
  const result = await query(
    `DELETE FROM analysis_run_candidates arc
     USING analysis_runs ar
     WHERE arc.analysis_run_id = ar.analysis_run_id
       AND arc.analysis_run_id = $1
       AND arc.location_id = $2
       AND ar.organization_id = $3
     RETURNING arc.*`,
    [analysisRunId, locationId, organizationId]
  );
  return result.rows[0] || null;
}


async function invalidateDownstreamWorkflow({ analysisRunId, organizationId, reason, source = 'upstream_change' }) {
  const result = await query(
    `UPDATE analysis_runs
     SET metadata =
       (COALESCE(metadata, '{}'::jsonb)
         - 'probability_completed_at'
         - 'probability_completed_by_user_id'
         - 'risk_reviewed_at'
         - 'risk_reviewed_by_user_id'
         - 'operational_recommendation_generated_at'
         - 'operational_recommendation_generated_by_user_id'
         - 'operational_recommendation_count'
         - 'operational_recommendation_reviewed_at'
         - 'operational_recommendation_reviewed_by_user_id'
         - 'operational_recommendation_decision'
         - 'operational_recommendation_id'
         - 'report_generated_at'
         - 'report_generated_by_user_id'
         - 'report_snapshot')
       || jsonb_build_object(
         'workflow_stale', true,
         'workflow_stale_at', now(),
         'workflow_stale_reason', $1,
         'workflow_stale_source', $2
       ),
       status = 'pending',
       updated_at = now()
     WHERE analysis_run_id = $3 AND organization_id = $4
     RETURNING *`,
    [reason, source, analysisRunId, organizationId]
  );
  return result.rows[0] || null;
}

async function clearWorkflowStale({ analysisRunId, organizationId }) {
  const result = await query(
    `UPDATE analysis_runs
     SET metadata = COALESCE(metadata, '{}'::jsonb)
       - 'workflow_stale'
       - 'workflow_stale_at'
       - 'workflow_stale_reason'
       - 'workflow_stale_source',
       updated_at = now()
     WHERE analysis_run_id = $1 AND organization_id = $2
     RETURNING *`,
    [analysisRunId, organizationId]
  );
  return result.rows[0] || null;
}

async function replaceAnalysisResults({ analysisRunId, ranked }) {
  await query('DELETE FROM analysis_results WHERE analysis_run_id = $1', [analysisRunId]);
  for (const candidate of ranked) {
    await insertAnalysisResult({
      analysisRunId,
      rankPosition: candidate.rank_position,
      candidateName: candidate.candidate_name,
      locationId: candidate.location_id,
      scoreTotal: candidate.score_total,
      scoreByDimension: candidate.score_by_dimension,
      metrics: candidate.metrics,
      explanation: { criteria: candidate.explanation },
    });
  }
}

async function markComparisonCompleted({ analysisRunId, organizationId, criteriaWeights, metadata }) {
  const result = await query(
    `UPDATE analysis_runs
     SET criteria_weights = $1,
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb || jsonb_build_object('comparison_completed_at', now()),
         status = 'completed',
         updated_at = now()
     WHERE analysis_run_id = $3 AND organization_id = $4
     RETURNING *`,
    [criteriaWeights || {}, JSON.stringify(metadata || {}), analysisRunId, organizationId]
  );
  return result.rows[0] || null;
}

async function getOperationalRisksByRun({ analysisRunId, organizationId }) {
  const result = await query(
    `WITH project_locations AS (
       SELECT DISTINCT ar.location_id
       FROM analysis_results ar
       JOIN analysis_runs run ON run.analysis_run_id = ar.analysis_run_id
       WHERE ar.analysis_run_id = $1
         AND run.organization_id = $2
         AND ar.location_id IS NOT NULL
     ),
     latest_risks AS (
       SELECT DISTINCT ON (ra.location_id)
         ra.risk_id,
         ra.location_id,
         ra.assessed_at,
         ra.flood_risk,
         ra.landslide_risk,
         ra.crime_risk,
         ra.climate_exposure,
         ra.score,
         ra.details
       FROM risk_assessments ra
       JOIN project_locations pl ON pl.location_id = ra.location_id
       WHERE ra.organization_id = $2
       ORDER BY ra.location_id, ra.assessed_at DESC, ra.risk_id DESC
     )
     SELECT
       pl.location_id,
       l.name AS location_name,
       l.city,
       lr.risk_id,
       lr.assessed_at,
       lr.flood_risk,
       lr.landslide_risk,
       lr.crime_risk,
       lr.climate_exposure,
       lr.score,
       lr.details
     FROM project_locations pl
     JOIN locations l ON l.location_id = pl.location_id
     LEFT JOIN latest_risks lr ON lr.location_id = pl.location_id
     ORDER BY l.name ASC`,
    [analysisRunId, organizationId]
  );
  return result.rows;
}

async function saveRiskReview({ analysisRunId, organizationId, userId, riskSummary }) {
  const result = await query(
    `UPDATE analysis_runs
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
       'risk_review', $1::jsonb,
       'risk_reviewed_at', now(),
       'risk_reviewed_by_user_id', $2
     ),
     updated_at = now()
     WHERE analysis_run_id = $3
       AND organization_id = $4
     RETURNING analysis_run_id, metadata, updated_at`,
    [JSON.stringify(riskSummary || {}), userId || null, analysisRunId, organizationId]
  );
  return result.rows[0] || null;
}


async function getLatestOperationalRecommendation({ analysisRunId, organizationId }) {
  const result = await query(
    `SELECT
       recommendation_id,
       location_id,
       query_type,
       result,
       score,
       title,
       priority,
       confidence,
       expected_impact,
       status,
       reviewed_by_user_id,
       review_notes,
       reviewed_at
     FROM recommendations
     WHERE analysis_run_id = $1
       AND organization_id = $2
     ORDER BY requested_at DESC, recommendation_id DESC
     LIMIT 1`,
    [analysisRunId, organizationId]
  );
  return result.rows[0] || null;
}

async function markReportGenerated({ analysisRunId, organizationId, userId, snapshot }) {
  const result = await query(
    `UPDATE analysis_runs
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
       'report_generated_at', now(),
       'report_generated_by_user_id', $1,
       'report_snapshot', $2::jsonb
     ),
     updated_at = now()
     WHERE analysis_run_id = $3
       AND organization_id = $4
     RETURNING analysis_run_id, metadata, updated_at`,
    [userId || null, JSON.stringify(snapshot || {}), analysisRunId, organizationId]
  );
  return result.rows[0] || null;
}

async function listOperationalBoard({ organizationId, limit = 20 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const result = await query(
    `SELECT
       ar.analysis_run_id,
       ar.project_name,
       ar.city,
       ar.objective,
       ar.status,
       ar.recommendation_text,
       ar.metadata,
       ar.created_at,
       ar.updated_at,
       COUNT(res.analysis_result_id)::int AS result_count,
       COUNT(res.location_id)::int AS linked_locations,
       (SELECT COUNT(*)::int FROM analysis_run_candidates arc WHERE arc.analysis_run_id = ar.analysis_run_id) AS candidate_count
     FROM analysis_runs ar
     LEFT JOIN analysis_results res ON res.analysis_run_id = ar.analysis_run_id
     WHERE ar.organization_id = $1
     GROUP BY ar.analysis_run_id
     ORDER BY ar.updated_at DESC
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
  listOperationalBoard,
  saveProbabilityResult,
  getProbabilityResult,
  getOperationalRisksByRun,
  saveRiskReview,
  getLatestOperationalRecommendation,
  markReportGenerated,
  createOperationalProject,
  listProjectCandidates,
  addProjectCandidate,
  removeProjectCandidate,
  replaceAnalysisResults,
  markComparisonCompleted,
  invalidateDownstreamWorkflow,
  clearWorkflowStale,
};
