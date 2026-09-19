const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/operationalEvents.controller');

const router = express.Router();
router.use(authenticate, requireOrganizationContext);
router.get('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listEvents);
router.get('/alerts', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listAlerts);
router.get('/summary', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getSummary);

router.put('/:id/acknowledge', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.acknowledgeEvent);
router.put('/:id/resolve', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.resolveEvent);

module.exports = router;
