const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const controller = require('../controllers/scoring.controller');

const router = express.Router();

router.post('/evaluate', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.evaluate);
router.get('/latest/:location_id', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.latestForLocation);

module.exports = router;
