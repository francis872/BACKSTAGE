const ApiError = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  const databaseUnavailable = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', '28P01', '3D000', '42P01', '3F000', '57P03'].includes(err.code)
    || String(err.code || '').startsWith('08');
  const status = err instanceof ApiError ? err.statusCode : err.statusCode || (databaseUnavailable ? 503 : 500);
  const message = status === 503
    ? err instanceof ApiError ? err.message : 'PostgreSQL no está disponible temporalmente.'
    : status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor.'
      : err.message || 'Error interno del servidor.';

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: message, request_id: req.requestId || null });
};
