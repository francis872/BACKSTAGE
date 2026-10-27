const asyncHandler = require('../utils/asyncHandler');
const realEstateService = require('../services/realEstate.service');

const getPortfolio = asyncHandler(async (req, res) => {
  const data = await realEstateService.getPortfolio(req.organization.organization_id);
  res.json(data);
});

const getProperties = asyncHandler(async (req, res) => {
  const rows = await realEstateService.getProperties(req.organization.organization_id);
  res.json(rows);
});

const listValuations = asyncHandler(async (req, res) => {
  const rows = await realEstateService.listValuations(req.organization.organization_id);
  res.json(rows);
});

const getValuationById = asyncHandler(async (req, res) => {
  const row = await realEstateService.getValuationById(req.params.id, req.organization.organization_id);
  res.json(row);
});

const createValuation = asyncHandler(async (req, res) => {
  const row = await realEstateService.createValuation(req.body || {}, req.organization.organization_id);
  res.status(201).json(row);
});

const updateValuation = asyncHandler(async (req, res) => {
  const row = await realEstateService.updateValuation(req.params.id, req.body || {}, req.organization.organization_id);
  res.json(row);
});

const deleteValuation = asyncHandler(async (req, res) => {
  const row = await realEstateService.deleteValuation(req.params.id, req.organization.organization_id);
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
