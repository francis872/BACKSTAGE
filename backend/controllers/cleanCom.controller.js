const asyncHandler = require('../utils/asyncHandler');
const { service } = require('../cleancom/service');

function createControllers(service) {
  return {
    cases: asyncHandler(async (req, res) => res.json(await service.cases(req.organization.organization_id))),
    audit: asyncHandler(async (req, res) => res.json(await service.audit(req.organization.organization_id, req.params.caseId))),
    features: asyncHandler(async (req, res) => res.json(await service.features(req.organization.organization_id, req.params.caseId, req.params.layerId, req.query))),
  };
}
module.exports = { ...createControllers(service), createControllers };
