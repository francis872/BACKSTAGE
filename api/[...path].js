/**
 * Vercel Serverless Catch-All Handler
 * Routes all /api/* requests to the Express backend
 */
const app = require('../backend/index');

// Export Express app directly as Vercel function
module.exports = app;
