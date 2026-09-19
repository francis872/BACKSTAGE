const { query } = require('../db');

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

module.exports = { getSummary };
