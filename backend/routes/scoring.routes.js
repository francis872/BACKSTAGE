const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const controller = require('../controllers/scoring.controller');
const { requireOrganizationContext } = require('../middleware/organizationContext');

const router = express.Router();
router.use(authenticate, requireOrganizationContext);

router.post('/evaluate', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.evaluate);
router.get('/latest/:location_id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.latestForLocation);

module.exports = router;
