const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/layers.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER));
router.get('/', controller.listLayers);
router.get('/:id', controller.getLayerById);
router.get('/:id/features', controller.getLayerFeatures);

module.exports = router;
