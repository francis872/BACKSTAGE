const app = require('../../backend/index');

module.exports = (req, res) => {
  try {
    const HANDLER_ID = `[AUTH-HANDLER-${Date.now()}]`;
    console.log(`${HANDLER_ID} START: ${req.method} ${req.url}`);
    console.log(`${HANDLER_ID} req.url=${req.url}, req.path=${req.path}, req.pathname=${req.pathname}`);
    
    // Keep the /api/auth prefix to ensure SPA fallback check works correctly
    // The backend will handle auth routing from /api/auth paths
    if (!req.url.startsWith('/api')) {
      req.url = '/api' + req.url;
    }
    
    console.log(`${HANDLER_ID} Modified req.url to: ${req.url}`);
    
    // Clear any cached URL parsing so Express recalculates req.path
    delete req._parsedUrl;
    if (req._parsedPath) delete req._parsedPath;
    
    console.log(`${HANDLER_ID} Calling Express app with ${req.method} ${req.url}`);
    const result = app(req, res);
    console.log(`${HANDLER_ID} Express returned: ${req.method} ${req.url}`);
    return result;
  } catch (error) {
    console.error(`[AUTH-HANDLER-ERROR] ${error.message}`);
    console.error(`[AUTH-HANDLER-ERROR] Stack: ${error.stack}`);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
};
