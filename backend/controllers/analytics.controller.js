const asyncHandler = require('../utils/asyncHandler');
const analyticsService = require('../services/analytics.service');
const runGis = asyncHandler(async (req, res) => {
  const { algorithm = 'distance_matrix', ...params } = req.body || {};
  res.status(201).json(await analyticsService.executeAlgorithm(`gis.${algorithm}`, params, { sessionUser: req.user, organization: req.organization, context: { module: 'gis' } }));
});

const runMulticriteria = asyncHandler(async (req, res) => {
  const { method = 'topsis', ...params } = req.body || {};
  const algorithmName = `multicriteria.${method}`;
  const result = await analyticsService.executeAlgorithm(algorithmName, params, {
    sessionUser: req.user, organization: req.organization, context: { module: 'comparador' },
  });
  res.status(201).json(result);
});

const runMulticriteriaSensitivity = asyncHandler(async (req, res) => {
  const result = await analyticsService.executeAlgorithm('multicriteria.sensitivity', req.body || {}, {
    sessionUser: req.user, organization: req.organization, context: { module: 'comparador' },
  });
  res.status(201).json(result);
});

const runAhpWeights = asyncHandler(async (req, res) => {
  const result = await analyticsService.executeAlgorithm('multicriteria.ahp_weights', req.body || {}, {
    sessionUser: req.user, organization: req.organization, context: { module: 'comparador' },
  });
  res.status(201).json(result);
});

const runFinancial = asyncHandler(async (req, res) => {
  const { algorithm = 'npv_irr', ...params } = req.body || {};
  const result = await analyticsService.executeAlgorithm(`financial.${algorithm}`, params, {
    sessionUser: req.user, organization: req.organization, context: { module: 'portfolio' },
  });
  res.status(201).json(result);
});

const runRiskSimulation = asyncHandler(async (req, res) => {
  const { algorithm = 'monte_carlo', ...params } = req.body || {};
  const result = await analyticsService.executeAlgorithm(`risk.${algorithm}`, params, {
    sessionUser: req.user, organization: req.organization, context: { module: 'riesgos' },
  });
  res.status(201).json(result);
});

const listAlgorithms = asyncHandler(async (req, res) => {
  res.json(analyticsService.listAlgorithms());
});

const listJobs = asyncHandler(async (req, res) => {
  const rows = await analyticsService.listJobs(req.organization?.organization_id, {
    algorithmName: req.query?.algorithm,
    limit: req.query?.limit,
    projectId: req.query?.project_id,
  });
  res.json(rows);
});

const getJob = asyncHandler(async (req, res) => {
  const job = await analyticsService.getJob(req.params.id, req.organization?.organization_id);
  res.json(job);
});
const verifyJob = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await analyticsService.verifyJob(req.params.id, req.organization.organization_id));
});
const exportJob = asyncHandler(async (req, res) => {
  const output = await analyticsService.exportJob(req.params.id, req.organization.organization_id);
  res.set('Cache-Control', 'no-store').attachment(`backstage-analisis-${Number(output.snapshot.analytics_job_id)}.json`).json(output);
});

module.exports = {
  runGis,
  runMulticriteria,
  runMulticriteriaSensitivity,
  runAhpWeights,
  runFinancial,
  runRiskSimulation,
  listAlgorithms,
  listJobs,
  getJob,
  verifyJob,
  exportJob,
};
