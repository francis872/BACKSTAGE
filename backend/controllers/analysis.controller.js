const asyncHandler = require('../utils/asyncHandler');
const analysisService = require('../services/analysis.service');

const runAnalysis = asyncHandler(async (req, res) => {
  const result = await analysisService.runGeostrategicAnalysis(req.body || {}, req.user || null, req.organization || null);
  res.status(201).json(result);
});

const getAnalysisById = asyncHandler(async (req, res) => {
  const result = await analysisService.getAnalysisRunById(req.params.id, req.organization?.organization_id);
  res.json(result);
});

const listAnalysisRuns = asyncHandler(async (req, res) => {
  const rows = await analysisService.listAnalysisRuns(req.organization?.organization_id, req.query?.limit);
  res.json(rows);
});

const compareCandidates = asyncHandler(async (req, res) => {
  const result = await analysisService.compareCandidates(req.body || {}, req.user || null, req.organization || null);
  res.status(201).json(result);
});

const getPrintableReport = asyncHandler(async (req, res) => {
  const report = await analysisService.getPrintableReport(req.params.id, req.organization?.organization_id);
  res.json(report);
});

module.exports = {
  runAnalysis,
  getAnalysisById,
  listAnalysisRuns,
  compareCandidates,
  getPrintableReport,
};
