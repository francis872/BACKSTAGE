const ApiError = require('../utils/ApiError');
function emailAddress(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new ApiError(400, 'Email inválido.');
  return value.trim().toLowerCase();
}
function passwordValue(value) {
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value, 'utf8') > 72) throw new ApiError(400, 'La contraseña debe tener al menos 8 caracteres y como máximo 72 bytes.');
  return value;
}
module.exports = { emailAddress, passwordValue };
