const { query } = require('../db');

async function startExecution(input) {
  const result = await query(
    `INSERT INTO command_executions
      (correlation_id, organization_id, analysis_run_id, actor_user_id, source, command, stage, input_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING *`,
    [
      input.correlationId,
      input.organizationId,
      input.analysisRunId || null,
      input.actorUserId || null,
      input.source || 'manual',
      input.command,
      input.stage || null,
      JSON.stringify(input.inputPayload || {}),
    ]
  );
  return result.rows[0];
}

async function completeExecution(id, resultPayload) {
  const result = await query(
    `UPDATE command_executions
     SET status='completed', result_payload=$2::jsonb, completed_at=now(),
         duration_ms=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now()-started_at))*1000)::int)
     WHERE command_execution_id=$1
     RETURNING *`,
    [id, JSON.stringify(resultPayload || {})]
  );
  return result.rows[0] || null;
}

async function failExecution(id, errorMessage) {
  const result = await query(
    `UPDATE command_executions
     SET status='failed', error_message=$2, completed_at=now(),
         duration_ms=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now()-started_at))*1000)::int)
     WHERE command_execution_id=$1
     RETURNING *`,
    [id, String(errorMessage || 'Unknown command error')]
  );
  return result.rows[0] || null;
}

async function listExecutions({ organizationId, analysisRunId = null, limit = 30 }) {
  const params = [organizationId];
  let where = 'organization_id=$1';
  if (analysisRunId) {
    params.push(analysisRunId);
    where += ` AND analysis_run_id=$${params.length}`;
  }
  params.push(Math.min(Math.max(Number(limit) || 30, 1), 100));
  const result = await query(
    `SELECT * FROM command_executions
     WHERE ${where}
     ORDER BY started_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

module.exports = { startExecution, completeExecution, failExecution, listExecutions };
