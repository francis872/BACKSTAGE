const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { createRequireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/cleanCom.controller');
function createRouter(controller, organizationService) {
const router = express.Router();
router.use(authenticate, createRequireOrganizationContext(organizationService), authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER));
router.get('/cases', controller.cases);
router.get('/cases/:caseId/audit', controller.audit);
router.get('/cases/:caseId/layers/:layerId/features', controller.features);
return router;
}
module.exports = createRouter(controller);
module.exports.createRouter = createRouter;
