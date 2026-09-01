const asyncHandler = require('../utils/asyncHandler');
const recommendationsService = require('../services/recommendations.service');

const listRecommendations = asyncHandler(async (req, res) => {
  const rows = await recommendationsService.listRecommendations(req.organization.organization_id);
  res.json(rows);
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

const getExampleRecommendation = asyncHandler(async (req, res) => {
  const row = await recommendationsService.getExampleRecommendation();
  res.json(row);
});

module.exports = {
  listRecommendations,
  getRecommendationById,
  createRecommendation,
  updateRecommendation,
  deleteRecommendation,
  getExampleRecommendation,
};
