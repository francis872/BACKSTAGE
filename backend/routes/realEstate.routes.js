const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/realEstate.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext);
router.get('/portfolio', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getPortfolio);
router.get('/properties', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getProperties);
router.get('/valuations', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listValuations);
router.get('/valuations/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getValuationById);
router.post('/valuations', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createValuation);
router.put('/valuations/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.updateValuation);
router.delete('/valuations/:id', authorizeRoles(ROLES.ADMIN), controller.deleteValuation);

module.exports = router;
