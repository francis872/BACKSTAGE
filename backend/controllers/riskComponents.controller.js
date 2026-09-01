const asyncHandler = require('../utils/asyncHandler');
const riskComponentsService = require('../services/riskComponents.service');

const listComponents = asyncHandler(async (req, res) => {
  const rows = await riskComponentsService.listComponents();
  res.json(rows);
});

const getComponentById = asyncHandler(async (req, res) => {
  const row = await riskComponentsService.getComponentById(req.params.id);
  res.json(row);
});

const createComponent = asyncHandler(async (req, res) => {
  const row = await riskComponentsService.createComponent(req.body || {});
  res.status(201).json(row);
});

const updateComponent = asyncHandler(async (req, res) => {
  const row = await riskComponentsService.updateComponent(req.params.id, req.body || {});
  res.json(row);
});

const deleteComponent = asyncHandler(async (req, res) => {
  const row = await riskComponentsService.deleteComponent(req.params.id);
  res.json({ message: 'Componente de riesgo eliminado correctamente.', deleted: row });
});

module.exports = { listComponents, getComponentById, createComponent, updateComponent, deleteComponent };
