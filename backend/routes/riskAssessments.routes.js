const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/riskAssessments.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext);
router.get('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.listAssessments);
router.get('/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.getAssessmentById);
router.post('/', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.createAssessment);
router.put('/:id', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.updateAssessment);
router.delete('/:id', authorizeRoles(ROLES.ADMIN), controller.deleteAssessment);

module.exports = router;
