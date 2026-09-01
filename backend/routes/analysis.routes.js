const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/analysis.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext);
router.post('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.runAnalysis);
router.post('/compare', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.compareCandidates);
router.get('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listAnalysisRuns);
router.get('/:id/report', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getPrintableReport);
router.get('/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getAnalysisById);

module.exports = router;
