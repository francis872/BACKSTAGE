const app = require('../backend/index');

module.exports = (req, res) => {
  try {
    const HANDLER_ID = `[API-HANDLER-${Date.now()}]`;
    console.log(`${HANDLER_ID} START: ${req.method} ${req.url}`);
    
    // Strip /api prefix and pass the remaining path to Express
    let url = req.url;
    if (url.startsWith('/api')) {
      url = url.substring(4); // Remove '/api'
    }
    
    // Ensure path starts with /
    if (!url.startsWith('/')) {
      url = '/' + url;
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

