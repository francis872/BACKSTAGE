const test = require('node:test');
const assert = require('node:assert/strict');
const organizationService = require('../services/organization.service');

test('production does not expose fallback organizations or memberships without PostgreSQL', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(organizationService.listActiveOrganizations(), (error) => error.statusCode === 503);
    await assert.rejects(organizationService.getUserMemberships(1), (error) => error.statusCode === 503);
  } finally {
    if (previousNodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});