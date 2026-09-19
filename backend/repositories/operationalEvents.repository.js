const { query } = require('../db');

async function emitEvent({
  organizationId,
  analysisRunId = null,
  actorUserId = null,
  eventType,
  severity = 'info',
  title,
  message = null,
  target = null,
  payload = {},
}) {
  const result = await query(
    `INSERT INTO operational_events
       (organization_id, analysis_run_id, actor_user_id, event_type, severity, title, message, target, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [organizationId, analysisRunId, actorUserId, eventType, severity, title, message, target, payload]
  );
  return result.rows[0];
}

async function listEvents({ organizationId, limit = 50, severity = null }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const params = [organizationId];
  let severityFilter = '';
  if (severity) {
    params.push(severity);
    severityFilter = ` AND oe.severity = $${params.length}`;
  }
  params.push(safeLimit);
  const result = await query(
    `SELECT oe.*, ar.project_name, ar.city
     FROM operational_events oe
     LEFT JOIN analysis_runs ar ON ar.analysis_run_id = oe.analysis_run_id
     WHERE oe.organization_id = $1
     ${severityFilter}
     ORDER BY oe.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

async function getAlertSummary({ organizationId }) {
  const result = await query(
    `SELECT severity, COUNT(*)::int AS count
     FROM operational_events
     WHERE organization_id = $1
       AND created_at >= now() - interval '7 days'
       AND severity IN ('warning','critical')
     GROUP BY severity`,
    [organizationId]
  );
  return Object.fromEntries(result.rows.map((row) => [row.severity, row.count]));
}

module.exports = { emitEvent, listEvents, getAlertSummary };
