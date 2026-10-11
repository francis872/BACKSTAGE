const express = require('express');
const { authenticate } = require('../auth');
const authController = require('../controllers/auth.controller');
const { createRateLimiter } = require('../middleware/platformSecurity');

const router = express.Router();

const loginLimiter = createRateLimiter({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
});
const registerLimiter = createRateLimiter({
  windowMs: Number(process.env.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000),
  max: Number(process.env.AUTH_REGISTER_RATE_LIMIT_MAX || 5),
});

router.post('/login', loginLimiter, authController.login);
router.post('/register', registerLimiter, authController.register);
router.get('/me', authenticate, authController.me);
router.get('/organizations', authenticate, authController.listOrganizations);
router.post('/switch-organization', authenticate, authController.switchOrganization);

module.exports = router;
