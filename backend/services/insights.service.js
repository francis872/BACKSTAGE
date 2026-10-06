const { query } = require('../db');
const ApiError = require('../utils/ApiError');
const { buildOpportunityRanking } = require('../domain/opportunities');

async function getSummary(organizationId) {
  const result = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM locations WHERE organization_id = $1) AS locations,
       (SELECT COUNT(*)::int FROM risk_assessments WHERE organization_id = $1) AS risk_assessments,
       (SELECT COUNT(*)::int FROM retail_zones) AS retail_zones,
       (SELECT COUNT(*)::int FROM recommendations WHERE organization_id = $1) AS recommendations,
       (SELECT COUNT(*)::int FROM analysis_runs WHERE organization_id = $1) AS projects_active,
       (SELECT COUNT(*)::int FROM analysis_runs WHERE organization_id = $1) AS analyses_total,
       (SELECT COUNT(*)::int FROM analysis_runs WHERE organization_id = $1 AND status = 'completed') AS analyses_completed,
       (SELECT COUNT(*)::int FROM analysis_runs WHERE organization_id = $1 AND status <> 'completed') AS analyses_attention,
       (SELECT COUNT(*)::int FROM analysis_runs WHERE organization_id = $1 AND created_at >= now() - interval '24 hours') AS analyses_24h,
       (SELECT MAX(created_at) FROM analysis_runs WHERE organization_id = $1) AS last_analysis_at,
       (SELECT COUNT(*)::int FROM layer_catalog WHERE (organization_id = $1 OR organization_id IS NULL)) AS layers_total,
       (SELECT COUNT(*)::int FROM layer_catalog WHERE (organization_id = $1 OR organization_id IS NULL) AND status = 'active') AS layers_active,
       (SELECT COUNT(*)::int FROM audit_logs WHERE organization_id = $1 AND created_at >= now() - interval '24 hours') AS activity_24h`,
    [organizationId]
  );

  const summary = result.rows[0] || {};
  const analysesTotal = Number(summary.analyses_total || 0);
  const analysesCompleted = Number(summary.analyses_completed || 0);
  const layersTotal = Number(summary.layers_total || 0);
  const layersActive = Number(summary.layers_active || 0);
  const analysesAttention = Number(summary.analyses_attention || 0);

  return {
    ...summary,
    operational_status: analysesAttention > 0 ? 'attention' : 'operational',
    completion_rate: analysesTotal > 0
      ? Number(((analysesCompleted / analysesTotal) * 100).toFixed(1))
      : null,
    layer_readiness_rate: layersTotal > 0
      ? Number(((layersActive / layersTotal) * 100).toFixed(1))
      : null,
    generated_at: new Date().toISOString(),
  };
}

async function listOpportunities(organizationId) {
  const result = await query(
    `SELECT l.location_id, l.name AS location_name, l.type AS location_type, l.city, l.region, l.latitude, l.longitude,
            lms.score_id, lms.category, lms.score AS factor_score, lms.details, ma.name AS market_area,
            latest_risk.score AS latest_risk_score
     FROM location_market_scores lms
     JOIN locations l ON l.location_id = lms.location_id
     JOIN market_areas ma ON ma.market_area_id = lms.market_area_id
     LEFT JOIN LATERAL (
       SELECT score FROM risk_assessments ra
       WHERE ra.location_id = l.location_id AND ra.organization_id = $1
       ORDER BY ra.assessed_at DESC, ra.risk_id DESC LIMIT 1
     ) latest_risk ON true
     WHERE l.organization_id = $1
     ORDER BY l.location_id, lms.score_id`,
    [organizationId]
  );
  return buildOpportunityRanking(result.rows);
}

async function getOpportunity(locationId, organizationId) {
  const rows = await listOpportunities(organizationId);
  const opportunity = rows.find((item) => item.location_id === Number(locationId));
  if (!opportunity) throw new ApiError(404, 'Oportunidad no encontrada en la organización activa.');
  return opportunity;
}

module.exports = { getSummary, listOpportunities, getOpportunity };
