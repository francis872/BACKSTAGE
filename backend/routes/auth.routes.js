const express = require('express');
const { authenticate } = require('../auth');
const authController = require('../controllers/auth.controller');
const { createRateLimiter } = require('../middleware/platformSecurity');
const { createAtlasRateLimiter } = require('../middleware/atlasRateLimiter');
const limiter = process.env.VERCEL ? createAtlasRateLimiter : createRateLimiter;

const router = express.Router();
const {requireActiveSession}=require('./accountSecurity.routes');

const loginLimiter = limiter({ namespace: 'login',
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
});
const registerLimiter = limiter({ namespace: 'register',
  windowMs: Number(process.env.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000),
  max: Number(process.env.AUTH_REGISTER_RATE_LIMIT_MAX || 5),
});

router.post('/login', loginLimiter, authController.login);
router.post('/register', registerLimiter, authController.register);
router.use('/mfa', require('./identityMfa.routes').createIdentityMfaRouter());
router.post('/invitations/accept', authenticate, requireActiveSession, limiter({namespace:'invitation_accept',windowMs:15*60*1000,max:20}), require('../utils/asyncHandler')(async (req,res) => res.json(await require('../services/mongoIdentity.service').service.acceptInvitation(req.body || {},req.user.user_id))));
router.get('/me', authenticate, requireActiveSession, authController.me);
router.patch('/me',authenticate,require('../middleware/organizationContext').requireOrganizationContext,require('../utils/asyncHandler')(async(req,res)=>res.json(await require('../services/mongoIdentity.service').service.updateOwnProfile(req.user.user_id,req.organization.organization_id,req.body||{}))));
router.get('/organizations', authenticate, requireActiveSession, authController.listOrganizations);
router.post('/switch-organization', authenticate, requireActiveSession, authController.switchOrganization);
router.use(require('./accountSecurity.routes').createAccountSecurityRouter());

module.exports = router;
