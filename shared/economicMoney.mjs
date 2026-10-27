import { decimal, fraction, add, multiply, divide, compare, roundedUnits } from './decimal.mjs';
export { fraction, add, multiply, divide, compare, roundedUnits };
export const fail = message => { throw new Error(message); };
export function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail('Campos económicos no admitidos.');
}
export function integer(value, low, high, label) { if (!Number.isSafeInteger(value) || value < low || value > high) fail(`${label}: entero entre ${low} y ${high}.`); return value; }
export function minor(value, signed = false) {
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) fail('Importe fuera de precisión: usa texto entero en unidades mínimas.'); value = String(value); }
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,29})$/.test(value) || !signed && value.startsWith('-')) fail('Importe entero canónico de hasta treinta cifras requerido.');
  return BigInt(value);
}
export function rate(value, max = '10') { const r = decimal(value).ratio; if (r.n < 0n || compare(r, decimal(max).ratio) > 0) fail('Factor económico fuera de rango.'); return r; }
export const scaled = (value, factor) => roundedUnits(multiply(fraction(value), rate(factor)), 0);
export const sum = values => values.reduce((a, b) => a + b, 0n);
export const abs = v => v < 0n ? -v : v;
export const positive = v => v > 0n ? v : 0n;
export const min = (a, b) => a < b ? a : b;
export function ratio(a, b) { return b === 0n ? null : { numerator: String(a), denominator: String(b), decimal: decimalText(divide(fraction(a), fraction(b)), 8) }; }
export function decimalText(r, digits = 8) { const v = roundedUnits(r, digits), text = abs(v).toString().padStart(digits + 1, '0'); return (v < 0n ? '-' : '') + (digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text); }
export function month(value) { if (typeof value !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) fail('Periodo mensual YYYY-MM entre 2000 y 2099 requerido.'); return value; }
export const nextMonth = value => { const d = new Date(value + '-01T00:00:00.000Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); };
export function months(start, end) { month(start); month(end); const result = []; for (let p = start; p <= end; p = nextMonth(p)) { if (result.length >= 36) fail('Máximo treinta y seis meses por informe.'); result.push(p); } if (!result.length) fail('Intervalo mensual invertido.'); return result; }
export function text(value, max = 1000) { if (typeof value !== 'string' || !value.trim() || value.length > max) fail('Fuente o referencia económica requerida.'); return value.trim(); }
// Hamilton / largest remainder: exact conservation with deterministic identifier ties.
export function apportion(total, rows) {
  if (total < 0n || !rows.length || new Set(rows.map(r => r.id)).size !== rows.length) fail('Reparto monetario inválido.');
  const weights = rows.map(r => ({ id: String(r.id), weight: rate(r.weight, '1000000000') }));
  const denominator = weights.reduce((s, r) => add(s, r.weight), fraction(0n));
  if (denominator.n <= 0n) fail('La suma de pesos debe ser positiva.');
  const allocations = weights.map(r => { const ideal = multiply(fraction(total), divide(r.weight, denominator)); return { id: r.id, amount: ideal.n / ideal.d, remainder: fraction(ideal.n % ideal.d, ideal.d), exact: { numerator: String(ideal.n), denominator: String(ideal.d) } }; });
  let remainder = total - sum(allocations.map(r => r.amount));
  const order = [...allocations].sort((a, b) => -compare(a.remainder, b.remainder) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const row of order) if (remainder > 0n) { row.amount++; remainder--; }
  if (remainder !== 0n) fail('No se conservó el importe del reparto.');
  return allocations.map(r => ({ entity_id: r.id, amount_minor: String(r.amount), exact_share: r.exact }));
}
