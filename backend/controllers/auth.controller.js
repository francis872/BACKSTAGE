const { query } = require('../db');
const { verifyPassword, createToken, createPasswordHash, isLegacyHash } = require('../auth');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const organizationService = require('../services/organization.service');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError(400, 'email y password son requeridos.');
  }

  const userResult = await query('SELECT * FROM users WHERE email = $1', [email]);
  if (userResult.rows.length === 0) {
    throw new ApiError(401, 'Credenciales inválidas.');
  }

  const user = userResult.rows[0];
  const valid = verifyPassword(password, user.password_hash);
  if (!valid) {
    throw new ApiError(401, 'Credenciales inválidas.');
  }
  if (isLegacyHash(user.password_hash)) {
    const upgradedHash = createPasswordHash(password);
    await query(
      'UPDATE users SET password_hash = $1, updated_at = now() WHERE user_id = $2',
      [upgradedHash, user.user_id]
    );
  }

  const memberships = await organizationService.getUserMemberships(user.user_id);
  const activeMembership = organizationService.resolveMembership(memberships, req.body?.organization_id);
  const sessionUser = {
    user_id: user.user_id,
    email: user.email,
    name: user.name,
    role: activeMembership.role,
    organization_id: Number(activeMembership.organization_id),
    organization_slug: activeMembership.organization_slug,
    organization_name: activeMembership.organization_name,
    memberships,
  };
  const token = createToken(sessionUser);
  res.json({
    token,
    user: sessionUser,
  });
});

const register = asyncHandler(async (req, res) => {
  const { email, password, name, organization_id, organization_slug } = req.body || {};
  if (!email || !password) {
    throw new ApiError(400, 'email y password son requeridos.');
  }
  if (String(password).length < 8) {
    throw new ApiError(400, 'La contraseña debe tener al menos 8 caracteres.');
  }

  const existing = await query('SELECT user_id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new ApiError(409, 'El email ya está registrado.');
  }

  const organizations = await organizationService.listActiveOrganizations();
  if (organizations.length === 0) {
    throw new ApiError(500, 'No hay organizaciones activas disponibles para registro.');
  }

  let selectedOrganization = organizations[0];
  if (organization_id) {
    const requestedId = Number(organization_id);
    if (Number.isNaN(requestedId)) {
      throw new ApiError(400, 'organization_id debe ser numérico.');
    }
    const foundById = organizations.find((row) => Number(row.organization_id) === requestedId);
    if (!foundById) {
      throw new ApiError(400, 'organization_id no existe o no está activo.');
    }
    selectedOrganization = foundById;
  } else if (organization_slug) {
    const foundBySlug = organizations.find((row) => row.organization_slug === organization_slug);
    if (!foundBySlug) {
      throw new ApiError(400, 'organization_slug no existe o no está activo.');
    }
    selectedOrganization = foundBySlug;
  }

  const roleResult = await query('SELECT role_id FROM roles WHERE name = $1', ['viewer']);
  if (roleResult.rows.length === 0) {
    throw new ApiError(500, 'No existe el rol viewer en catálogo.');
  }
  const roleId = roleResult.rows[0].role_id;
  const passwordHash = createPasswordHash(password);

  let createdUserId;
  try {
    await query('BEGIN');
    const createdUser = await query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id`,
      [email, name || null, passwordHash, 'viewer']
    );
    createdUserId = createdUser.rows[0].user_id;
    await query(
      `INSERT INTO user_roles (user_id, role_id, organization_id)
       VALUES ($1, $2, $3)`,
      [createdUserId, roleId, selectedOrganization.organization_id]
    );
    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }

  const memberships = await organizationService.getUserMemberships(createdUserId);
  const activeMembership = organizationService.resolveMembership(memberships, selectedOrganization.organization_id);
  const sessionUser = {
    user_id: createdUserId,
    email,
    name: name || null,
    role: activeMembership.role,
    organization_id: Number(activeMembership.organization_id),
    organization_slug: activeMembership.organization_slug,
    organization_name: activeMembership.organization_name,
    memberships,
  };
  const token = createToken(sessionUser);
  res.status(201).json({
    token,
    user: sessionUser,
  });
});

const me = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ApiError(401, 'No autenticado.');
  }
  const result = await query('SELECT user_id, email, name, role, created_at, updated_at FROM users WHERE user_id = $1', [req.user.user_id]);
  if (result.rows.length === 0) {
    throw new ApiError(404, 'Usuario no encontrado.');
  }
  const memberships = await organizationService.getUserMemberships(req.user.user_id);
  const activeMembership = organizationService.resolveMembership(memberships, req.user.organization_id);
  res.json({
    ...result.rows[0],
    role: activeMembership.role,
    organization_id: Number(activeMembership.organization_id),
    organization_slug: activeMembership.organization_slug,
    organization_name: activeMembership.organization_name,
    memberships,
  });
});

const listOrganizations = asyncHandler(async (req, res) => {
  const memberships = await organizationService.getUserMemberships(req.user.user_id);
  res.json(memberships);
});

const listPublicOrganizations = asyncHandler(async (req, res) => {
  const organizations = await organizationService.listActiveOrganizations();
  res.json(organizations);
});

const switchOrganization = asyncHandler(async (req, res) => {
  const memberships = await organizationService.getUserMemberships(req.user.user_id);
  const activeMembership = organizationService.resolveMembership(memberships, req.body?.organization_id);
  const sessionUser = {
    user_id: req.user.user_id,
    email: req.user.email,
    name: req.user.name || null,
    role: activeMembership.role,
    organization_id: Number(activeMembership.organization_id),
    organization_slug: activeMembership.organization_slug,
    organization_name: activeMembership.organization_name,
    memberships,
  };
  const token = createToken(sessionUser);
  res.json({ token, user: sessionUser });
});

module.exports = { login, register, me, listOrganizations, listPublicOrganizations, switchOrganization };
