import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const authUrl = moduleUrl(fs.readFileSync(new URL('../src/lib/auth.js', import.meta.url), 'utf8'));
const auth = await import(authUrl);
const api = await import(moduleUrl(fs.readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8').replace("'./auth'", JSON.stringify(authUrl))));
const user = { user_id: 7, organization_id: 3, name: 'Local test' };

function setup(t) {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const values = new Map();
  const events = new EventTarget();
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }, dispatchEvent: (event) => events.dispatchEvent(event) };
  t.after(() => { globalThis.window = previousWindow; globalThis.fetch = previousFetch; });
  auth.setSession('existing-token', user);
  return events;
}

test('protected requests preserve Headers, application token and selected organization', async (t) => {
  setup(t);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/spatial/geocode?q=Medellin');
    assert.equal(options.headers.get('Authorization'), 'Bearer existing-token');
    assert.equal(options.headers.get('X-Organization-Id'), '3');
    assert.equal(options.headers.get('X-Custom'), 'preserved');
    return new Response('{}');
  };
  await api.apiRequest('/spatial/geocode?q=Medellin', { headers: new Headers({ 'X-Custom': 'preserved' }) });
});

test('concurrent unauthorized requests clear one session and emit one recovery event', async (t) => {
  const events = setup(t);
  let expired = 0;
  events.addEventListener('backstage:session-expired', () => { expired += 1; });
  globalThis.fetch = async () => new Response('{}', { status: 401 });
  await Promise.all([api.apiRequest('/spatial/geocode'), api.apiRequest('/spatial/weather')]);
  assert.equal(auth.getSessionToken(), null);
  assert.equal(auth.getSessionUser(), null);
  assert.equal(expired, 1);
});

test('late failure from a previous token cannot log out a new session', async (t) => {
  setup(t);
  let finish;
  globalThis.fetch = () => new Promise((resolve) => { finish = resolve; });
  const pending = api.apiRequest('/spatial/search');
  auth.setSession('new-token', user);
  finish(new Response('{}', { status: 401 }));
  await pending;
  assert.equal(auth.getSessionToken(), 'new-token');
});

test('login rejection, permission denial and temporary service failure do not expire an existing session', async (t) => {
  setup(t);
  for (const [route, status] of [['/auth/login', 401], ['/auth/register', 401], ['/spatial/search', 403], ['/spatial/weather', 503]]) {
    globalThis.fetch = async (_, options) => {
      if (route.startsWith('/auth/')) assert.equal(options.headers.has('Authorization'), false);
      return new Response('{}', { status });
    };
    await api.apiRequest(route);
    assert.equal(auth.getSessionToken(), 'existing-token');
  }
});

test('access is stored only after the backend verifies the exact user and organization', async (t) => {
  setup(t);
  globalThis.fetch = async (_, options) => {
    assert.equal(options.headers.Authorization, 'Bearer candidate-token');
    return new Response('{}', { status: 401 });
  };
  await assert.rejects(auth.establishSession('candidate-token', user), /validar el acceso/);
  assert.equal(auth.getSessionToken(), 'existing-token');
  globalThis.fetch = async () => new Response(JSON.stringify({ ...user, organization_id: 9 }));
  await assert.rejects(auth.establishSession('candidate-token', user), /espacio de trabajo/);
  globalThis.fetch = async () => new Response(JSON.stringify(user));
  await auth.establishSession('candidate-token', user);
  assert.equal(auth.getSessionToken(), 'candidate-token');
});
