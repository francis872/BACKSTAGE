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
  try {
    // Log for debugging
    console.log(`[API Handler] START: ${req.method} ${req.url}`);
    
    // Strip /api prefix so /api/health becomes /health
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
      req.url = `${url.pathname}${url.search}`;
      console.log(`[API Handler] STRIPPED: ${req.method} ${req.url}`);
    }
    
    console.log(`[API Handler] CALLING: Express app with ${req.method} ${req.url}`);
    const result = app(req, res);
    console.log(`[API Handler] RETURNED: ${req.method} ${req.url}`);
    return result;
  } catch (error) {
    console.error(`[API Handler] ERROR: ${error.message}`);
    console.error(`[API Handler] STACK: ${error.stack}`);
    res.status(500).json({ error: error.message });
  }
};
