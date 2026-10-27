const asyncHandler = require('../utils/asyncHandler');
const retailZonesService = require('../services/retailZones.service');

const listZones = asyncHandler(async (req, res) => {
  const rows = await retailZonesService.listZones(req.user.organization_id);
  res.json(rows);
});

const getZoneById = asyncHandler(async (req, res) => {
  const row = await retailZonesService.getZoneById(req.params.id, req.user.organization_id);
  res.json(row);
});

const createZone = asyncHandler(async (req, res) => {
  const row = await retailZonesService.createZone(req.body || {}, req.user.organization_id);
  res.status(201).json(row);
});

const updateZone = asyncHandler(async (req, res) => {
  const row = await retailZonesService.updateZone(req.params.id, req.body || {}, req.user.organization_id);
  res.json(row);
});

const deleteZone = asyncHandler(async (req, res) => {
  const row = await retailZonesService.deleteZone(req.params.id, req.user.organization_id);
  res.json({ message: 'Zona retail eliminada correctamente.', deleted: row });
});

module.exports = { listZones, getZoneById, createZone, updateZone, deleteZone };
