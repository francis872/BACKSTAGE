const express = require('express');
const { authenticate } = require('../auth');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const controller = require('../controllers/users.controller');

const router = express.Router();

router.use(authenticate, requireOrganizationContext, authorizeRoles(ROLES.ADMIN));
const wrap = require('../utils/asyncHandler');
const identity = require('../services/mongoIdentity.service').service;
router.get('/invitations', wrap(async (req,res) => res.json({data:await identity.listInvitations(req.organization.organization_id)})));
router.post('/invitations', wrap(async (req,res) => res.status(201).json(await identity.createInvitation(req.body || {},req.organization.organization_id,req.user.user_id))));
router.delete('/invitations/:id', wrap(async (req,res) => res.json(await identity.revokeInvitation(req.params.id,req.organization.organization_id,req.user.user_id))));
router.get('/', controller.listUsers);
router.get('/:id', controller.getUserById);
router.post('/', controller.createUser);
router.put('/:id', controller.updateUser);
router.put('/:id/password', controller.updatePassword);
router.delete('/:id', controller.deleteUser);

module.exports = router;
