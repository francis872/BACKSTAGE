const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const controller = require('../controllers/integrations.controller');

const router = express.Router();
router.use(authenticate, require('../middleware/organizationContext').requireOrganizationContext);

router.post('/sources', authorizeRoles(ROLES.ADMIN), controller.createSource);
router.get('/sources',authorizeRoles(ROLES.ADMIN,ROLES.ANALYST,ROLES.VIEWER),controller.listSources);
router.get('/sources/:id',authorizeRoles(ROLES.ADMIN,ROLES.ANALYST,ROLES.VIEWER),controller.getSource);
router.patch('/sources/:id',authorizeRoles(ROLES.ADMIN),controller.updateSource);
router.delete('/sources/:id',authorizeRoles(ROLES.ADMIN),controller.archiveSource);
router.post('/events', authorizeRoles(ROLES.ADMIN), controller.createEvent);
router.get('/events/pending', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.getPendingEvents);
router.post('/events/:id/complete', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.completeEvent);

module.exports = router;
