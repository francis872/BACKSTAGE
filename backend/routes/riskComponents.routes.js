const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const controller = require('../controllers/riskComponents.controller');

const router = express.Router();

router.get('/', controller.listComponents);
router.get('/:id', controller.getComponentById);
router.post('/', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createComponent);
router.put('/:id', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.updateComponent);
router.delete('/:id', authenticate, authorizeRoles(ROLES.ADMIN), controller.deleteComponent);

module.exports = router;
