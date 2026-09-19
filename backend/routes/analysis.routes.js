const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/analysis.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext);
router.post('/projects', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createOperationalProject);
router.get('/:id/candidates', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listProjectCandidates);
router.post('/:id/candidates', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.addProjectCandidate);
router.delete('/:id/candidates/:locationId', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.removeProjectCandidate);
router.post('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.runAnalysis);
router.post('/compare', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.compareCandidates);
router.get('/operations', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getOperationalBoard);
router.get('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listAnalysisRuns);
router.get('/:id/risks', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getOperationalRisks);
router.put('/:id/risks/review', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.reviewOperationalRisks);
router.put('/:id/probability', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.saveProbabilityResult);
router.get('/:id/probability', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getProbabilityResult);
router.post('/:id/commands', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.executeOperationalCommand);
router.post('/:id/report/generate', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.generateOperationalReport);
router.get('/:id/report', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getPrintableReport);
router.get('/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getAnalysisById);

module.exports = router;
