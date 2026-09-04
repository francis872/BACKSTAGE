const asyncHandler = require('../utils/asyncHandler');
const recommendationsService = require('../services/recommendations.service');

const listRecommendations = asyncHandler(async (req, res) => {
  const rows = await recommendationsService.listRecommendations(req.organization.organization_id, {
    status: req.query?.status,
    priority: req.query?.priority,
    limit: req.query?.limit,
  });
  res.json(rows);
});

const getSummary = asyncHandler(async (req, res) => {
  const summary = await recommendationsService.getSummary(req.organization.organization_id);
  res.json(summary);
});

const getRecommendationById = asyncHandler(async (req, res) => {
  const row = await recommendationsService.getRecommendationById(req.params.id, req.organization.organization_id);
  res.json(row);
});

const createRecommendation = asyncHandler(async (req, res) => {
  const row = await recommendationsService.createRecommendation(req.body || {}, req.user, req.organization);
  res.status(201).json(row);
});

const updateRecommendation = asyncHandler(async (req, res) => {
  const row = await recommendationsService.updateRecommendation(req.params.id, req.body || {}, req.organization);
  res.json(row);
});

const deleteRecommendation = asyncHandler(async (req, res) => {
  const row = await recommendationsService.deleteRecommendation(req.params.id, req.organization);
  res.json({ message: 'Recomendación eliminada correctamente.', deleted: row });
});

const reviewRecommendation = asyncHandler(async (req, res) => {
  const row = await recommendationsService.reviewRecommendation(
    req.params.id, req.organization.organization_id, req.user, req.body || {}
  );
  res.json(row);
});

const generateFromAnalysisRun = asyncHandler(async (req, res) => {
  const rows = await recommendationsService.generateFromAnalysisRun(
    req.params.analysisRunId, req.organization.organization_id, req.user, { topN: req.body?.topN }
  );
  res.status(201).json(rows);
});

const getExampleRecommendation = asyncHandler(async (req, res) => {
  const row = await recommendationsService.getExampleRecommendation();
  res.json(row);
});

module.exports = {
  listRecommendations,
  getSummary,
  getRecommendationById,
  createRecommendation,
  updateRecommendation,
  deleteRecommendation,
  reviewRecommendation,
  generateFromAnalysisRun,
  getExampleRecommendation,
};
