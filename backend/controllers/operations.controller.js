const asyncHandler = require('../utils/asyncHandler');
const metrics = require('../services/operationalMetrics.service');

const health = asyncHandler(async (req, res) => {
  res.json(await metrics.health());
});

const operationalMetrics = asyncHandler(async (req, res) => {
  const organizationId = req.organization?.organization_id || req.user?.organization_id;
  res.json(await metrics.metrics(organizationId));
});

const diagnostics = asyncHandler(async (req, res) => {
  const organizationId = req.organization?.organization_id || req.user?.organization_id;
  const result = await metrics.diagnostics(req.params.id, organizationId);
  if (!result) return res.status(404).json({ error: 'Proyecto operativo no encontrado.' });
  return res.json(result);
});

module.exports = { health, operationalMetrics, diagnostics };
