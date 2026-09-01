const { query } = require('../db');

async function getSummary(organizationId) {
  const result = await query(
    `SELECT
       (SELECT COUNT(*) FROM locations WHERE organization_id = $1) AS locations,
       (SELECT COUNT(*) FROM risk_assessments WHERE organization_id = $1) AS risk_assessments,
       (SELECT COUNT(*) FROM retail_zones) AS retail_zones,
       (SELECT COUNT(*) FROM recommendations WHERE organization_id = $1) AS recommendations,
       (SELECT COUNT(*) FROM analysis_runs WHERE organization_id = $1) AS projects_active`,
    [organizationId]
  );
  return result.rows[0] || {};
}

module.exports = { getSummary };
