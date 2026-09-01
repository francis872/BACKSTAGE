const asyncHandler = require('../utils/asyncHandler');
const layersService = require('../services/layers.service');

const listLayers = asyncHandler(async (req, res) => {
  const rows = await layersService.listLayers(req.organization.organization_id, req.user.role);
  res.json(rows);
});

const getLayerById = asyncHandler(async (req, res) => {
  const row = await layersService.getLayerById(req.params.id, req.organization.organization_id, req.user.role);
  res.json(row);
});

const getLayerFeatures = asyncHandler(async (req, res) => {
  const geojson = await layersService.getLayerFeatures(req.params.id, req.query || {}, req.organization.organization_id, req.user.role);
  res.json(geojson);
});

module.exports = {
  listLayers,
  getLayerById,
  getLayerFeatures,
};
