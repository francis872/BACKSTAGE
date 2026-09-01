const asyncHandler = require('../utils/asyncHandler');
const territorialService = require('../services/territorial.service');

const listUnits = asyncHandler(async (req, res) => {
  const rows = await territorialService.listUnits();
  res.json(rows);
});

const getUnitById = asyncHandler(async (req, res) => {
  const row = await territorialService.getUnitById(req.params.id);
  res.json(row);
});

const createUnit = asyncHandler(async (req, res) => {
  const row = await territorialService.createUnit(req.body || {});
  res.status(201).json(row);
});

const updateUnit = asyncHandler(async (req, res) => {
  const row = await territorialService.updateUnit(req.params.id, req.body || {});
  res.json(row);
});

const deleteUnit = asyncHandler(async (req, res) => {
  const row = await territorialService.deleteUnit(req.params.id);
  res.json({ message: 'Unidad territorial eliminada correctamente.', deleted: row });
});

const listFacilities = asyncHandler(async (req, res) => {
  const rows = await territorialService.listFacilities(req.query.unit_id || null);
  res.json(rows);
});

const createFacility = asyncHandler(async (req, res) => {
  const row = await territorialService.createFacility(req.body || {});
  res.status(201).json(row);
});

const listDimensionScores = asyncHandler(async (req, res) => {
  const rows = await territorialService.listDimensionScores(req.query.unit_id || null);
  res.json(rows);
});

const upsertDimensionScore = asyncHandler(async (req, res) => {
  const row = await territorialService.upsertDimensionScore(req.body || {});
  res.status(201).json(row);
});

const getUnitIndex = asyncHandler(async (req, res) => {
  const row = await territorialService.getUnitIndex(req.params.id);
  res.json(row);
});

const recomputeUnitIndex = asyncHandler(async (req, res) => {
  const row = await territorialService.recomputeUnitIndex(req.params.id);
  res.status(201).json(row);
});

const listUnitGaps = asyncHandler(async (req, res) => {
  const rows = await territorialService.listUnitGaps(req.params.id);
  res.json(rows);
});

const detectUnitGaps = asyncHandler(async (req, res) => {
  const rows = await territorialService.detectUnitGaps(req.params.id);
  res.status(201).json(rows);
});

const listGlobalGaps = asyncHandler(async (req, res) => {
  const rows = await territorialService.listGlobalGaps();
  res.json(rows);
});

const simulateUnit = asyncHandler(async (req, res) => {
  const row = await territorialService.simulateUnit(req.params.id, req.body || {});
  res.status(201).json(row);
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
};
