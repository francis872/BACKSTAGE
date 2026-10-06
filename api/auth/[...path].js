const app = require('../../backend/index');

module.exports = (req, res) => {
  try {
    console.log(`[Auth Handler] START: ${req.method} ${req.url}`);
    
    // The path should be /auth/<rest> since we're at api/auth/
    // But Vercel might pass it differently, so let's handle both cases
    
    // Build the full path: /auth + remaining path
    const url = new URL(req.url, 'http://localhost');
    let pathname = url.pathname;
    
    // If it doesn't start with /auth, prepend it
    if (!pathname.startsWith('/auth')) {
      pathname = '/auth' + pathname;
    }
    
    // Also check if /api/auth is at the beginning and strip it
    if (pathname.startsWith('/api/auth')) {
      pathname = pathname.replace(/^\/api/, '');
    }
    
    url.pathname = pathname;
    req.url = `${url.pathname}${url.search}`;
    
    console.log(`[Auth Handler] ROUTING TO: ${req.method} ${req.url}`);
    const result = app(req, res);
    console.log(`[Auth Handler] RETURNED: ${req.method} ${req.url}`);
    return result;
  } catch (error) {
    console.error(`[Auth Handler] ERROR: ${error.message}`);
    console.error(`[Auth Handler] STACK: ${error.stack}`);
    res.status(500).json({ error: error.message });
  }
};
