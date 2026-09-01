const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/locations.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext);
router.get('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listLocations);
router.get('/nearby', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.findNearby);
router.get('/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getLocationById);
router.post('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createLocation);
router.put('/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.updateLocation);
router.delete('/:id', authorizeRoles(ROLES.ADMIN), controller.deleteLocation);

module.exports = router;
