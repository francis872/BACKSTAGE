const { logAuditEvent, sanitizeBody } = require('../services/auditLogs.service');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function buildAction(method) {
  switch (method) {
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return 'unknown';
  }
}

module.exports = function auditLogger(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  const startTime = Date.now();
  res.on('finish', () => {
    const segments = req.path.split('/').filter(Boolean);
    const resourceType = segments[0] || 'root';
    const resourceId = segments.length > 1 ? segments[1] : null;
    const metadata = {
      duration_ms: Date.now() - startTime,
      ip: req.ip,
      user_agent: req.get('user-agent') || null,
      body: sanitizeBody(req.body),
      query: req.query || null,
    };
    logAuditEvent({
      organization_id: req.organization?.organization_id || req.user?.organization_id || null,
      user_id: req.user?.user_id || null,
      action: buildAction(req.method),
      resource_type: resourceType,
      resource_id: resourceId,
      request_method: req.method,
      request_path: req.originalUrl,
      status_code: res.statusCode,
      metadata,
    }).catch((error) => {
      console.error('No se pudo persistir el audit log:', error.message);
    });
  });

  next();
};

