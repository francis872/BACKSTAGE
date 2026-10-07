const ApiError = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  const status = err instanceof ApiError ? err.statusCode : err.statusCode || 500;
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Error interno del servidor.'
    : err.message || 'Error interno del servidor.';

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: message, request_id: req.requestId || null });
};
