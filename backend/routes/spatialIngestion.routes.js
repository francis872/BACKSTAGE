const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/spatialIngestion.controller');

const router = express.Router();
router.use(authenticate, requireOrganizationContext);
router.get('/sources', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listSources);
router.post('/sources', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.registerSource);
router.get('/jobs', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.listJobs);
router.post('/ingest/geojson', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.ingestGeoJSON);
router.get('/tiles/:z/:x/:y', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getTile);

module.exports = router;
