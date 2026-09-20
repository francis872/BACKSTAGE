const express = require('express');
const controller = require('../controllers/operations.controller');
const { authenticate } = require('../auth');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const { authorizeRoles, ROLES } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticate, requireOrganizationContext);

router.get('/health', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.health);
router.get('/metrics', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.operationalMetrics);
router.get('/executions', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.executions);
router.get('/analysis/:id/diagnostics', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.diagnostics);

module.exports = router;
