/**
 * Vercel Serverless Catch-All Handler
 * Routes all /api/* requests to the Express backend
 */
const app = require('../backend/index');

/**
 * Vercel Function Handler
 * Wraps the Express app for Vercel's serverless environment
 * Strips the /api prefix before passing to Express
 */
module.exports = (req, res) => {
  // Strip /api prefix so /api/health becomes /health
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
    req.url = `${url.pathname}${url.search}`;
  }
  return app(req, res);
};
