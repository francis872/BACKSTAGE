const asyncHandler = require('../utils/asyncHandler');
const organizationService = require('../services/organization.service');

const requireOrganizationContext = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  const requestedOrganizationId = req.header('x-organization-id')
    || req.query.organization_id
    || req.user.organization_id;

  const memberships = req.user.memberships?.length
    ? req.user.memberships
    : await organizationService.getUserMemberships(req.user.user_id);

  const membership = organizationService.resolveMembership(memberships, requestedOrganizationId);
  req.organization = {
    organization_id: Number(membership.organization_id),
    organization_slug: membership.organization_slug,
    organization_name: membership.organization_name,
    role: membership.role,
  };
  req.user.memberships = memberships;
  req.user.organization_id = Number(membership.organization_id);
  req.user.organization_slug = membership.organization_slug;
  req.user.organization_name = membership.organization_name;
  req.user.role = membership.role;
  next();
});

module.exports = { requireOrganizationContext };

