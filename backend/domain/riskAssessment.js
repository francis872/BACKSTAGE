const INDICATORS = ['flood_risk', 'landslide_risk', 'crime_risk', 'climate_exposure'];
const DATA_MODES = ['measured', 'derived', 'declared', 'procedural'];

function unit(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new TypeError(`${name} debe estar entre 0 y 1.`);
  return number;
}

function normalizeAssessmentInput(data = {}, { requireLocation = false } = {}) {
  const locationId = Number(data.location_id);
  if (requireLocation && (!Number.isInteger(locationId) || locationId <= 0)) throw new TypeError('location_id es requerido y debe ser entero positivo.');
  const indicators = Object.fromEntries(INDICATORS.map((name) => [name, unit(data[name], name)]));
  const score = Number((INDICATORS.reduce((sum, name) => sum + indicators[name], 0) / INDICATORS.length).toFixed(6));
  const dataMode = data.data_mode || data.details?.data_mode || 'declared';
  if (!DATA_MODES.includes(dataMode)) throw new TypeError('data_mode no es válido.');
  const confidence = data.confidence == null || data.confidence === '' ? null : unit(data.confidence, 'confidence');
  const notes = String(data.notes ?? data.details?.notes ?? '').trim();
  if (notes.length > 2000) throw new TypeError('notes no puede superar 2000 caracteres.');
  return {
    ...(requireLocation ? { location_id: locationId } : {}),
    ...indicators,
    score,
    details: { data_mode: dataMode, confidence, notes: notes || null, model: 'arithmetic-mean-v1' },
  };
}

function classifyAssessment(row) {
  const score = Number(row.score);
  if (!Number.isFinite(score)) return 'unknown';
  if (score >= 0.7) return 'critical';
  if (score >= 0.4) return 'high';
  if (score >= 0.2) return 'moderate';
  return 'low';
}

module.exports = { INDICATORS, DATA_MODES, normalizeAssessmentInput, classifyAssessment };
