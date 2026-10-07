const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/spatialIngestion.controller');

const router = express.Router();
router.use(authenticate, requireOrganizationContext);
router.get('/sources', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listSources);
router.post('/sources', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.registerSource);
router.patch('/sources/:id/status', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.setSourceStatus);
router.get('/jobs', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.listJobs);
router.get('/status', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getStatus);
router.get('/geocode', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.geocode);
router.get('/reverse-geocode', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.reverseGeocode);
router.get('/search', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.search);
router.get('/nearby', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.nearby);
router.post('/routes/compute', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.computeRoute);
router.post('/risk/evaluate', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.evaluateRisk);
router.post('/risk/scenario', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.evaluateRiskScenario);
router.post('/measure', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.measureGeometry);
router.post('/ingest/geojson', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.ingestGeoJSON);
router.post('/ingest/remote', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.ingestRemote);
router.get('/tiles/:z/:x/:y', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getTile);

module.exports = router;
