const { publishSecurityEvent } = require('../realtime/securityEvents');
const audit = require('./mongoAudit.service');
// Bound retained request data, including nested objects and arrays. Never keep credentials.
function sanitizeBody(payload, depth = 0, seen = new WeakSet()) {
  if (depth > 8) return '[truncated]';
  if (typeof payload === 'string') return payload.slice(0, 2000);
  if (!payload || typeof payload !== 'object') return payload ?? null;
  if (seen.has(payload)) return '[circular]';
  seen.add(payload);
  if (Array.isArray(payload)) return payload.slice(0, 50).map(value => sanitizeBody(value, depth + 1, seen));
  const result = Object.create(null);
  for (const [key, value] of Object.entries(payload).slice(0, 100)) {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    result[key] = /password|token|secret|authorization|cookie|credential|apikey|privatekey/.test(normalized)
      ? '***' : sanitizeBody(value, depth + 1, seen);
  }
  return result;
}

async function logAuditEvent(entry) {
  const row = await audit.logAuditEvent(entry);
  publishSecurityEvent({
    organization_id: row.organization_id,
    audit_log_id: row.audit_log_id,
    action: row.action,
    resource_type: row.resource_type,
    status_code: row.status_code,
    created_at: row.created_at,
    prev_hash: row.prev_hash || null,
    event_hash: row.event_hash || null,
  });
}

module.exports = { sanitizeBody, logAuditEvent, listAuditLogs: audit.listAuditLogs, verifyAuditChain: audit.verifyAuditChain };
