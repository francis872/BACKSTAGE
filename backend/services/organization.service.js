const { query, pool } = require('../db');
const ApiError = require('../utils/ApiError');

// In-memory fallback for organizations when database is unavailable
const DEFAULT_ORGANIZATIONS = [
  { organization_id: 1, organization_slug: 'default', organization_name: 'Default Organization' },
  { organization_id: 2, organization_slug: 'demo', organization_name: 'Demo Organization' },
];

const MEMORY_STORE = {
  users: new Map(),
  userRoles: new Map(),
};

async function getUserMemberships(userId) {
  try {
    const result = await query(
      `SELECT
         ur.organization_id,
         o.slug AS organization_slug,
         o.name AS organization_name,
         r.name AS role
       FROM user_roles ur
       JOIN organizations o ON o.organization_id = ur.organization_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE ur.user_id = $1
         AND o.status = 'active'
       ORDER BY o.name ASC, r.name ASC`,
      [userId]
    );
    return result.rows;
  } catch (err) {
    // Fallback: return first default organization with 'viewer' role
    return [{ 
      organization_id: 1, 
      organization_slug: 'default', 
      organization_name: 'Default Organization',
      role: 'viewer'
    }];
  }
}

async function listActiveOrganizations() {
  try {
    const result = await query(
      `SELECT organization_id, slug AS organization_slug, name AS organization_name
       FROM organizations
       WHERE status = 'active'
       ORDER BY name ASC`
    );
    return result.rows.length > 0 ? result.rows : DEFAULT_ORGANIZATIONS;
  } catch (err) {
    // Database unavailable, return default organizations
    return DEFAULT_ORGANIZATIONS;
  }
}

function resolveMembership(memberships, requestedOrganizationId) {
  if (!Array.isArray(memberships) || memberships.length === 0) {
    throw new ApiError(403, 'El usuario no tiene organizaciones asignadas.');
  }

  if (!requestedOrganizationId) {
    return memberships[0];
  }

  const parsedOrganizationId = Number(requestedOrganizationId);
  if (Number.isNaN(parsedOrganizationId)) {
    throw new ApiError(400, 'organization_id debe ser numérico.');
  }

  const membership = memberships.find((entry) => Number(entry.organization_id) === parsedOrganizationId);
  if (!membership) {
    throw new ApiError(403, 'No tienes acceso a la organización solicitada.');
  }
  return membership;
}

module.exports = {
  getUserMemberships,
  listActiveOrganizations,
  resolveMembership,
};
