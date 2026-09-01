const asyncHandler = require('../utils/asyncHandler');
const riskAssessmentsService = require('../services/riskAssessments.service');

const listAssessments = asyncHandler(async (req, res) => {
  const rows = await riskAssessmentsService.listAssessments(req.organization.organization_id);
  res.json(rows);
});

const getAssessmentById = asyncHandler(async (req, res) => {
  const row = await riskAssessmentsService.getAssessmentById(req.params.id, req.organization.organization_id);
  res.json(row);
});

const createAssessment = asyncHandler(async (req, res) => {
  const row = await riskAssessmentsService.createAssessment(req.body || {}, req.organization.organization_id);
  res.status(201).json(row);
});

const updateAssessment = asyncHandler(async (req, res) => {
  const row = await riskAssessmentsService.updateAssessment(req.params.id, req.body || {}, req.organization.organization_id);
  res.json(row);
});

const deleteAssessment = asyncHandler(async (req, res) => {
  const row = await riskAssessmentsService.deleteAssessment(req.params.id, req.organization.organization_id);
  res.json({ message: 'Evaluación de riesgo eliminada correctamente.', deleted: row });
});

module.exports = { listAssessments, getAssessmentById, createAssessment, updateAssessment, deleteAssessment };
