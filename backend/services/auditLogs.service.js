const { query } = require('../db');

function sanitizeBody(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const clone = { ...payload };
  if (Object.prototype.hasOwnProperty.call(clone, 'password')) clone.password = '***';
  if (Object.prototype.hasOwnProperty.call(clone, 'password_hash')) clone.password_hash = '***';
  return clone;
}

async function logAuditEvent(entry) {
  await query(
    `INSERT INTO audit_logs
      (organization_id, user_id, action, resource_type, resource_id, request_method, request_path, status_code, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.organization_id || null,
      entry.user_id || null,
      entry.action,
      entry.resource_type,
      entry.resource_id || null,
      entry.request_method,
      entry.request_path,
      entry.status_code,
      entry.metadata || {},
    ]
  );
}

async function listAuditLogs({ organizationId, limit = 100, action, resourceType, userId }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const clauses = ['organization_id = $1'];
  const values = [organizationId];

  if (action) {
    values.push(action);
    clauses.push(`action = $${values.length}`);
  }
  if (resourceType) {
    values.push(resourceType);
    clauses.push(`resource_type = $${values.length}`);
  }
  if (userId) {
    values.push(Number(userId));
    clauses.push(`user_id = $${values.length}`);
  }
  values.push(safeLimit);

  const result = await query(
    `SELECT
       audit_log_id,
       organization_id,
       user_id,
       action,
       resource_type,
       resource_id,
       request_method,
       request_path,
       status_code,
       metadata,
       created_at
     FROM audit_logs
     WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows;
}

module.exports = {
  sanitizeBody,
  logAuditEvent,
  listAuditLogs,
};

