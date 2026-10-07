const test = require('node:test');
const assert = require('node:assert/strict');
const { platformSecurity, createRateLimiter } = require('../middleware/platformSecurity');

function response() {
  return {
    headers: {}, statusCode: null, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('aplica cabeceras seguras y conserva un request id válido', () => {
  const res = response(); let continued = false;
  const req = { get: () => 'trace-123' };
  platformSecurity(req, res, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(req.requestId, 'trace-123');
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('reemplaza request ids inseguros', () => {
  const res = response(); const req = { get: () => 'bad id\nheader' };
  platformSecurity(req, res, () => {});
  assert.notEqual(req.requestId, 'bad id\nheader');
  assert.match(req.requestId, /^[0-9a-f-]{36}$/);
});

test('limita intentos por dirección y email y permite después de la ventana', () => {
  let timestamp = 1000;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => timestamp });
  const req = { ip: '127.0.0.1', body: { email: 'User@Example.com' }, requestId: 'r1' };
  const first = response(); const second = response(); const blocked = response(); let calls = 0;
  limiter(req, first, () => { calls += 1; }); limiter(req, second, () => { calls += 1; }); limiter(req, blocked, () => { calls += 1; });
  assert.equal(calls, 2); assert.equal(blocked.statusCode, 429); assert.equal(blocked.payload.request_id, 'r1');
  timestamp = 2000; const renewed = response(); limiter(req, renewed, () => { calls += 1; });
  assert.equal(calls, 3);
});
