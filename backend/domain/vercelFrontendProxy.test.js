const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

test('Vercel frontend /api/auth/register proxy strips /api and returns backend JSON, not SPA HTML', async (context) => {
  const forwarded = [];
  const backend = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString();
      forwarded.push({ method: req.method, url: req.url, body: rawBody ? JSON.parse(rawBody) : null });
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      const responseBody = req.url === '/auth/me'
        ? { user_id: 21, email: 'proxy@example.test', organization_name: 'Proxy Workspace' }
        : { token: 'test-token', user: { user_id: 21 }, organization: { organization_id: 31 } };
      res.end(JSON.stringify(responseBody));
    });
  });
  const backendPort = await listen(backend);
  process.env.BACKEND_URL = `http://127.0.0.1:${backendPort}`;
  const proxyModule = await import(`../../frontend/api/index.js?test=${Date.now()}`);

  const proxy = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const vercelResponse = {
        setHeader: res.setHeader.bind(res),
        status(code) {
          res.statusCode = code;
          return this;
        },
        json(body) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
          return this;
        },
        send(body) {
          res.end(body);
          return this;
        },
        end: res.end.bind(res),
      };
      proxyModule.default(req, vercelResponse);
    });
  });
  const proxyPort = await listen(proxy);
  context.after(() => {
    proxy.close();
    backend.close();
  });

  const response = await fetch(`http://127.0.0.1:${proxyPort}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name: 'Proxy User', email: 'proxy@example.test', password: 'ValidPassword123!', organization_name: 'Proxy Workspace' }),
  });

  assert.equal(response.status, 201);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(forwarded, [{
    method: 'POST',
    url: '/auth/register',
    body: { name: 'Proxy User', email: 'proxy@example.test', password: 'ValidPassword123!', organization_name: 'Proxy Workspace' },
  }]);
  assert.deepEqual(await response.json(), {
    token: 'test-token',
    user: { user_id: 21 },
    organization: { organization_id: 31 },
  });

  const login = await fetch(`http://127.0.0.1:${proxyPort}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'proxy@example.test', password: 'ValidPassword123!' }),
  });
  assert.equal(login.status, 201);
  assert.match(login.headers.get('content-type'), /application\/json/);
  assert.ok((await login.json()).token);

  const me = await fetch(`http://127.0.0.1:${proxyPort}/api/auth/me`, {
    headers: { Authorization: 'Bearer test-token' },
  });
  assert.equal(me.status, 201);
  assert.match(me.headers.get('content-type'), /application\/json/);
  assert.equal((await me.json()).organization_name, 'Proxy Workspace');

  assert.deepEqual(forwarded.map(({ method, url }) => ({ method, url })), [
    { method: 'POST', url: '/auth/register' },
    { method: 'POST', url: '/auth/login' },
    { method: 'GET', url: '/auth/me' },
  ]);
});
