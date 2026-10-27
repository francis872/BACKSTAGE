const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const mongoIdentity = require('./mongoIdentity.service');

function organizationSlugFromName(value) {
  const base = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  if (!base) throw new ApiError(400, 'El nombre del workspace debe incluir letras o números.');
  return `${base}-${crypto.randomBytes(4).toString('hex')}`;
}

const getUserMemberships = (...args) => mongoIdentity.service.getUserMemberships(...args);
const listActiveOrganizations = (...args) => mongoIdentity.service.listActiveOrganizations(...args);

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
  organizationSlugFromName,
  getUserMemberships,
  listActiveOrganizations,
  resolveMembership,
};
