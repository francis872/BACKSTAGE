const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/users.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext, authorizeRoles(ROLES.ADMIN));
router.get('/', controller.listUsers);
router.get('/:id', controller.getUserById);
router.post('/', controller.createUser);
router.put('/:id', controller.updateUser);
router.put('/:id/password', controller.updatePassword);
router.delete('/:id', controller.deleteUser);

module.exports = router;
