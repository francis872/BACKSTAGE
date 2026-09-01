const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const controller = require('../controllers/retailZones.controller');

const router = express.Router();

router.get('/', controller.listZones);
router.get('/:id', controller.getZoneById);
router.post('/', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createZone);
router.put('/:id', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.updateZone);
router.delete('/:id', authenticate, authorizeRoles(ROLES.ADMIN), controller.deleteZone);

module.exports = router;
