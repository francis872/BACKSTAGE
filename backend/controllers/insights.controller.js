const asyncHandler = require('../utils/asyncHandler');
const insightsService = require('../services/insights.service');

const getSummary = asyncHandler(async (req, res) => {
  const summary = await insightsService.getSummary(req.organization.organization_id);
  res.json(summary);
});

module.exports = { getSummary };
