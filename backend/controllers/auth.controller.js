const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { service } = require('../services/mongoIdentity.service');
const login = asyncHandler(async (req,res) => res.json(await service.login(req.body)));
const register = asyncHandler(async (req,res) => res.status(201).json(await service.register(req.body)));
const me = asyncHandler(async (req,res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');
  res.json(await service.me(req.user.user_id,req.user.organization_id));
});
const listOrganizations = asyncHandler(async (req,res) => res.json(await service.getUserMemberships(req.user.user_id)));
const switchOrganization = asyncHandler(async (req,res) => res.json(await service.switchOrganization(req.user.user_id,req.body?.organization_id)));
module.exports = { login, register, me, listOrganizations, switchOrganization };
