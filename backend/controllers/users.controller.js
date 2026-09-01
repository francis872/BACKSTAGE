const asyncHandler = require('../utils/asyncHandler');
const usersService = require('../services/users.service');
const ApiError = require('../utils/ApiError');

const listUsers = asyncHandler(async (req, res) => {
  const rows = await usersService.listUsers(req.organization.organization_id);
  res.json(rows);
});

const getUserById = asyncHandler(async (req, res) => {
  const row = await usersService.getUserById(req.params.id, req.organization.organization_id);
  res.json(row);
});

const createUser = asyncHandler(async (req, res) => {
  const row = await usersService.createUser(req.body || {}, req.organization.organization_id);
  res.status(201).json(row);
});

const updateUser = asyncHandler(async (req, res) => {
  const row = await usersService.updateUser(req.params.id, req.body || {}, req.organization.organization_id);
  res.json(row);
});

const updatePassword = asyncHandler(async (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    throw new ApiError(400, 'password es requerido.');
  }
  const row = await usersService.updateUserPassword(req.params.id, password, req.organization.organization_id);
  res.json(row);
});

const deleteUser = asyncHandler(async (req, res) => {
  const row = await usersService.deleteUser(req.params.id, req.organization.organization_id);
  res.json({ message: 'Usuario eliminado correctamente.', deleted: row });
});

module.exports = { listUsers, getUserById, createUser, updateUser, updatePassword, deleteUser };
