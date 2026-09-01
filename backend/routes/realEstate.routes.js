const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const controller = require('../controllers/realEstate.controller');

const router = express.Router();

router.get('/portfolio', controller.getPortfolio);
router.get('/properties', controller.getProperties);
router.get('/valuations', controller.listValuations);
router.get('/valuations/:id', controller.getValuationById);
router.post('/valuations', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createValuation);
router.put('/valuations/:id', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.updateValuation);
router.delete('/valuations/:id', authenticate, authorizeRoles(ROLES.ADMIN), controller.deleteValuation);

module.exports = router;
