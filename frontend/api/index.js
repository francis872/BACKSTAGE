/**
 * Proxy API para BACKSTAGE Intelligence
 * En producción: redirige al backend en Railway
 * En desarrollo: sirve datos mock
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Proxy a backend real si está disponible
 */
async function proxyToBackend(req, res) {
  try {
    const path = req.url.replace(/^\\\?.*$/, ''); // Remove query string
    const query = new URL('http://localhost' + req.url).search;
    const method = req.method;
    const body = req.body ? JSON.stringify(req.body) : undefined;
    
    const response = await fetch(\\\\\, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...req.headers,
      },
      body,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    // Fallback a datos mock si backend no está disponible
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

  // En producción, siempre proxy. En desarrollo, fallback a mock
  if (IS_PRODUCTION || BACKEND_URL !== 'http://localhost:4000') {
    await proxyToBackend(req, res);
  } else {
    serveMockData(req, res);
  }
}
