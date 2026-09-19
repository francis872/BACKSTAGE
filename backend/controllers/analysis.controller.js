const asyncHandler = require('../utils/asyncHandler');
const analysisService = require('../services/analysis.service');


const createOperationalProject = asyncHandler(async (req, res) => {
  const result = await analysisService.createOperationalProject(req.body || {}, req.user || null, req.organization || null);
  res.status(201).json(result);
});

const listProjectCandidates = asyncHandler(async (req, res) => {
  const rows = await analysisService.listProjectCandidates(req.params.id, req.organization?.organization_id);
  res.json(rows);
});

const addProjectCandidate = asyncHandler(async (req, res) => {
  const rows = await analysisService.addProjectCandidate(
    req.params.id,
    req.body?.location_id,
    req.user || null,
    req.organization || null
  );
  res.json(rows);
});

const removeProjectCandidate = asyncHandler(async (req, res) => {
  const rows = await analysisService.removeProjectCandidate(
    req.params.id,
    req.params.locationId,
    req.user || null,
    req.organization || null
  );
  res.json(rows);
});

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

const getOperationalBoard = asyncHandler(async (req, res) => {
  const rows = await analysisService.listOperationalBoard(req.organization?.organization_id, req.query?.limit);
  res.json(rows);
});

const compareCandidates = asyncHandler(async (req, res) => {
  const result = await analysisService.compareCandidates(req.body || {}, req.user || null, req.organization || null);
  res.status(201).json(result);
});



const getOperationalRisks = asyncHandler(async (req, res) => {
  const result = await analysisService.getOperationalRisks(req.params.id, req.organization?.organization_id);
  res.json(result);
});

const reviewOperationalRisks = asyncHandler(async (req, res) => {
  const result = await analysisService.reviewOperationalRisks(
    req.params.id,
    req.user || null,
    req.organization || null
  );
  res.json(result);
});

const saveProbabilityResult = asyncHandler(async (req, res) => {
  const result = await analysisService.saveProbabilityResult(
    req.params.id,
    req.body || {},
    req.user || null,
    req.organization || null
  );
  res.json(result);
});

const getProbabilityResult = asyncHandler(async (req, res) => {
  const result = await analysisService.getProbabilityResult(req.params.id, req.organization?.organization_id);
  res.json(result);
});


const generateOperationalReport = asyncHandler(async (req, res) => {
  const result = await analysisService.generateOperationalReport(
    req.params.id,
    req.user || null,
    req.organization || null
  );
  res.json(result);
});

const getPrintableReport = asyncHandler(async (req, res) => {
  const report = await analysisService.getPrintableReport(req.params.id, req.organization?.organization_id);
  res.json(report);
});

const executeOperationalCommand = asyncHandler(async (req, res) => {
  const result = await analysisService.executeOperationalCommand(
    req.params.id,
    req.body?.command,
    req.body || {},
    req.user || null,
    req.organization || null
  );
  res.json(result);
});

module.exports = {
  runAnalysis,
  createOperationalProject,
  listProjectCandidates,
  addProjectCandidate,
  removeProjectCandidate,
  getAnalysisById,
  listAnalysisRuns,
  compareCandidates,
  getPrintableReport,
  generateOperationalReport,
  getOperationalBoard,
  saveProbabilityResult,
  getProbabilityResult,
  getOperationalRisks,
  reviewOperationalRisks,
};
