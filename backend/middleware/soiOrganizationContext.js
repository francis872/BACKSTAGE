// Compatibility entry point: the platform owns organization authorization.
const { createRequireOrganizationContext, requireOrganizationContext } = require('./organizationContext');
module.exports = {
  createRequireFreshOrganizationContext: createRequireOrganizationContext,
  requireFreshOrganizationContext: requireOrganizationContext,
};
