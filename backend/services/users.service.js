const { query } = require('../db');
const ApiError = require('../utils/ApiError');
const { createPasswordHash } = require('../auth');
const { ROLES } = require('../middleware/rbac');

const VALID_ROLES = Object.values(ROLES);
const SAFE_COLUMNS = 'u.user_id, u.email, u.name, ur.organization_id, o.name AS organization_name, o.slug AS organization_slug, r.name AS role, u.created_at, u.updated_at';

function assertValidRole(role) {
  if (role && !VALID_ROLES.includes(role)) {
    throw new ApiError(400, `Rol inválido. Debe ser uno de: ${VALID_ROLES.join(', ')}.`);
  }
}

async function getRoleIdByName(roleName) {
  const roleResult = await query('SELECT role_id FROM roles WHERE name = $1', [roleName]);
  if (roleResult.rows.length === 0) {
    throw new ApiError(500, `No existe el rol "${roleName}" en catálogo.`);
  }
  return roleResult.rows[0].role_id;
}

async function listUsers(organizationId) {
  const result = await query(
    `SELECT ${SAFE_COLUMNS}
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.user_id
     JOIN organizations o ON o.organization_id = ur.organization_id
     JOIN roles r ON r.role_id = ur.role_id
     WHERE ur.organization_id = $1
     ORDER BY u.user_id`,
    [organizationId]
  );
  return result.rows;
}

async function getUserById(id, organizationId) {
  const result = await query(
    `SELECT ${SAFE_COLUMNS}
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.user_id
     JOIN organizations o ON o.organization_id = ur.organization_id
     JOIN roles r ON r.role_id = ur.role_id
     WHERE u.user_id = $1
       AND ur.organization_id = $2`,
    [id, organizationId]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Usuario no encontrado.');
  return result.rows[0];
}

async function createUser(data, organizationId) {
  const { email, name, password, role } = data;
  if (!email || !password) {
    throw new ApiError(400, 'email y password son requeridos.');
  }
  assertValidRole(role || ROLES.VIEWER);
  const targetRole = role || ROLES.VIEWER;
  const targetRoleId = await getRoleIdByName(targetRole);
  const passwordHash = createPasswordHash(password);

  const existing = await query('SELECT user_id FROM users WHERE email = $1', [email]);
  const userId = existing.rows[0]?.user_id;
  if (userId) {
    await query('UPDATE users SET name = COALESCE($1, name), role = $2, updated_at = now() WHERE user_id = $3', [name || null, targetRole, userId]);
    await query(
      `INSERT INTO user_roles (user_id, role_id, organization_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, role_id, organization_id) DO NOTHING`,
      [userId, targetRoleId, organizationId]
    );
    return getUserById(userId, organizationId);
  }

  const created = await query(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING user_id`,
    [email, name || null, passwordHash, targetRole]
  );
  const createdUserId = created.rows[0].user_id;
  await query(
    `INSERT INTO user_roles (user_id, role_id, organization_id)
     VALUES ($1, $2, $3)`,
    [createdUserId, targetRoleId, organizationId]
  );
  return getUserById(createdUserId, organizationId);
}

async function updateUser(id, data, organizationId) {
  const { name, role } = data;
  assertValidRole(role);
  await getUserById(id, organizationId);

  await query(
    `UPDATE users
     SET name = COALESCE($1, name),
         role = COALESCE($2, role),
         updated_at = now()
     WHERE user_id = $3`,
    [name || null, role || null, id]
  );

  if (role) {
    const roleId = await getRoleIdByName(role);
    await query('DELETE FROM user_roles WHERE user_id = $1 AND organization_id = $2', [id, organizationId]);
    await query(
      `INSERT INTO user_roles (user_id, role_id, organization_id)
       VALUES ($1, $2, $3)`,
      [id, roleId, organizationId]
    );
  }
  return getUserById(id, organizationId);
}

async function updateUserPassword(id, newPassword, organizationId) {
  if (!newPassword || newPassword.length < 8) {
    throw new ApiError(400, 'La nueva contraseña debe tener al menos 8 caracteres.');
  }
  await getUserById(id, organizationId);
  const passwordHash = createPasswordHash(newPassword);
  await query(
    'UPDATE users SET password_hash = $1, updated_at = now() WHERE user_id = $2',
    [passwordHash, id]
  );
  return getUserById(id, organizationId);
}

async function deleteUser(id, organizationId) {
  const existing = await getUserById(id, organizationId);
  await query('DELETE FROM user_roles WHERE user_id = $1 AND organization_id = $2', [id, organizationId]);
  const remainingMemberships = await query('SELECT COUNT(*)::int AS total FROM user_roles WHERE user_id = $1', [id]);
  if (Number(remainingMemberships.rows[0].total) === 0) {
    await query('DELETE FROM users WHERE user_id = $1', [id]);
  }
  return existing;
}

module.exports = { listUsers, getUserById, createUser, updateUser, updateUserPassword, deleteUser };

