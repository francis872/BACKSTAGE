const crypto = require('crypto');

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function platformSecurity(req, res, next) {
  const incoming = req.get?.('x-request-id');
  const requestId = REQUEST_ID_PATTERN.test(incoming || '') ? incoming : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Cache-Control', 'no-store');
  next();
}

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 10, now = Date.now } = {}) {
  const duration = Math.max(1000, Number(windowMs) || 15 * 60 * 1000);
  const limit = Math.max(1, Math.floor(Number(max) || 10));
  const buckets = new Map();
  let calls = 0;
  return function rateLimiter(req, res, next) {
    const timestamp = now();
    const key = `${req.ip || req.socket?.remoteAddress || 'unknown'}:${String(req.body?.email || '').trim().toLowerCase()}`;
    let bucket = buckets.get(key);
    if (!bucket || timestamp >= bucket.resetAt) bucket = { count: 0, resetAt: timestamp + duration };
    bucket.count += 1;
    buckets.set(key, bucket);
    calls += 1;
    if (calls % 250 === 0) {
      for (const [storedKey, stored] of buckets) if (timestamp >= stored.resetAt) buckets.delete(storedKey);
    }
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000))));
      return res.status(429).json({ error: 'Demasiados intentos. Intente nuevamente más tarde.', request_id: req.requestId });
    }
    return next();
  };
}

module.exports = { platformSecurity, createRateLimiter, REQUEST_ID_PATTERN };
