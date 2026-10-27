const express = require('express');
const { authenticate } = require('../auth');
const { createRequireFreshOrganizationContext } = require('../middleware/soiOrganizationContext');
const { authorizeRoles } = require('../middleware/rbac');
const wrap = require('../utils/asyncHandler');
const { service } = require('../services/soiFleet.service');
function createFleetRouter(fleet = service, { organizationService } = {}) {
  const router = express.Router();
  router.use(authenticate, createRequireFreshOrganizationContext(organizationService), authorizeRoles('admin', 'analyst', 'viewer'));
  const org = (req) => req.organization.organization_id;
  router.get('/status', wrap(async (req, res) => res.json(await fleet.status(org(req)))));
  router.get('/sources', wrap(async (req, res) => res.json({ data: await fleet.sources(org(req)) })));
  router.get('/vehicles/:id/positions', wrap(async (req, res) => res.json(await fleet.positions(org(req), req.params.id, req.query.after))));
  router.use(authorizeRoles('admin'));
  router.post('/sources', wrap(async (req, res) => res.status(201).json({ data: await fleet.createSource(org(req), req.user.user_id, req.body) })));
  router.patch('/sources/:id', wrap(async (req, res) => res.json({ data: await fleet.updateSource(org(req), req.params.id, req.body) })));
  router.post('/vehicles/:id/positions', wrap(async (req, res) => res.status(201).json(await fleet.ingest(org(req), req.user.user_id, req.params.id, req.body))));
  router.use((error, req, res, next) => {
    if (error.code === 11000) return res.status(409).json({ error: 'El evento de telemetria ya existe.' });
    if (!error.statusCode || error.statusCode >= 500) return res.status(503).json({ error: 'La persistencia MongoDB de flotas no esta disponible.' });
    return next(error);
  });
  return router;
}
module.exports = createFleetRouter();
module.exports.createFleetRouter = createFleetRouter;
