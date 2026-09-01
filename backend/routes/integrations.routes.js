const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const controller = require('../controllers/integrations.controller');

const router = express.Router();

router.post('/sources', authenticate, authorizeRoles(ROLES.ADMIN), controller.createSource);
router.post('/events', authenticate, authorizeRoles(ROLES.ADMIN), controller.createEvent);
router.get('/events/pending', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.getPendingEvents);
router.post('/events/:id/complete', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.ANALYST), controller.completeEvent);

module.exports = router;
