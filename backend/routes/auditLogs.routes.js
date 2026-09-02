const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/auditLogs.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext, authorizeRoles(ROLES.ADMIN));
router.get('/', controller.listAuditLogs);
router.get('/chain-status', controller.verifyChain);

module.exports = router;
