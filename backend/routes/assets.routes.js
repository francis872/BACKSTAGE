const express = require('express');
const { authenticate } = require('../auth');
const { createRequireOrganizationContext } = require('../middleware/organizationContext');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const wrap = require('../utils/asyncHandler');
const { service } = require('../services/assets.service');
function createAssetsRouter(assets = service, organizationService, propertyLayer = require('../services/horizontalProperty.service').createHorizontalPropertyService(), operations, spatialAnalysis, economics, normative, community) {
  const router = express.Router();
  router.use(authenticate, createRequireOrganizationContext(organizationService), authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER));
  router.use('/:id/community', require('./communityKnowledge.routes').createCommunityKnowledgeRouter(community));
  const layer = '/layers/horizontal-property';
  router.use(`${layer}/:id/operations`, require('./propertyOperations.routes').createPropertyOperationsRouter(operations));
  router.use(`${layer}/:id/analysis`, require('./propertySpatialAnalysis.routes').createPropertySpatialAnalysisRouter(spatialAnalysis));
  router.use(`${layer}/:id/economics`, require('./economicIntelligence.routes').createEconomicIntelligenceRouter(economics));
  router.use(`${layer}/:id/normative`, require('./normativeIntelligence.routes').createNormativeIntelligenceRouter(normative));
  const context = req => ({ organizationId: req.organization.organization_id, userId: req.user.user_id,
    session: { session_version: req.user.session_version ?? 0, session_id: req.user.session_id || null } });
  router.get(`${layer}/catalog`, (req, res) => res.json(propertyLayer.catalog()));
  router.get(`${layer}/geojson`, wrap(async (req, res) => res.json(await propertyLayer.geojson(context(req)))));
  router.get(layer, wrap(async (req, res) => res.json(await propertyLayer.list(context(req), req.query))));
  router.post(layer, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), wrap(async (req, res) => {
    const result = await propertyLayer.create(context(req), req.body, req.get('Idempotency-Key'));
    res.status(result.created ? 201 : 200).json(result);
  }));
  router.get(`${layer}/:id`, wrap(async (req, res) => res.json(await propertyLayer.get(context(req), req.params.id))));
  router.patch(`${layer}/:id`, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), wrap(async (req, res) => res.json(await propertyLayer.update(context(req), req.params.id, req.body))));
  router.post(`${layer}/:id/archive`, authorizeRoles(ROLES.ADMIN), wrap(async (req, res) => res.json(await propertyLayer.archive(context(req), req.params.id, req.body))));
  router.get('/', wrap(async (req, res) => res.json(await assets.list(req.organization.organization_id, req.query))));
  router.post('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), wrap(async (req, res) => res.status(201).json({ data: await assets.create({ organizationId:req.organization.organization_id, userId:req.user.user_id, role:req.organization.role }, req.body) })));
  router.get('/:id', wrap(async (req, res) => res.json({ data: await assets.get(req.organization.organization_id, req.params.id) })));
  return router;
}
module.exports = createAssetsRouter();
module.exports.createAssetsRouter = createAssetsRouter;
