const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/analytics.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext);

router.get('/algorithms', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listAlgorithms);
router.get('/jobs', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listJobs);
router.get('/jobs/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getJob);

router.post('/multicriteria', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.runMulticriteria);
router.post('/multicriteria/sensitivity', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.runMulticriteriaSensitivity);
router.post('/multicriteria/ahp-weights', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.runAhpWeights);
router.post('/financial', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.runFinancial);
router.post('/risk-simulation', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.runRiskSimulation);

module.exports = router;
