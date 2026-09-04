const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/recommendations.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext);
router.get('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listRecommendations);
router.get('/summary', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getSummary);
router.get('/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getRecommendationById);
router.post('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createRecommendation);
router.post('/from-analysis/:analysisRunId', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.generateFromAnalysisRun);
router.post('/:id/review', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.reviewRecommendation);
router.put('/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.updateRecommendation);
router.delete('/:id', authorizeRoles(ROLES.ADMIN), controller.deleteRecommendation);

module.exports = router;
