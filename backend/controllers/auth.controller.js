const { query, withTransaction } = require('../db');
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
  const { password } = req.body || {};
  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  const organizationName = String(req.body?.organization_name || '').trim();
  if (!email || !password || !name || !organizationName) {
    throw new ApiError(400, 'name, email, password y organization_name son requeridos.');
  }
  if (name.length > 120 || organizationName.length < 2 || organizationName.length > 120) {
    throw new ApiError(400, 'name y organization_name deben tener entre 2 y 120 caracteres.');
  }
  if (req.body?.organization_id || req.body?.organization_slug || req.body?.role) {
    throw new ApiError(400, 'El registro crea un workspace nuevo; para unirse a otro se requiere invitación.');
  }
  if (String(password).length < 8) {
    throw new ApiError(400, 'La contraseña debe tener al menos 8 caracteres.');
  }

  const existing = await query('SELECT user_id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new ApiError(409, 'El email ya está registrado.');
  }

  const roleResult = await query('SELECT role_id FROM roles WHERE name = $1', ['admin']);
  if (roleResult.rows.length === 0) {
    throw new ApiError(503, 'El catálogo de roles no está inicializado. Ejecuta las migraciones.');
  }
  const roleId = roleResult.rows[0].role_id;
  const passwordHash = createPasswordHash(password);
  const organizationSlug = organizationService.organizationSlugFromName(organizationName);

  const created = await withTransaction(async (client) => {
    const organizationResult = await client.query(
      `INSERT INTO organizations (name, slug, status)
       VALUES ($1, $2, 'active')
       RETURNING organization_id, slug, name`,
      [organizationName, organizationSlug]
    );
    const organization = organizationResult.rows[0];
    if (!organization) throw new Error('No fue posible crear el workspace.');

    const createdUser = await client.query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id`,
      [email, name, passwordHash, 'admin']
    );
    const userId = createdUser.rows[0].user_id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id, organization_id)
       VALUES ($1, $2, $3)`,
      [userId, roleId, organization.organization_id]
    );
    return { userId, organization };
  });

  const memberships = await organizationService.getUserMemberships(created.userId);
  const activeMembership = organizationService.resolveMembership(memberships, created.organization.organization_id);
  const sessionUser = {
    user_id: created.userId,
    email,
    name,
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
    organization: created.organization,
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

module.exports = { login, register, me, listOrganizations, switchOrganization };
