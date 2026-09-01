/**
 * Proxy API para BACKSTAGE Intelligence
 * En producción: redirige al backend desplegado
 * En desarrollo: sirve datos mock si no hay BACKEND_URL configurado
 */

const BACKEND_URL = (process.env.BACKEND_URL || '').replace(/\/$/, '');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

async function proxyToBackend(req, res) {
  try {
    if (!BACKEND_URL) {
      throw new Error('BACKEND_URL no configurado');
    }

    const incomingUrl = new URL(req.url, 'http://localhost');
    let pathname = incomingUrl.pathname;
    if (pathname === '/api') {
      pathname = '/';
    } else if (pathname.startsWith('/api/')) {
      pathname = pathname.slice(4);
    }
    const targetUrl = `${BACKEND_URL}${pathname}${incomingUrl.search}`;
    const method = req.method;
    const body = req.body ? JSON.stringify(req.body) : undefined;
    const headers = {
      'Content-Type': 'application/json',
    };
    if (req.headers.authorization) {
      headers.authorization = req.headers.authorization;
    }

    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      res.status(response.status).json(data);
      return;
    }

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (error) {
    console.error('Proxy error:', error.message);
    if (IS_PRODUCTION) {
      res.status(502).json({ error: 'Backend no disponible.' });
      return;
    }
    serveMockData(req, res);
  }
}

/**
 * Mock data para desarrollo local
 */
function serveMockData(req, res) {
  const path = req.url.split('?')[0];

  if (path === '/locations') {
    return res.status(200).json([
      {
        location_id: 1,
        name: "McDonald's Centro",
        type: 'restaurant',
        city: 'Bogotá',
        latitude: 4.711,
        longitude: -74.0721,
      },
      {
        location_id: 2,
        name: 'Starbucks Parque',
        type: 'cafe',
        city: 'Bogotá',
        latitude: 4.6693,
        longitude: -74.0536,
      },
      {
        location_id: 3,
        name: 'Plaza Comercial Norte',
        type: 'retail',
        city: 'Bogotá',
        latitude: 4.7501,
        longitude: -74.065,
      },
    ]);
  }

  if (path === '/health') {
    return res.status(200).json({ status: 'ok', service: 'BACKSTAGE API' });
  }

  res.status(404).json({ error: 'Endpoint no encontrado' });
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (IS_PRODUCTION || BACKEND_URL) {
    await proxyToBackend(req, res);
  } else {
    serveMockData(req, res);
  }
}
