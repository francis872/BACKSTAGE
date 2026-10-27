const test = require('node:test');
const assert = require('node:assert/strict');
// Startup checks are offline; live Atlas availability has a separate probe.
process.env.NODE_ENV = 'test';
process.env.SPATIAL_STORE = 'memory';
process.env.MONGODB_URI = '';
process.env.JWT_SECRET = 'startup-offline-fixture-secret';

test('la aplicación registra todas las rutas sin controladores indefinidos', () => {
  let app;
  assert.doesNotThrow(() => { app = require('../index'); });
  assert.equal(typeof app, 'function');
});

test('health sin Atlas devuelve 503, conserva correlación y no filtra secretos', async (context) => {
  const app = require('../index');
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { 'X-Request-Id': 'startup-smoke' } });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-request-id'), 'startup-smoke');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  const payload = await response.json();
  assert.equal(payload.service, 'BACKSTAGE Intelligence Backend');
  assert.equal(payload.status, 'unavailable');
  assert.equal(payload.postgres, undefined);
  assert.equal(payload.primaryStore, 'mongodb');
  assert.ok(['healthy', 'degraded', 'unavailable', 'connected', 'disconnected'].includes(payload.mongodb));
  assert.ok(['memory', 'atlas'].includes(payload.spatialStore));
  assert.equal(payload.mongouri, undefined);
});

test('el handler serverless Vercel conserva la ruta original al reescribir /api', async (context) => {
  const handler = require('../api');
  const server = require('node:http').createServer(handler).listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/index?__vercel_path=health&probe=preserved`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).service, 'BACKSTAGE Intelligence Backend');
});

test('Vercel enruta /api/auth/register al backend JSON, no al fallback SPA', async (context) => {
  const handler = require('../api');
  const server = require('node:http').createServer(handler).listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/index?__vercel_path=auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.match((await response.json()).error, /organization_name/);
});
