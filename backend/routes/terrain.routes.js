const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/terrain.controller');

const router = express.Router();
router.use(authenticate, requireOrganizationContext, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER));
router.get('/surface', controller.getSurface);
router.post('/analyze', controller.analyze);

module.exports = router;
