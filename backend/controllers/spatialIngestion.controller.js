const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/spatialIngestion.service');

const registerSource = asyncHandler(async (req, res) => {
  const result = await service.registerSource(req.organization.organization_id, req.body);
  res.status(201).json(result);
});
const ingestGeoJSON = asyncHandler(async (req, res) => {
  const result = await service.ingestGeoJSON(req.organization.organization_id, req.body);
  res.status(201).json(result);
});
const ingestRemote = asyncHandler(async (req, res) => {
  const result = await service.ingestRemote(req.organization.organization_id, req.body);
  res.status(201).json(result);
});
const getTile = asyncHandler(async (req, res) => {
  res.json(await service.getTile(req.organization.organization_id, req.params, req.query));
});
const listSources = asyncHandler(async (req, res) => {
  res.json(await service.listSources(req.organization.organization_id));
});
const listJobs = asyncHandler(async (req, res) => {
  res.json(await service.listJobs(req.organization.organization_id));
});
const setSourceStatus = asyncHandler(async (req, res) => {
  res.json(await service.setSourceStatus(req.organization.organization_id, req.params.id, req.body.status));
});
const getStatus = asyncHandler(async (req, res) => res.json(service.getStatus()));

module.exports = { registerSource, ingestGeoJSON, ingestRemote, getTile, listSources, listJobs, setSourceStatus, getStatus };
