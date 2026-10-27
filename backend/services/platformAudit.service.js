const { createMongoAuditService } = require('./mongoAudit.service');

// A committed domain fact shares the mutation's transaction; no request bodies or tokens.
async function appendPlatformAudit(infrastructure, database, session, context, action, resourceType, resourceId, metadata = {}) {
  return createMongoAuditService(infrastructure).appendAuditEvent({
    organization_id: Number(context.organizationId),
    user_id: Number(context.userId),
    action,
    resource_type: resourceType,
    resource_id: String(resourceId),
    request_method: 'DOMAIN',
    request_path: null,
    status_code: 200,
    metadata,
  }, database, session);
}
module.exports = { appendPlatformAudit };
