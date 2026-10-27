const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.SPATIAL_STORE = 'memory';
process.env.JWT_SECRET = 'local-auth-proxy-regression-test-secret';
const identityModule = require('../services/mongoIdentity.service');
Object.assign(identityModule.service, identityModule.createMongoIdentityService(require('./helpers/fakeIdentityMongo').fakeIdentityMongo()));
const app = require('../index');
const express = require('express');
const jwt = require('jsonwebtoken');

test('real login tokens survive the web proxy; signature, expiry and workspace isolation remain enforced', async (t) => {
  const backend = app.listen(0, '127.0.0.1');
  t.after(() => backend.close());
  await new Promise((resolve) => backend.once('listening', resolve));
  process.env.BACKEND_URL = `http://127.0.0.1:${backend.address().port}`;
  const { default: proxy } = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/api/index.js')));
  const webApp = express();
  webApp.use(express.json());
  webApp.use((req, res, next) => Promise.resolve(proxy(req, res)).catch(next));
  const web = webApp.listen(0, '127.0.0.1');
  t.after(() => web.close());
  await new Promise((resolve) => web.once('listening', resolve));
  const base = `http://127.0.0.1:${web.address().port}/api`;
  const request = (route, options) => fetch(base + route, options);
  const credentials = { name: 'Local test', email: 'proxy-local@example.test', password: 'local-password-for-tests', organization_name: 'Local workspace' };
  const registration = await request('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  assert.equal(registration.status, 201);
  const login = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  assert.equal(login.status, 200);
  const session = await login.json();
  const headers = { Authorization: `Bearer ${session.token}`, 'X-Organization-Id': String(session.user.organization_id) };
  const me = await request('/auth/me', { headers });
  assert.equal(me.status, 200, 'a newly issued login token must work through the web proxy');
  assert.equal((await me.json()).user_id, session.user.user_id);
  const terrain = await request('/terrain/surface?bbox=-75.57,6.32,-75.55,6.34&resolution=17', { headers });
  assert.equal(terrain.status, 200);
  assert.ok((await terrain.json()).dataMode);
  const spatial = await request('/spatial/search?q=Medellin&worldId=earth', { headers });
  assert.equal(spatial.status, 200);
  const wrongWorkspace = await request('/spatial/search?q=Medellin', { headers: { ...headers, 'X-Organization-Id': '999999' } });
  assert.equal(wrongWorkspace.status, 403, 'organization header must survive the frontend proxy');
  const bearer = await request('/auth/me', { headers: { Authorization: `Bearer ${session.token}` } });
  assert.equal(bearer.status, 200, 'standard API clients remain supported');
  const rejected = [
    ['tampered', `${session.token.slice(0, -3)}abc`, 'SESSION_INVALID'],
    ['expired', jwt.sign({ sub: session.user.user_id }, process.env.JWT_SECRET, { issuer: process.env.JWT_ISSUER || 'backstage-intelligence', audience: 'backstage-platform', expiresIn: -1 }), 'SESSION_EXPIRED'],
    ['wrong issuer', jwt.sign({ sub: session.user.user_id }, process.env.JWT_SECRET, { issuer: 'another-app', audience: 'backstage-platform' }), 'SESSION_INVALID'],
    ['wrong audience', jwt.sign({ sub: session.user.user_id }, process.env.JWT_SECRET, { issuer: process.env.JWT_ISSUER || 'backstage-intelligence', audience: 'another-app' }), 'SESSION_INVALID'],
    ['unsigned', jwt.sign({ sub: session.user.user_id }, '', { algorithm: 'none' }), 'SESSION_INVALID'],
  ];
  for (const [name, token, code] of rejected) {
    const result = await request('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(result.status, 401, name);
    assert.equal((await result.json()).code, code, name);
  }
});
