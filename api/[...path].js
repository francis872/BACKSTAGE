const app = require('../backend/index');

module.exports = (req, res) => {
  try {
    const HANDLER_ID = `[API-HANDLER-${Date.now()}]`;
    console.log(`${HANDLER_ID} START: ${req.method} ${req.url}`);
    
    // Extract the path and ensure it starts with /api
    let url = req.url;
    if (!url.startsWith('/api')) {
      url = '/api' + url;
    }
    
    req.url = url;
    
    // Clear any cached URL parsing
    delete req._parsedUrl;
    if (req._parsedPath) delete req._parsedPath;
    
    console.log(`${HANDLER_ID} Routing to Express: ${req.method} ${req.url}`);
    const result = app(req, res);
    console.log(`${HANDLER_ID} Done`);
    return result;
  } catch (error) {
    console.error(`[API-HANDLER-ERROR] ${error.message}`);
    console.error(`[API-HANDLER-ERROR] Stack: ${error.stack}`);
    res.status(500).json({ error: error.message });
  }
};
