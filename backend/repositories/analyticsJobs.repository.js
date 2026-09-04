const { query } = require('../db');

async function createJob({ organizationId, requestedByUserId, algorithmName, algorithmVersion, params, context }) {
  const result = await query(
    `INSERT INTO analytics_jobs
       (organization_id, requested_by_user_id, algorithm_name, algorithm_version, status, params, context, started_at)
     VALUES ($1, $2, $3, $4, 'running', $5, $6, now())
     RETURNING *`,
    [organizationId || null, requestedByUserId || null, algorithmName, algorithmVersion, params || {}, context || {}]
  );
  return result.rows[0];
}

async function completeJob(jobId, { result: jobResult, durationMs }) {
  const updated = await query(
    `UPDATE analytics_jobs
     SET status = 'succeeded', result = $2, duration_ms = $3, completed_at = now()
     WHERE analytics_job_id = $1
     RETURNING *`,
    [jobId, jobResult, durationMs]
  );
  return updated.rows[0];
}

async function failJob(jobId, { error, durationMs }) {
  const updated = await query(
    `UPDATE analytics_jobs
     SET status = 'failed', error = $2, duration_ms = $3, completed_at = now()
     WHERE analytics_job_id = $1
     RETURNING *`,
    [jobId, String(error).slice(0, 2000), durationMs]
  );
  return updated.rows[0];
}

async function listJobs({ organizationId, algorithmName, limit = 20 }) {
  const params = [organizationId];
  let sql = `SELECT * FROM analytics_jobs WHERE organization_id = $1`;
  if (algorithmName) {
    params.push(algorithmName);
    sql += ` AND algorithm_name = $${params.length}`;
  }
  params.push(Math.min(Number(limit) || 20, 100));
  sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
  const result = await query(sql, params);
  return result.rows;
}

async function getJobById(jobId, organizationId) {
  const result = await query(
    'SELECT * FROM analytics_jobs WHERE analytics_job_id = $1 AND organization_id = $2',
    [jobId, organizationId]
  );
  return result.rows[0] || null;
}

module.exports = { createJob, completeJob, failJob, listJobs, getJobById };
