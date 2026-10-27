const ApiError = require('../utils/ApiError');
const states = { PLANNED: ['ACTIVE', 'CANCELLED'], ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED', 'INTERRUPTED'], PAUSED: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'INTERRUPTED'], INTERRUPTED: ['ACTIVE', 'COMPLETED', 'CANCELLED'] };
function transition(from, to) {
  if (!states[from]?.includes(to)) throw new ApiError(409, `No se permite pasar de ${from} a ${to}.`);
}
function identifier(value) {
  if (!['number','string'].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new ApiError(400, 'Identificador inválido.');
  return Number(value);
}
function gpsPoint(value, now = Date.now()) {
  const number = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!number(value?.longitude) || Math.abs(value.longitude) > 180 || !number(value.latitude) || Math.abs(value.latitude) > 90
    || !number(value.accuracy_m) || value.accuracy_m < 0 || value.accuracy_m > 100 || typeof value.recorded_at !== 'string' || !Number.isFinite(Date.parse(value.recorded_at))
    || Math.abs(now - Date.parse(value.recorded_at)) > 60000) throw new ApiError(400, 'La posición requiere GPS reciente y precisión entre 0 y 100 metros.');
  return { longitude: value.longitude, latitude: value.latitude, accuracy_m: value.accuracy_m, recorded_at: new Date(value.recorded_at).toISOString() };
}
module.exports = { gpsPoint, transition };
