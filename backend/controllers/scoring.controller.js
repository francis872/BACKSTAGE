const asyncHandler = require('../utils/asyncHandler');
const scoringService = require('../services/scoring.service');

const evaluate = asyncHandler(async (req, res) => {
  const { location_id, model_id } = req.body || {};
  const row = await scoringService.evaluate(location_id, model_id);
  res.status(201).json(row);
});

const latestForLocation = asyncHandler(async (req, res) => {
  const row = await scoringService.getLatest(req.params.location_id);
  res.json(row);
});

module.exports = { evaluate, latestForLocation };
