const app = require('../../backend/index');

module.exports = (req, res) => {
  try {
    const HANDLER_ID = `[AUTH-HANDLER-${Date.now()}]`;
    console.log(`${HANDLER_ID} START: ${req.method} ${req.url}`);
    
    // Vercel passes the full path including /api/auth
    // We need to convert /api/auth/... to /auth/...
    let url = req.url;
    
    // Strip /api prefix
    if (url.startsWith('/api')) {
      url = url.substring(4); // Remove '/api'
    }
    
    // Ensure path starts with /auth
    if (!url.startsWith('/auth')) {
      url = '/auth' + url;
    }
    
    // Ensure it doesn't have double /auth
    if (url.startsWith('/auth/auth')) {
      url = url.substring(5); // Remove first '/auth'
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
    console.error(`[AUTH-HANDLER-ERROR] ${error.message}`);
    console.error(`[AUTH-HANDLER-ERROR] Stack: ${error.stack}`);
    res.status(500).json({ error: error.message });
  }
};

