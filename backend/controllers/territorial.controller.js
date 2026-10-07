const asyncHandler = require('../utils/asyncHandler');
const territorialService = require('../services/territorial.service');
const analysisService = require('../services/analysis.service');

const listUnits = asyncHandler(async (req, res) => {
  const rows = await territorialService.listUnits(req.organization.organization_id);
  res.json(rows);
});

const getUnitById = asyncHandler(async (req, res) => {
  const row = await territorialService.getUnitById(req.params.id, req.organization.organization_id);
  res.json(row);
});

const createUnit = asyncHandler(async (req, res) => {
  const row = await territorialService.createUnit(req.body || {}, req.organization.organization_id);
  res.status(201).json(row);
});

const updateUnit = asyncHandler(async (req, res) => {
  const row = await territorialService.updateUnit(req.params.id, req.body || {}, req.organization.organization_id);
  res.json(row);
});

const deleteUnit = asyncHandler(async (req, res) => {
  const row = await territorialService.deleteUnit(req.params.id, req.organization.organization_id);
  res.json({ message: 'Unidad territorial eliminada correctamente.', deleted: row });
});

const listFacilities = asyncHandler(async (req, res) => {
  const rows = await territorialService.listFacilities(req.query.unit_id || null, req.organization.organization_id);
  res.json(rows);
});

const createFacility = asyncHandler(async (req, res) => {
  const row = await territorialService.createFacility(req.body || {}, req.organization.organization_id);
  res.status(201).json(row);
});

const listDimensionScores = asyncHandler(async (req, res) => {
  const rows = await territorialService.listDimensionScores(req.query.unit_id || null, req.organization.organization_id);
  res.json(rows);
});

const upsertDimensionScore = asyncHandler(async (req, res) => {
  const row = await territorialService.upsertDimensionScore(req.body || {}, req.organization.organization_id);
  res.status(201).json(row);
});

const getUnitIndex = asyncHandler(async (req, res) => {
  const row = await territorialService.getUnitIndex(req.params.id, req.organization.organization_id);
  res.json(row);
});

const recomputeUnitIndex = asyncHandler(async (req, res) => {
  const row = await territorialService.recomputeUnitIndex(req.params.id, req.organization.organization_id);
  res.status(201).json(row);
});

const listUnitGaps = asyncHandler(async (req, res) => {
  const rows = await territorialService.listUnitGaps(req.params.id, req.organization.organization_id);
  res.json(rows);
});

const detectUnitGaps = asyncHandler(async (req, res) => {
  const rows = await territorialService.detectUnitGaps(req.params.id, req.organization.organization_id);
  res.status(201).json(rows);
});

const listGlobalGaps = asyncHandler(async (req, res) => {
  const rows = await territorialService.listGlobalGaps(req.organization.organization_id);
  res.json(rows);
});

const simulateUnit = asyncHandler(async (req, res) => {
  const row = await territorialService.simulateUnit(req.params.id, req.body || {}, req.organization.organization_id);
  res.status(201).json(row);
});

const listUnitSimulations = asyncHandler(async (req, res) => {
  res.json(await territorialService.listUnitSimulations(req.params.id, req.organization.organization_id));
});

const createProjectFromGap = asyncHandler(async (req, res) => {
  const unit = await territorialService.getUnitById(req.params.id, req.organization.organization_id);
  const gap = await territorialService.getUnitGap(req.params.id, req.params.gapId, req.organization.organization_id);
  const project = await analysisService.createOperationalProject({
    project_name: req.body?.project_name || `Cerrar brecha: ${gap.gap_type}`,
    city: unit.city,
    objective: req.body?.objective || gap.message,
  }, req.user, req.organization);
  res.status(201).json({ ...project, unit, gap });
});

module.exports = {
  listUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
  listFacilities,
  createFacility,
  listDimensionScores,
  upsertDimensionScore,
  getUnitIndex,
  recomputeUnitIndex,
  listUnitGaps,
  detectUnitGaps,
  listGlobalGaps,
  simulateUnit,
  listUnitSimulations,
  createProjectFromGap,
};
