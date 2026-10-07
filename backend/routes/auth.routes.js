const express = require('express');
const { authenticate } = require('../auth');
const authController = require('../controllers/auth.controller');
const { createRateLimiter } = require('../middleware/platformSecurity');

const router = express.Router();

const authLimiter = createRateLimiter({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
});

router.post('/login', authLimiter, authController.login);
router.post('/register', authLimiter, authController.register);
router.get('/public-organizations', authController.listPublicOrganizations);
router.get('/me', authenticate, authController.me);
router.get('/organizations', authenticate, authController.listOrganizations);
router.post('/switch-organization', authenticate, authController.switchOrganization);

module.exports = router;
