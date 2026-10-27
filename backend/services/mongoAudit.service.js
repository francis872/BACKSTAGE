const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
}
function hashEntry(entry, previousHash) {
  const payload = { audit_log_id:entry.audit_log_id,created_at:entry.created_at,organization_id: entry.organization_id || null, user_id: entry.user_id || null,
    action: entry.action, resource_type: entry.resource_type, resource_id: entry.resource_id || null,
    request_method: entry.request_method, request_path: entry.request_path, status_code: entry.status_code,
    metadata: entry.metadata || {}, prev_hash: previousHash };
  return crypto.createHash('sha256').update(JSON.stringify(sorted(payload))).digest('hex');
}
function organization(value, optional = false) {
  if (optional && value == null) return null;
  if (!['number', 'string'].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new ApiError(400, 'Organización inválida.');
  return Number(value);
}
function safeLimit(value, fallback, maximum) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 1) throw new ApiError(400, 'limit debe ser un entero positivo.');
  return Math.min(number, maximum);
}

function createMongoAuditService(injectedInfrastructure) {
  const infra = () => injectedInfrastructure || require('../infrastructure/platformMongo');
  async function appendAuditEvent(entry, db, session) {
    if (!db || !session) throw new ApiError(500, 'La auditoría requiere la transacción de la operación.');
    entry = JSON.parse(JSON.stringify(sorted(entry)));
    const organizationId = organization(entry.organization_id, true);
    const headId = `organization:${organizationId ?? 'global'}`;
    const infrastructure = infra();
    const heads = db.collection('soi_audit_heads');
    await heads.updateOne({ _id: headId }, { $setOnInsert: { version: 0, event_hash: null, audit_log_id: null } }, { upsert: true, session });
    const head = await heads.findOne({ _id: headId }, { session });
    if (!head || !Number.isSafeInteger(head.version)) throw new ApiError(503, 'La cadena de auditoría no está disponible.');
    const prevHash = head.event_hash || null;
    const document = { ...entry, organization_id: organizationId, user_id: entry.user_id || null, resource_id: entry.resource_id || null,
      metadata: entry.metadata || {}, audit_log_id: await infrastructure.nextId('soi_audit_events', session), created_at: new Date(), prev_hash: prevHash };
    document.event_hash = hashEntry(document, prevHash);
    await db.collection('soi_audit_events').insertOne(document, { session });
    const result = await heads.updateOne({ _id: headId, version: head.version, event_hash: prevHash }, { $set: { event_hash: document.event_hash, audit_log_id: document.audit_log_id }, $inc: { version: 1 } }, { session });
    if (result.modifiedCount !== 1) throw new ApiError(409, 'La cadena de auditoría cambió; reintenta la operación.');
    return infrastructure.cleanDocument(document);
  }
  async function logAuditEvent(entry) {
    // Freeze request values before an asynchronous transaction can observe mutations.
    entry = JSON.parse(JSON.stringify(sorted(entry)));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await infra().withMongoTransaction((db, session) => appendAuditEvent(entry, db, session)); }
      catch (error) {
        if (attempt < 2 && (error.code === 11000 || error instanceof ApiError && error.statusCode === 409)) continue;
        throw error;
      }
    }
  }

  async function listAuditLogs({ organizationId, limit = 100, action, resourceType, userId }) {
    const filter = { organization_id: organization(organizationId) };
    if (action) { if (typeof action !== 'string') throw new ApiError(400, 'action inválida.'); filter.action = action; }
    if (resourceType) { if (typeof resourceType !== 'string') throw new ApiError(400, 'resource_type inválido.'); filter.resource_type = resourceType; }
    if (userId) filter.user_id = organization(userId);
    const infrastructure = infra();
    const db = await infrastructure.getMongoDatabase();
    const rows = await db.collection('soi_audit_events').find(filter).sort({ created_at: -1, audit_log_id: -1 }).limit(safeLimit(limit, 100, 500)).toArray();
    return rows.map((row) => ({ ...infrastructure.cleanDocument(row), prev_hash: row.prev_hash || null, event_hash: row.event_hash || null }));
  }

  async function verifyAuditChain(organizationId, limit = 500) {
    const id = organization(organizationId);
    const maximum = safeLimit(limit, 500, 2000);
    return infra().withMongoTransaction(async (db, session) => {
      const records = await db.collection('soi_audit_events').find({ organization_id: id }, { session }).sort({ audit_log_id: 1 }).limit(maximum + 1).toArray();
      const rows = records.slice(0, maximum);
      const head = await db.collection('soi_audit_heads').findOne({ _id: `organization:${id}` }, { session });
      let previousHash = null;
      let hashedRows = 0;
      const failure = (failedAt) => ({ enabled: true, valid: false, checked: rows.length, hashed_rows: hashedRows, skipped_legacy_rows: 0, failed_at: failedAt });
      for (const row of rows) {
        if (row.prev_hash !== previousHash || row.event_hash !== hashEntry(row, previousHash)) return failure(row.audit_log_id);
        previousHash = row.event_hash;
        hashedRows += 1;
      }
      // Check the stored head when the complete chain fits in this page. This
      // also detects deletion of the final record or the entire event history.
      if (records.length <= maximum && ((head?.event_hash || null) !== previousHash || (head?.version || 0) !== rows.length || (rows.length && head?.audit_log_id !== rows.at(-1).audit_log_id))) return failure(head?.audit_log_id || rows.at(-1)?.audit_log_id || null);
      return { enabled: true, complete: records.length <= maximum, evaluated_at:new Date().toISOString(), valid: hashedRows > 0, checked: rows.length, hashed_rows: hashedRows, skipped_legacy_rows: 0, tail_hash: previousHash };
    });
  }
  return { logAuditEvent, appendAuditEvent, listAuditLogs, verifyAuditChain };
}

module.exports = { createMongoAuditService, hashEntry, ...createMongoAuditService() };
