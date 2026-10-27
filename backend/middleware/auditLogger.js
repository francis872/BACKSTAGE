const { logAuditEvent, sanitizeBody } = require('../services/auditLogs.service');
const {waitUntil}=require('@vercel/functions');

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
    const requestPath = (req.originalUrl || req.path).split('?')[0];
    const segments = requestPath.split('/').filter(Boolean);
    const resourceType = segments[0] || 'root';
    const resourceId = segments.length > 1 ? segments[1] : null;
    const sanitaryScience=/^\/soi\/sanitary\/(optimization|predict|coverage|climate)(?:\/|$)/.test(req.originalUrl||'');
    const metadata = {
      duration_ms: Date.now() - startTime,
      ip: req.ip,
      user_agent: req.get('user-agent') || null,
      body: /^\/(feed(?:\/|$)|auth(?:\/|$)|assets\/layers\/horizontal-property(?:\/|$)|computational(?:\/|$)|integrations(?:\/|$))/.test(req.originalUrl||'') ? {content:'omitted_for_privacy'} : sanitaryScience ? {analysis_payload:'omitted_for_retention_policy',operation:req.body?.operation||null} : req.originalUrl?.includes('/soi/bsie') ? { analysis_payload: 'omitted_for_retention_policy', operation: req.body?.operation } : (req.originalUrl?.includes('/soi/trips') || req.originalUrl?.includes('/soi/fleet') || req.originalUrl?.includes('/soi/bsie'))
        ? { gps_payload: 'omitted_for_retention_policy', point_count: Array.isArray(req.body?.points) ? req.body.points.length : undefined, state: req.body?.state }
        : req.originalUrl?.includes('/soi/imports')
          ? { import_payload: 'omitted', format: req.body?.format, preview_hash: req.body?.preview_hash }
          : sanitizeBody(req.body),
      query: (req.originalUrl?.includes('/soi/trips') || req.originalUrl?.includes('/soi/fleet') || req.originalUrl?.includes('/soi/bsie')) ? null : sanitizeBody(req.query),
    };
    const auditTask=logAuditEvent({
      organization_id: req.organization?.organization_id || req.user?.organization_id || null,
      user_id: req.user?.user_id || null,
      action: buildAction(req.method),
      resource_type: resourceType,
      resource_id: resourceId,
      request_method: req.method,
      request_path: requestPath,
      status_code: res.statusCode,
      metadata,
    }).catch((error) => {
      console.error('No se pudo persistir el audit log:', error.message);
    });
    if(process.env.VERCEL)waitUntil(auditTask);
  });

  next();
};

