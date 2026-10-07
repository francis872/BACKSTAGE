const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.SPATIAL_STORE = 'memory';
process.env.JWT_SECRET = 'auth-onboarding-test-secret-32-characters';

const app = require('../index');

test('registration creates a workspace, admin membership, and authenticated session', async (context) => {
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const email = `workspace-${Date.now()}@example.test`;
  const credentials = { name: 'Workspace Owner', email, password: 'strong-test-password', organization_name: 'Acme Territories' };

  const registration = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  assert.equal(registration.status, 201);
  const created = await registration.json();
  assert.equal(created.user.role, 'admin');
  assert.equal(created.user.organization_name, 'Acme Territories');
  assert.match(created.user.organization_slug, /^acme-territories-[a-f0-9]{8}$/);
  assert.equal(created.organization.organization_id, created.user.organization_id);
  assert.ok(created.token);

  const profile = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${created.token}` },
  });
  assert.equal(profile.status, 200);
  const member = await profile.json();
  assert.equal(member.organization_name, 'Acme Territories');
  assert.equal(member.memberships[0].role, 'admin');

  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: credentials.password }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.organization_id, created.user.organization_id);
});

test('public registration cannot choose a role or join an organization by id', async (context) => {
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'External User',
      email: `role-attack-${Date.now()}@example.test`,
      password: 'strong-test-password',
      organization_name: 'Another Workspace',
      organization_id: 1,
      role: 'admin',
    }),
  });
  assert.equal(response.status, 400);
});