import { DATA_TYPES } from './comparison.v1.mjs';
import { DECIMAL_POLICY, decimal, fraction, add, subtract, multiply, divide, compare, roundedUnits, roundedNumber } from './decimal.mjs';
export const COMPARISON_VERSION = 'backstage-weighted-minmax-2';
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const missingValue = v => v == null || typeof v === 'string' && v.trim() === '';
const validId = id => text(id) && id.length <= 200 && !/^[\$]|[.\x00-\x1f]/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
const zero = fraction(0n), one = fraction(1n);

/** Version 2: exact decimal comparisons and ratios; rounding only at output. */
export function evaluateComparison(input = {}) {
  const empty = { version: COMPARISON_VERSION, method: 'weighted_sum', normalization: 'minmax', errors: [], ranking: [], excluded: [] };
  const invalid = message => ({ ...empty, status: 'invalid', errors: [message] });
  if (!obj(input)) return invalid('Se requiere un objeto de comparación.');
  const { candidates, criteria, observations } = input;
  if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 6) return invalid('Selecciona entre 2 y 6 candidatos.');
  if (!Array.isArray(criteria) || criteria.length < 1 || criteria.length > 30) return invalid('Define entre 1 y 30 criterios.');
  if (!obj(observations) || candidates.some(c => !obj(c)) || criteria.some(c => !obj(c))) return invalid('Candidatos, criterios y observaciones inválidos.');
  if (new Set(candidates.map(c => c.id)).size !== candidates.length || new Set(criteria.map(c => c.id)).size !== criteria.length) return invalid('Los identificadores deben ser únicos.');
  for (const c of candidates) {
    const coordinate = (v, max) => ['number', 'string'].includes(typeof v) && String(v).trim() !== '' && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= max;
    if (!validId(c.id) || !text(c.name) || !coordinate(c.lat, 90) || !coordinate(c.lng, 180)) return invalid('Nombre, identificador o ubicación WGS84 inválidos.');
  }
  const parsed = new Map(), values = new Map();
  try {
    for (const c of criteria) {
      if (!validId(c.id) || !['name', 'definition', 'unit', 'source'].every(k => text(c[k])) || !['cost', 'benefit'].includes(c.direction) || c.normalization !== 'minmax' || !['block', 'exclude', 'worst'].includes(c.missing)) return invalid(`Completa los datos de ${c.name || 'criterio'}.`);
      const weight = decimal(c.weight), min = missingValue(c.min) ? null : decimal(c.min), max = missingValue(c.max) ? null : decimal(c.max);
      if (compare(weight.ratio, zero) < 0 || min && max && compare(min.ratio, max.ratio) > 0) return invalid(`Peso o restricciones inválidos: ${c.name}.`);
      parsed.set(c.id, { weight, min, max });
      for (const candidate of candidates) {
        const observation = observations[candidate.id]?.[c.id];
        if (observation != null && !obj(observation)) return invalid('Observación inválida.');
        if (observation?.unit != null && observation.unit !== c.unit) return invalid(`Unidad incompatible en ${candidate.name}: ${c.unit}. No se convierten unidades o monedas automáticamente.`);
        const raw = observation?.value; values.set(`${candidate.id}\u0000${c.id}`, missingValue(raw) ? null : decimal(raw));
      }
    }
  } catch (error) { return invalid(error.message); }
  const total = [...parsed.values()].reduce((sum, c) => add(sum, c.weight.ratio), zero);
  if (compare(total, zero) <= 0) return invalid('La suma de pesos debe ser mayor que cero.');
  const active = criteria.filter(c => compare(parsed.get(c.id).weight.ratio, zero) > 0), errors = [], excluded = [], missingByCandidate = new Map();
  const eligible = candidates.filter(candidate => {
    const reasons = [], missing = []; missingByCandidate.set(candidate.id, missing);
    for (const c of active) {
      const value = values.get(`${candidate.id}\u0000${c.id}`), bounds = parsed.get(c.id);
      if (!value) {
        missing.push(c.id);
        if (c.missing === 'block') errors.push(`Falta ${c.name} para ${candidate.name}.`);
        if (c.missing === 'exclude') reasons.push(`Falta ${c.name}.`);
        if (c.missing === 'worst' && (bounds.min || bounds.max)) reasons.push(`No se puede verificar la restricción de ${c.name} sin dato.`);
      } else if (bounds.min && compare(value.ratio, bounds.min.ratio) < 0 || bounds.max && compare(value.ratio, bounds.max.ratio) > 0) reasons.push(`Incumple restricción de ${c.name}.`);
    }
    if (reasons.length) excluded.push({ id: candidate.id, name: candidate.name, reasons });
    return reasons.length === 0;
  });
  if (errors.length) return { ...empty, status: 'missing_data', errors, excluded };
  if (eligible.length < 2) return { ...empty, status: 'insufficient', errors: ['Se requieren al menos dos candidatos elegibles tras aplicar las restricciones.'], excluded };
  const ranges = Object.fromEntries(active.map(c => {
    const data = eligible.map(a => values.get(`${a.id}\u0000${c.id}`)).filter(Boolean).sort((a, b) => compare(a.ratio, b.ratio));
    return [c.id, data.length ? { min: data[0].text, max: data.at(-1).text } : null];
  }));
  const weights = Object.fromEntries(criteria.map(c => [c.id, roundedNumber(divide(parsed.get(c.id).weight.ratio, total), 12)]));
  const ranking = eligible.map(candidate => {
    let exactScore = zero;
    const breakdown = active.map(c => {
      const observation = observations[candidate.id]?.[c.id] || {}, value = values.get(`${candidate.id}\u0000${c.id}`), range = ranges[c.id];
      const weight = divide(parsed.get(c.id).weight.ratio, total);
      let normalized = zero;
      if (value) {
        const min = decimal(range.min).ratio, max = decimal(range.max).ratio;
        normalized = compare(min, max) === 0 ? fraction(1n, 2n) : divide(subtract(value.ratio, min), subtract(max, min));
        if (c.direction === 'cost') normalized = subtract(one, normalized);
      }
      const contribution = multiply(multiply(normalized, weight), fraction(100n)), units = roundedUnits(contribution); exactScore = add(exactScore, contribution);
      return { criterion_id: c.id, name: c.name, value: value?.text ?? null, unit: c.unit, source: observation.source || c.source, observed_at: observation.observed_at || null, data_type: DATA_TYPES.includes(observation.data_type) ? observation.data_type : 'UNKNOWN', missing: !value, direction: c.direction, range, normalized: roundedNumber(normalized), weight: weights[c.id], weight_exact: { numerator: weight.n.toString(), denominator: weight.d.toString() }, contribution: Number(units) / 1e8 };
    });
    return { id: candidate.id, name: candidate.name, score: roundedNumber(exactScore), breakdown, missing_criteria: missingByCandidate.get(candidate.id) };
  }).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  ranking.forEach((row, i) => { row.rank = i && row.score === ranking[i - 1].score ? ranking[i - 1].rank : i + 1; });
  return { ...empty, status: 'ready', numeric_policy: DECIMAL_POLICY, weights, ranges, ranking, excluded, winner_ids: ranking.filter(r => r.rank === 1).map(r => r.id) };
}
