/** Proxy del frontend hacia la API BACKSTAGE. Nunca genera datos ficticios. */
const BACKEND_URL = (process.env.BACKEND_URL || '').replace(/\/$/, '');

function allowedOrigin(origin) {
  const configured = (process.env.CORS_ORIGIN || '').split(',').map((item) => item.trim()).filter(Boolean);
  return origin && (configured.includes('*') || configured.includes(origin)) ? origin : null;
}

export default async function handler(req, res) {
  const origin = allowedOrigin(req.headers.origin);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Organization-Id, X-Request-Id, Idempotency-Key');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!BACKEND_URL) return res.status(503).json({ error: 'BACKEND_URL no configurado. BACKSTAGE no sustituye la API con datos ficticios.' });

  try {
    let requestBody;
    if (!['GET', 'HEAD'].includes(req.method)) {
      try {
        // Vercel's body getter can throw on malformed JSON. This is a client
        // input error and must not be reported as an unavailable backend.
        const supplied = req.body;
        const parsed = typeof supplied === 'string' || Buffer.isBuffer(supplied)
          ? JSON.parse(String(supplied)) : supplied ?? {};
        requestBody = JSON.stringify(parsed);
      } catch (error) {
        if (error instanceof SyntaxError || error.statusCode === 400) {
          return res.status(400).json({ error: 'No pudimos leer la información enviada. Revisa el formulario y vuelve a intentarlo.' });
        }
        throw error;
      }
    }
    const incomingUrl = new URL(req.url, 'http://localhost');
    const pathname = incomingUrl.pathname === '/api' ? '/' : incomingUrl.pathname.replace(/^\/api\//, '/');
    const headers = { 'Content-Type': 'application/json' };
    // Server configuration only: never relay an incoming bypass credential.
    if (process.env.BACKEND_PROTECTION_BYPASS) headers['x-vercel-protection-bypass'] = process.env.BACKEND_PROTECTION_BYPASS;
    if (typeof req.headers.authorization === 'string') headers.authorization = req.headers.authorization;
    if (req.headers['x-organization-id']) headers['x-organization-id'] = req.headers['x-organization-id'];
    if (req.headers['x-request-id']) headers['x-request-id'] = req.headers['x-request-id'];
    if (typeof req.headers['idempotency-key'] === 'string') headers['idempotency-key'] = req.headers['idempotency-key'];
    const response = await fetch(`${BACKEND_URL}${pathname}${incomingUrl.search}`, {
      method: req.method,
      headers,
      redirect: 'error',
      body: requestBody,
    });
    const contentType = response.headers.get('content-type') || '';
    res.status(response.status);
    const requestId = response.headers.get('x-request-id');
    if (requestId) res.setHeader('X-Request-Id', requestId);
    for (const name of ['Retry-After', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset']) {
      const value = response.headers.get(name); if (value) res.setHeader(name, value);
    }
    if (contentType.includes('application/json')) return res.json(await response.json());
    return res.send(await response.text());
  } catch (error) {
    console.error('Proxy error:', error.message);
    return res.status(502).json({ error: 'Backend no disponible.' });
  }
}
