const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/insights.controller');

const router = express.Router();

router.get('/summary', authenticate, requireOrganizationContext, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getSummary);
router.get('/opportunities', authenticate, requireOrganizationContext, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listOpportunities);
router.post('/opportunities/:locationId/projects', authenticate, requireOrganizationContext, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createProjectFromOpportunity);

module.exports = router;
