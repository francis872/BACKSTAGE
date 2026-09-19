const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/operationalEvents.service');

const listEvents = asyncHandler(async (req, res) => {
  const rows = await service.list(req.organization?.organization_id, {
    limit: req.query?.limit,
    severity: req.query?.severity || null,
  });
  res.json(rows);
});

const listAlerts = asyncHandler(async (req, res) => {
  const rows = await service.alerts(req.organization?.organization_id, req.query?.limit);
  res.json(rows);
});

const getSummary = asyncHandler(async (req, res) => {
  res.json(await service.summary(req.organization?.organization_id));
});

module.exports = { listEvents, listAlerts, getSummary };
