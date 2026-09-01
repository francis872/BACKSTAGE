const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const controller = require('../controllers/territorial.controller');

const router = express.Router();

router.get('/units', controller.listUnits);
router.get('/units/:id', controller.getUnitById);
router.post('/units', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createUnit);
router.put('/units/:id', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.updateUnit);
router.delete('/units/:id', authenticate, authorizeRoles(ROLES.ADMIN), controller.deleteUnit);

router.get('/facilities', controller.listFacilities);
router.post('/facilities', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createFacility);

router.get('/dimension-scores', controller.listDimensionScores);
router.post('/dimension-scores', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.upsertDimensionScore);

router.get('/units/:id/index', controller.getUnitIndex);
router.post('/units/:id/index/recompute', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.recomputeUnitIndex);

router.get('/units/:id/gaps', controller.listUnitGaps);
router.post('/units/:id/gaps/detect', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.detectUnitGaps);
router.get('/gaps', controller.listGlobalGaps);

router.post('/units/:id/simulate', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.simulateUnit);

module.exports = router;
