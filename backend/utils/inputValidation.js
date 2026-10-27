const ApiError = require('./ApiError');
const fail = (message, status = 400) => { throw new ApiError(status, message); };
function identifier(value) {
  if (!['string', 'number'].includes(typeof value) || !/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail('Identificador inválido.');
  return Number(value);
}
function object(value, allowed) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).some(key => !allowed.includes(key))) fail('Los campos de la solicitud no están admitidos.');
}
module.exports = { fail, identifier, object };
