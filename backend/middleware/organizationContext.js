const asyncHandler = require('../utils/asyncHandler');
const organizationService = require('../services/organization.service');

function createRequireOrganizationContext(repository) {
 return asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  const requestedOrganizationId = req.header('x-organization-id')
    || req.query.organization_id
    || req.user.organization_id;

  // A signed token identifies the user; current storage authorizes the resource.
  const service = repository || organizationService;
  const memberships = await service.getUserMemberships(req.user.user_id, { session_version:req.user.session_version??0,session_id:req.user.session_id||null });

  const membership = service.resolveMembership(memberships, requestedOrganizationId);
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
}

const requireOrganizationContext = createRequireOrganizationContext();
module.exports = { createRequireOrganizationContext, requireOrganizationContext };

