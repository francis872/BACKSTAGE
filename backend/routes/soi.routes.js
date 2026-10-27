const express = require('express');
const { authenticate } = require('../auth');
const { createRequireFreshOrganizationContext } = require('../middleware/soiOrganizationContext');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const asyncHandler = require('../utils/asyncHandler');
const { createSoiService } = require('../services/soi.service');

function createSoiRouter(service = createSoiService(), { organizationService } = {}) {
  const router = express.Router();
  router.use(authenticate, createRequireFreshOrganizationContext(organizationService));
  const read = authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER);
  const write = authorizeRoles(ROLES.ADMIN, ROLES.ANALYST);
  const context = (req) => ({ organizationId: req.organization.organization_id, role: req.organization.role, userId: req.user.user_id });
  const respond = (action, status = 200) => asyncHandler(async (req, res) => {
    res.status(status).json({ data: await action(req) });
  });
  router.get('/catalog', read, respond((req) => service.catalog(context(req))));
  router.get('/configuration', read, respond((req) => service.configuration(context(req))));
  router.get('/summary', read, respond((req) => service.summary(context(req))));
  router.put('/configuration', authorizeRoles(ROLES.ADMIN), respond((req) => service.saveConfiguration(context(req), req.body)));
  for (const kind of ['assets', 'operations', 'vehicles', 'incidents', 'crews', 'service-orders']) {
    router.get(`/${kind}`, read, respond((req) => service.list(context(req), kind, req.query.limit, req.query.offset)));
    router.post(`/${kind}`, write, respond((req) => service.create(context(req), kind, req.body), 201));
    if (kind !== 'assets') router.patch(`/${kind}/:id`, write, respond((req) => service.updateStatus(context(req), kind, req.params.id, req.body)));
  }
  router.patch('/assets/:id', write, respond((req) => service.updateAsset(context(req), req.params.id, req.body)));
  router.get('/operations/:id/assets', read, respond((req) => service.operationAssets(context(req), req.params.id)));
  router.put('/operations/:id/assets', write, respond((req) => service.operationAssets(context(req), req.params.id, req.body)));
  router.post('/imports/preview', write, respond((req) => service.preview(context(req), req.body)));
  router.post('/imports/commit', write, respond((req) => service.commit(context(req), req.body), 201));
  router.get('/comparisons', read, respond((req) => service.listComparisons(context(req))));
  router.post('/comparisons', write, respond((req) => service.saveComparison(context(req), req.body), 201));
  // Translate persistence errors without exposing SQL or infrastructure details.
  router.use((error, req, res, next) => {
    if (error.code === 11000) return res.status(409).json({ error: 'El registro o lote ya existe en esta organización.' });
    if (error.name?.startsWith('Mongo')) return res.status(503).json({ error: 'MongoDB no está disponible o requiere revisar sus índices SOI.' });
    if (error.code === '23505') return res.status(409).json({ error: 'El registro ya existe en esta organización.' });
    if (error.code === '23503') return res.status(409).json({ error: 'La referencia ya no está disponible.' });
    if (['42P01', '42703', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code)) {
      return res.status(503).json({ error: 'La persistencia SOI no está disponible.' });
    }
    if (error.details) return res.status(error.statusCode || 400).json({ error: error.message, details: error.details });
    return next(error);
  });
  return router;
}

module.exports = createSoiRouter();
module.exports.createSoiRouter = createSoiRouter;
