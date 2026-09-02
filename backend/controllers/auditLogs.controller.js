const asyncHandler = require('../utils/asyncHandler');
const auditLogsService = require('../services/auditLogs.service');

const listAuditLogs = asyncHandler(async (req, res) => {
  const rows = await auditLogsService.listAuditLogs({
    organizationId: req.organization.organization_id,
    limit: req.query.limit,
    action: req.query.action,
    resourceType: req.query.resource_type,
    userId: req.query.user_id,
  });
  res.json(rows);
});

const verifyChain = asyncHandler(async (req, res) => {
  const status = await auditLogsService.verifyAuditChain(
    req.organization.organization_id,
    req.query.limit
  );
  res.json(status);
});

module.exports = {
  listAuditLogs,
  verifyChain,
};
