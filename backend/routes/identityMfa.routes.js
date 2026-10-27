const express = require('express');
const { authenticate } = require('../auth');
const wrap = require('../utils/asyncHandler');
function createIdentityMfaRouter(service = require('../services/identityMfa.service').createIdentityMfaService({ issueSession: require('../services/mongoIdentity.service').service.mfaSessionIn }), { limiterFactory } = {}) {
  const router = express.Router();
  const factory = limiterFactory || (process.env.VERCEL ? require('../middleware/atlasRateLimiter').createAtlasRateLimiter : require('../middleware/platformSecurity').createRateLimiter);
  const budget = factory({ namespace: 'identity_mfa', windowMs: 15 * 60000, max: 20, subject: req => String(req.user?.user_id || req.ip || 'unknown') });
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.post('/verify-login', budget, wrap(async (req, res) => res.json(await service.verifyLogin(req.body))));
  router.use(authenticate);
  router.get('/status', wrap(async (req, res) => res.json(await service.status(req.user))));
  router.post('/setup', budget, wrap(async (req, res) => res.json(await service.setup(req.user, req.body))));
  router.post('/confirm', budget, wrap(async (req, res) => res.json(await service.confirm(req.user, req.body))));
  router.post('/disable', budget, wrap(async (req, res) => res.json(await service.disable(req.user, req.body))));
  return router;
}
module.exports = { createIdentityMfaRouter };
