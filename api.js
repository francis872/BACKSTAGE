/**
 * Vercel Serverless API Handler
 * Routes all /api/* requests to the Express backend
 * This is placed at the root level to catch all /api/* requests
 */
const app = require('./backend/index');

/**
 * Vercel Function Handler
 * Wraps the Express app for Vercel's serverless environment
 * Strips the /api prefix before passing to Express
 */
module.exports = (req, res) => {
  // Log for debugging
  console.log(`[API Handler /api.js] ${req.method} ${req.url}`);
  
  // Strip /api prefix so /api/health becomes /health
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
    req.url = `${url.pathname}${url.search}`;
    console.log(`[API Handler /api.js] Stripped to ${req.method} ${req.url}`);
  }
  return app(req, res);
};
