const crypto = require('crypto');
const { query, pool } = require('../db');
const { publishSecurityEvent } = require('../realtime/securityEvents');

let supportsHashChainColumnsCache = null;
let hashChainBootstrapAttempted = false;

function sanitizeBody(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const clone = { ...payload };
  if (Object.prototype.hasOwnProperty.call(clone, 'password')) clone.password = '***';
  if (Object.prototype.hasOwnProperty.call(clone, 'password_hash')) clone.password_hash = '***';
  if (Object.prototype.hasOwnProperty.call(clone, 'token')) clone.token = '***';
  if (Object.prototype.hasOwnProperty.call(clone, 'authorization')) clone.authorization = '***';
  return clone;
}

function stableHashPayload(entry, prevHash) {
  return {
    organization_id: entry.organization_id || null,
    user_id: entry.user_id || null,
    action: entry.action,
    resource_type: entry.resource_type,
    resource_id: entry.resource_id || null,
    request_method: entry.request_method,
    request_path: entry.request_path,
    status_code: entry.status_code,
    metadata: entry.metadata || {},
    prev_hash: prevHash,
  };
}

function sha256FromObject(value) {
  const serialized = JSON.stringify(sortObjectKeys(value));
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const keys = Object.keys(value).sort();
  const sorted = {};
  for (const key of keys) {
    sorted[key] = sortObjectKeys(value[key]);
  }
  return sorted;
}

async function supportsHashChainColumns() {
  if (supportsHashChainColumnsCache !== null) {
    return supportsHashChainColumnsCache;
  }

  let result = await query(
    `SELECT COUNT(*)::int AS total
     FROM information_schema.columns
     WHERE table_name = 'audit_logs'
       AND column_name IN ('prev_hash', 'event_hash')`
  );
  let hasColumns = Number(result.rows[0]?.total || 0) === 2;
  if (!hasColumns && !hashChainBootstrapAttempted) {
    hashChainBootstrapAttempted = true;
    try {
      await query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash text');
      await query('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event_hash text');
      await query('CREATE INDEX IF NOT EXISTS idx_audit_logs_event_hash ON audit_logs(event_hash)');
      await query('CREATE INDEX IF NOT EXISTS idx_audit_logs_prev_hash ON audit_logs(prev_hash)');
      result = await query(
        `SELECT COUNT(*)::int AS total
         FROM information_schema.columns
         WHERE table_name = 'audit_logs'
           AND column_name IN ('prev_hash', 'event_hash')`
      );
      hasColumns = Number(result.rows[0]?.total || 0) === 2;
    } catch (error) {
      hasColumns = false;
    }
  }
  supportsHashChainColumnsCache = hasColumns;
  return supportsHashChainColumnsCache;
}

async function insertWithoutHashChain(entry) {
  const result = await query(
    `INSERT INTO audit_logs
      (organization_id, user_id, action, resource_type, resource_id, request_method, request_path, status_code, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING audit_log_id, organization_id, user_id, action, resource_type, resource_id, request_method, request_path, status_code, metadata, created_at`,
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
  return result.rows[0];
}

async function insertWithHashChain(entry) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lockKey = Number(entry.organization_id) || 0;
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

    const previousResult = await client.query(
      `SELECT event_hash
       FROM audit_logs
       WHERE organization_id IS NOT DISTINCT FROM $1
       ORDER BY audit_log_id DESC
       LIMIT 1`,
      [entry.organization_id || null]
    );
    const prevHash = previousResult.rows[0]?.event_hash || null;
    const eventHash = sha256FromObject(stableHashPayload(entry, prevHash));

    const insertResult = await client.query(
      `INSERT INTO audit_logs
        (organization_id, user_id, action, resource_type, resource_id, request_method, request_path, status_code, metadata, prev_hash, event_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING audit_log_id, organization_id, user_id, action, resource_type, resource_id, request_method, request_path, status_code, metadata, prev_hash, event_hash, created_at`,
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
        prevHash,
        eventHash,
      ]
    );

    await client.query('COMMIT');
    return insertResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function logAuditEvent(entry) {
  const hasHashChain = await supportsHashChainColumns();
  const row = hasHashChain
    ? await insertWithHashChain(entry)
    : await insertWithoutHashChain(entry);

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

  const hashCols = await supportsHashChainColumns();
  const selectHashes = hashCols ? ', prev_hash, event_hash' : '';
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
       ${selectHashes}
     FROM audit_logs
     WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map((row) => ({
    ...row,
    prev_hash: row.prev_hash || null,
    event_hash: row.event_hash || null,
  }));
}

async function verifyAuditChain(organizationId, limit = 500) {
  const hashCols = await supportsHashChainColumns();
  if (!hashCols) {
    return {
      enabled: false,
      valid: null,
      checked: 0,
      reason: 'Hash chain columns not available in current database schema.',
    };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
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
       prev_hash,
       event_hash
     FROM audit_logs
     WHERE organization_id = $1
     ORDER BY audit_log_id ASC
     LIMIT $2`,
    [organizationId, safeLimit]
  );

  let previousHash = null;
  let hashedRows = 0;
  let skippedLegacyRows = 0;

  for (const row of result.rows) {
    const hasHashes = Boolean(row.prev_hash) || Boolean(row.event_hash);
    if (!hasHashes) {
      if (hashedRows > 0) {
        return {
          enabled: true,
          valid: false,
          checked: result.rows.length,
          hashed_rows: hashedRows,
          skipped_legacy_rows: skippedLegacyRows,
          failed_at: row.audit_log_id,
        };
      }
      skippedLegacyRows += 1;
      continue;
    }

    const expectedHash = sha256FromObject(stableHashPayload(row, previousHash));
    if (!row.event_hash || row.prev_hash !== previousHash || row.event_hash !== expectedHash) {
      if (hashedRows === 0 && row.prev_hash === null) {
        hashedRows += 1;
        previousHash = row.event_hash;
        continue;
      }
      return {
        enabled: true,
        valid: false,
        checked: result.rows.length,
        hashed_rows: hashedRows,
        skipped_legacy_rows: skippedLegacyRows,
        failed_at: row.audit_log_id,
      };
    }
    hashedRows += 1;
    previousHash = row.event_hash;
  }

  return {
    enabled: true,
    valid: hashedRows > 0,
    checked: result.rows.length,
    hashed_rows: hashedRows,
    skipped_legacy_rows: skippedLegacyRows,
    tail_hash: previousHash,
  };
}

module.exports = {
  sanitizeBody,
  logAuditEvent,
  listAuditLogs,
  verifyAuditChain,
};
