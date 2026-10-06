/**
 * Vercel Serverless Catch-All Handler
 * Routes all /api/* requests to the Express backend
 */
const app = require('../backend/index');

/**
 * Vercel Function Handler
 * Wraps the Express app for Vercel's serverless environment
 */
module.exports = (req, res) => {
  return app(req, res);
};
