const express = require('express');
const wrap = require('../utils/asyncHandler');
function createPropertySpatialAnalysisRouter(service = require('../services/propertySpatialAnalysis.service').createPropertySpatialAnalysisService()) {
  const router = express.Router({ mergeParams: true });
  const context = req => ({ organizationId: req.organization.organization_id, userId: req.user.user_id, session: { session_version: req.user.session_version ?? 0, session_id: req.user.session_id || null } });
  const limiter = process.env.VERCEL ? require('../middleware/atlasRateLimiter').createAtlasRateLimiter : require('../middleware/platformSecurity').createRateLimiter;
  const budget = limiter({ namespace: 'ph_spatial_analysis', windowMs: 15 * 60000, max: 30, subject: req => String(req.organization.organization_id) });
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/', wrap(async (req, res) => res.json(await service.list(context(req), req.params.id))));
  router.post('/preview', wrap(async (req, res) => res.json(await service.preview(context(req), req.params.id, req.body))));
  router.post('/', budget, wrap(async (req, res) => { const value = await service.run(context(req), req.params.id, req.body, req.get('Idempotency-Key')); res.status(value.created ? 201 : 200).json(value); }));
  router.get('/:analysis', wrap(async (req, res) => res.json(await service.get(context(req), req.params.id, req.params.analysis))));
  router.post('/:analysis/reproduce', budget, wrap(async (req, res) => res.json(await service.reproduce(context(req), req.params.id, req.params.analysis))));
  return router;
}
module.exports = { createPropertySpatialAnalysisRouter };
