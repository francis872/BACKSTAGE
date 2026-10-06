const app = require('../backend/index');

module.exports = (req, res) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Delegate to Express app
  app(req, res);
};
