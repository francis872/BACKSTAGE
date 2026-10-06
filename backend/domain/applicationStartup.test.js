const test = require('node:test');
const assert = require('node:assert/strict');

test('la aplicación registra todas las rutas sin controladores indefinidos', () => {
  let app;
  assert.doesNotThrow(() => { app = require('../index'); });
  assert.equal(typeof app, 'function');
});

test('health responde con estados operativos sin filtrar secretos', async (context) => {
  const app = require('../index');
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { 'X-Request-Id': 'startup-smoke' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'startup-smoke');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  const payload = await response.json();
  assert.equal(payload.service, 'BACKSTAGE Intelligence Backend');
  assert.ok(['ok', 'degraded', 'unavailable'].includes(payload.status));
  assert.ok(['healthy', 'degraded', 'unavailable', 'connected', 'disconnected'].includes(payload.postgres));
  assert.ok(['healthy', 'degraded', 'unavailable', 'connected', 'disconnected'].includes(payload.mongodb));
  assert.ok(['memory', 'atlas'].includes(payload.spatialStore));
  assert.equal(payload.mongouri, undefined);
});
