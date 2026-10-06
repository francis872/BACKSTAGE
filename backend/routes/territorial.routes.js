const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/territorial.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext);
router.get('/units', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listUnits);
router.get('/units/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getUnitById);
router.post('/units', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createUnit);
router.put('/units/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.updateUnit);
router.delete('/units/:id', authorizeRoles(ROLES.ADMIN), controller.deleteUnit);

router.get('/facilities', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listFacilities);
router.post('/facilities', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createFacility);

router.get('/dimension-scores', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listDimensionScores);
router.post('/dimension-scores', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.upsertDimensionScore);

router.get('/units/:id/index', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getUnitIndex);
router.post('/units/:id/index/recompute', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.recomputeUnitIndex);

router.get('/units/:id/gaps', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listUnitGaps);
router.post('/units/:id/gaps/detect', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.detectUnitGaps);
router.post('/units/:id/gaps/:gapId/projects', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createProjectFromGap);
router.get('/gaps', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listGlobalGaps);

router.post('/units/:id/simulate', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.simulateUnit);
router.get('/units/:id/simulations', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listUnitSimulations);

module.exports = router;
