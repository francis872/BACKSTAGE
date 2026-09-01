const express = require('express');
const { authenticate } = require('../auth');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/login', authController.login);
router.post('/register', authController.register);
router.get('/public-organizations', authController.listPublicOrganizations);
router.get('/me', authenticate, authController.me);
router.get('/organizations', authenticate, authController.listOrganizations);
router.post('/switch-organization', authenticate, authController.switchOrganization);

module.exports = router;
