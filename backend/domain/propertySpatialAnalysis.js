const C = require('./horizontalProperty');
const KINDS = Object.keys(C.KINDS);
const METHODS = ['weights', 'moran', 'local_moran', 'gi_star', 'kde', 'temporal'];
const METRICS = ['pqrs_count', 'open_pqrs_count', 'outstanding_minor', 'overdue_minor'];
const MAX_UNITS = 64, MAX_RECORDS = 2000;
function integer(value, low, high, label) {
  if (!Number.isSafeInteger(value) || value < low || value > high) C.fail(`${label}: entero entre ${low} y ${high}.`);
  return value;
}
function number(value, low, high, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) C.fail(`${label}: número entre ${low} y ${high}.`);
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) C.fail('Los periodos requieren fecha, hora y zona horaria.');
  return new Date(value).toISOString();
}
function parameters(input) {
  C.object(input, ['method', 'metric', 'unit_kind', 'weights', 'permutations', 'seed', 'alpha', 'currency', 'scale', 'density', 'periods', 'temporal_method']);
  const method = input.method || 'moran', metric = input.metric || 'pqrs_count', unit_kind = input.unit_kind || 'private_unit';
  if (!METHODS.includes(method) || !METRICS.includes(metric) || !KINDS.includes(unit_kind)) C.fail('Método, variable o tipo territorial no admitido.');
  const q = { method, metric, unit_kind, permutations: integer(input.permutations ?? 199, 19, 9999, 'Permutaciones'), seed: integer(input.seed ?? 0, 0, 2147483647, 'Semilla'), alpha: input.alpha ?? .05 };
  if (![.1, .05, .01].includes(q.alpha)) C.fail('Significancia: 0.1, 0.05 o 0.01.');
  const w = input.weights || {};
  C.object(w, ['method', 'k', 'distance_m', 'power', 'transform', 'symmetry', 'zero_distance']);
  if (w.zero_distance != null && w.zero_distance !== 'error') C.fail('Los centroides coincidentes requieren corrección de los datos; no se excluyen silenciosamente.');
  q.weights = { method: w.method || 'knn', transform: w.transform || 'row', symmetry: w.symmetry || 'union', zero_distance: 'error' };
  if (!['queen', 'rook', 'knn', 'distance_band', 'inverse_distance'].includes(q.weights.method) || !['row', 'none'].includes(q.weights.transform) || !['union', 'directed'].includes(q.weights.symmetry)) C.fail('Configuración de vecindad no admitida.');
  if (q.weights.method === 'knn') q.weights.k = integer(w.k ?? 2, 1, MAX_UNITS - 1, 'K');
  if (['distance_band', 'inverse_distance'].includes(q.weights.method)) q.weights.distance_m = number(w.distance_m, 1, 100000, 'Distancia en metros');
  if (q.weights.method === 'inverse_distance') q.weights.power = number(w.power ?? 1, .01, 8, 'Potencia');
  if (metric.endsWith('_minor')) {
    if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) C.fail('Selecciona una moneda para la cartera.');
    q.currency = input.currency; q.scale = integer(input.scale, 0, 4, 'Decimales monetarios');
  } else if (input.currency != null || input.scale != null) C.fail('La variable de PQRS no usa moneda.');
  if (method === 'kde') {
    if (!['pqrs_count', 'open_pqrs_count'].includes(metric)) C.fail('KDE de este incremento admite conteos PQRS registrados.');
    C.object(input.density, ['bandwidth_m', 'resolution', 'kernel']);
    q.density = { bandwidth_m: number(input.density.bandwidth_m, 1, 100000, 'Ancho de banda en metros'), resolution: integer(input.density.resolution ?? 8, 4, 12, 'Resolución'), kernel: input.density.kernel || 'gaussian' };
    if (!['gaussian', 'quartic', 'epanechnikov', 'uniform', 'triangular'].includes(q.density.kernel)) C.fail('Kernel no admitido.');
  } else if (input.density != null) C.fail('El ancho de banda solo se usa en KDE.');
  if (method === 'temporal') {
    if (metric !== 'pqrs_count' || !Array.isArray(input.periods) || input.periods.length < 2 || input.periods.length > 6) C.fail('Temporal admite conteos PQRS en dos a seis periodos explícitos.');
    q.temporal_method = input.temporal_method || 'moran';
    if (!['moran', 'local_moran', 'gi_star'].includes(q.temporal_method)) C.fail('Método temporal no admitido.');
    q.periods = input.periods.map(p => { C.object(p, ['start', 'end']); const start = timestamp(p.start), end = timestamp(p.end); if (start >= end) C.fail('Cada periodo debe ser creciente.'); return { start, end }; });
    if (q.periods.some((p, i) => i && p.start < q.periods[i - 1].end)) C.fail('Los periodos deben estar ordenados y no superponerse.');
  } else if (input.periods != null || input.temporal_method != null) C.fail('Los periodos requieren análisis temporal.');
  return q;
}
// Execution fields that do not form part of a numerical result's reproducibility.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !['duration_ms', 'executed_at', 'analysis_id', 'cache'].includes(k)).map(([k, v]) => [k, stable(v)]));
  return value;
}
module.exports = { parameters, METHODS, METRICS, MAX_UNITS, MAX_RECORDS, stable };
