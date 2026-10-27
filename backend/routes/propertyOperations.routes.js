const express = require('express');
const wrap = require('../utils/asyncHandler');
function createPropertyOperationsRouter(service = require('../services/propertyOperations.service').createPropertyOperationsService()) {
  const router = express.Router({ mergeParams: true });
  const context = req => ({ organizationId: req.organization.organization_id, userId: req.user.user_id, session: { session_version: req.user.session_version ?? 0, session_id: req.user.session_id || null } });
  const location = req => req.params.id;
  router.get('/history', wrap(async (req, res) => res.json(await service.history(context(req), location(req), req.query.before))));
  router.get('/economics', wrap(async (req, res) => res.json(await service.economics(context(req), location(req)))));
  router.get('/', wrap(async (req, res) => res.json(await service.list(context(req), location(req), req.query))));
  router.post('/:type', wrap(async (req, res) => { const r = await service.create(context(req), location(req), req.params.type, req.body, req.get('Idempotency-Key')); res.status(r.created ? 201 : 200).json(r); }));
  router.get('/records/:record', wrap(async (req, res) => res.json(await service.get(context(req), location(req), req.params.record))));
  router.post('/records/:record/transition', wrap(async (req, res) => res.json(await service.transition(context(req), location(req), req.params.record, req.body, req.get('Idempotency-Key')))));
  router.post('/records/:record/erase-content', wrap(async (req, res) => res.json(await service.erase(context(req), location(req), req.params.record, req.body))));
  return router;
}
module.exports = { createPropertyOperationsRouter };
