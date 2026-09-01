const asyncHandler = require('../utils/asyncHandler');
const realEstateService = require('../services/realEstate.service');

const getPortfolio = asyncHandler(async (req, res) => {
  const data = await realEstateService.getPortfolio();
  res.json(data);
});

const getProperties = asyncHandler(async (req, res) => {
  const rows = await realEstateService.getProperties();
  res.json(rows);
});

const listValuations = asyncHandler(async (req, res) => {
  const rows = await realEstateService.listValuations();
  res.json(rows);
});

const getValuationById = asyncHandler(async (req, res) => {
  const row = await realEstateService.getValuationById(req.params.id);
  res.json(row);
});

const createValuation = asyncHandler(async (req, res) => {
  const row = await realEstateService.createValuation(req.body || {});
  res.status(201).json(row);
});

const updateValuation = asyncHandler(async (req, res) => {
  const row = await realEstateService.updateValuation(req.params.id, req.body || {});
  res.json(row);
});

const deleteValuation = asyncHandler(async (req, res) => {
  const row = await realEstateService.deleteValuation(req.params.id);
  res.json({ message: 'Avalúo eliminado correctamente.', deleted: row });
});

module.exports = {
  getPortfolio,
  getProperties,
  listValuations,
  getValuationById,
  createValuation,
  updateValuation,
  deleteValuation,
};
