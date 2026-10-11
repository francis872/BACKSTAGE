const test = require('node:test');
const assert = require('node:assert/strict');

test('la aplicación registra todas las rutas sin controladores indefinidos', () => {
  let app;
  assert.doesNotThrow(() => { app = require('../index'); });
  assert.equal(typeof app, 'function');
});

test('health reporta Postgres y almacén espacial sin simular disponibilidad', async (context) => {
  const previous = { url: process.env.DATABASE_URL, store: process.env.SPATIAL_STORE, env: process.env.NODE_ENV };
  delete process.env.DATABASE_URL;
  process.env.SPATIAL_STORE = 'memory';
  process.env.NODE_ENV = 'test';
  context.after(() => {
    for (const [key, value] of [['DATABASE_URL', previous.url], ['SPATIAL_STORE', previous.store], ['NODE_ENV', previous.env]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const app = require('../index');
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { 'X-Request-Id': 'startup-smoke' } });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-request-id'), 'startup-smoke');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.deepEqual(await response.json(), {
    status: 'unavailable',
    postgres: 'unavailable',
    postgresVersion: null,
    mongodb: 'disconnected',
    spatialStore: 'memory',
    service: 'BACKSTAGE Intelligence Backend',
  });
});
