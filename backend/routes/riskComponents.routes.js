const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/riskComponents.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext);
router.get('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listComponents);
router.get('/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getComponentById);
router.post('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createComponent);
router.put('/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.updateComponent);
router.delete('/:id', authorizeRoles(ROLES.ADMIN), controller.deleteComponent);

module.exports = router;
