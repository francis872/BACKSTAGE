const asyncHandler = require('../utils/asyncHandler');
const locationsService = require('../services/locations.service');

const listLocations = asyncHandler(async (req, res) => {
  const rows = await locationsService.listLocations({ organizationId: req.organization.organization_id });
  res.json(rows);
});

const getLocationById = asyncHandler(async (req, res) => {
  const row = await locationsService.getLocationById(req.params.id, req.organization.organization_id);
  res.json(row);
});

const findNearby = asyncHandler(async (req, res) => {
  const rows = await locationsService.findNearby({
    lat: parseFloat(req.query.lat),
    lng: parseFloat(req.query.lng),
    radius: parseFloat(req.query.radius) || 2000,
    organizationId: req.organization.organization_id,
  });
  res.json(rows);
});

const createLocation = asyncHandler(async (req, res) => {
  const row = await locationsService.createLocation(req.body || {}, req.organization.organization_id);
  res.status(201).json(row);
});

const updateLocation = asyncHandler(async (req, res) => {
  const row = await locationsService.updateLocation(req.params.id, req.body || {}, req.organization.organization_id);
  res.json(row);
});

const deleteLocation = asyncHandler(async (req, res) => {
  const row = await locationsService.deleteLocation(req.params.id, req.organization.organization_id);
  res.json({ message: 'Ubicación eliminada correctamente.', deleted: row });
});

module.exports = {
  listLocations,
  getLocationById,
  findNearby,
  createLocation,
  updateLocation,
  deleteLocation,
};
