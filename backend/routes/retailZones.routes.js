const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const controller = require('../controllers/retailZones.controller');

const router = express.Router();
router.use(authenticate, require('../middleware/organizationContext').requireOrganizationContext);
router.use(authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER));

router.get('/', controller.listZones);
router.get('/:id', controller.getZoneById);
router.post('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createZone);
router.put('/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.updateZone);
router.delete('/:id', authorizeRoles(ROLES.ADMIN), controller.deleteZone);

module.exports = router;
