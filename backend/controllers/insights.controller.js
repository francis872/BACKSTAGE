const asyncHandler = require('../utils/asyncHandler');
const insightsService = require('../services/insights.service');
const analysisService = require('../services/analysis.service');

const getSummary = asyncHandler(async (req, res) => {
  const summary = await insightsService.getSummary(req.organization.organization_id);
  res.json(summary);
});

const listOpportunities = asyncHandler(async (req, res) => {
  res.json(await insightsService.listOpportunities(req.organization.organization_id));
});

const createProjectFromOpportunity = asyncHandler(async (req, res) => {
  const opportunity = await insightsService.getOpportunity(req.params.locationId, req.organization.organization_id);
  const project = await analysisService.createOperationalProject({
    project_name: req.body?.project_name || `Oportunidad ${opportunity.name}`,
    city: opportunity.city,
    objective: req.body?.objective || `Validar oportunidad territorial #${opportunity.rank} con puntaje ${opportunity.opportunity_score}/100.`,
  }, req.user, req.organization);
  await analysisService.addProjectCandidate(project.analysis_run_id, opportunity.location_id, req.user, req.organization);
  res.status(201).json({ ...project, opportunity });
});

module.exports = { getSummary, listOpportunities, createProjectFromOpportunity };
