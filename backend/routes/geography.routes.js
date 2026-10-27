const express = require('express');
const { authenticate } = require('../auth');
const { createRequireOrganizationContext } = require('../middleware/organizationContext');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/geography.service');
const ApiError = require('../utils/ApiError');

function createGeoRouter(geoService = service, { organizationService } = {}) {
const router = express.Router();
router.use(authenticate, createRequireOrganizationContext(organizationService), authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER));
router.get('/capabilities', (req, res) => res.json(geoService.capabilities(req.organization.organization_id)));
for (const [path, method] of [['/geocode', 'geocode'], ['/autocomplete', 'autocomplete'], ['/reverse', 'reverse'], ['/elevation', 'elevation'], ['/surface', 'surface']]) {
  router.get(path, asyncHandler(async (req, res) => res.json(await geoService[method](req.organization.organization_id, req.query))));
}
router.get('/route-plans', asyncHandler(async (req, res) => res.json(await geoService.listRoutePlans(req.organization.organization_id, req.query))));
router.get('/route-plans/:id', asyncHandler(async (req, res) => res.json(await geoService.getRoutePlan(req.organization.organization_id, req.params.id))));
router.post('/route-plans', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), asyncHandler(async (req, res) => res.status(201).json(await geoService.saveRoutePlan(req.organization.organization_id, req.body, req.user.user_id))));
for (const [path, method] of [['/routes', 'route'], ['/profile', 'profile']]) {
  router.post(path, asyncHandler(async (req, res) => res.json(await geoService[method](req.organization.organization_id, req.body))));
}
router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 11000) return res.status(409).json({ error: 'La ruta ya existe en esta organización.' });
  if (error instanceof ApiError && [400, 401, 403, 404, 409, 413, 422, 429, 502, 503].includes(error.statusCode)) return res.status(error.statusCode).json({ error: error.message });
  // Unknown infrastructure errors must never reach the development error handler,
  // which can expose connection strings or environment details.
  const unavailable = error.name?.startsWith('Mongo') || ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code);
  return res.status(unavailable ? 503 : 500).json({ error: unavailable ? 'La persistencia geográfica no está disponible.' : 'No fue posible completar la solicitud geográfica.' });
});
return router;
}

module.exports = createGeoRouter();
module.exports.createGeoRouter = createGeoRouter;
