const express = require('express');
const { authenticate } = require('../auth');
const { createRequireFreshOrganizationContext } = require('../middleware/soiOrganizationContext');
const { authorizeRoles } = require('../middleware/rbac');
const wrap = require('../utils/asyncHandler');
const { service } = require('../services/soiTrips.service');
function createTripsRouter(trips = service, { organizationService } = {}) {
const router = express.Router();
router.use(authenticate, createRequireFreshOrganizationContext(organizationService));
router.get('/policy', wrap(async (req, res) => res.json(await trips.policy())));
router.get('/', wrap(async (req, res) => res.json({ data: await trips.list(req.organization.organization_id, req.user.user_id) })));
router.get('/:id/points', wrap(async (req, res) => res.json(await trips.points(req.organization.organization_id, req.user.user_id, req.params.id, req.query.after))));
router.delete('/expired', wrap(async (req, res) => res.json(await trips.purgeExpired(req.organization.organization_id, req.user.user_id))));
router.use(authorizeRoles('admin', 'analyst'));
router.post('/', wrap(async (req, res) => res.status(201).json({ data: await trips.create(req.organization.organization_id, req.user.user_id, req.body) })));
router.patch('/:id', wrap(async (req, res) => res.json({ data: await trips.change(req.organization.organization_id, req.user.user_id, req.params.id, req.body) })));
router.post('/:id/points', wrap(async (req, res) => res.json(await trips.append(req.organization.organization_id, req.user.user_id, req.params.id, req.body))));
router.use((error, req, res, next) => {
  if (error.code === 11000 || error.code === '23505') return res.status(409).json({ error: 'Ya existe un viaje abierto.' });
  if (error.code === '23503') return res.status(409).json({ error: 'La referencia GPS ya no está disponible.' });
  if (error.code === '23514') return res.status(400).json({ error: 'Datos GPS inválidos.' });
  if (!error.statusCode || error.statusCode >= 500) return res.status(503).json({ error: 'La persistencia GPS no está disponible.' });
  return next(error);
});
return router;
}
module.exports = createTripsRouter();
module.exports.createTripsRouter = createTripsRouter;
