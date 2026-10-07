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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!BACKEND_URL) return res.status(503).json({ error: 'BACKEND_URL no configurado. BACKSTAGE no sustituye la API con datos ficticios.' });

  try {
    const incomingUrl = new URL(req.url, 'http://localhost');
    const pathname = incomingUrl.pathname === '/api' ? '/' : incomingUrl.pathname.replace(/^\/api\//, '/');
    const headers = { 'Content-Type': 'application/json' };
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    if (req.headers['x-request-id']) headers['x-request-id'] = req.headers['x-request-id'];
    const response = await fetch(`${BACKEND_URL}${pathname}${incomingUrl.search}`, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });
    const contentType = response.headers.get('content-type') || '';
    res.status(response.status);
    const requestId = response.headers.get('x-request-id');
    if (requestId) res.setHeader('X-Request-Id', requestId);
    if (contentType.includes('application/json')) return res.json(await response.json());
    return res.send(await response.text());
  } catch (error) {
    console.error('Proxy error:', error.message);
    return res.status(502).json({ error: 'Backend no disponible.' });
  }
}
