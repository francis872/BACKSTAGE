// Bounded decimal inputs and exact rational intermediates; no runtime dependency.
export const DECIMAL_POLICY = Object.freeze({ significant_digits: 34, fractional_digits: 18, score_digits: 8, rounding: 'half_away_from_zero', score_aggregation: 'exact_sum_then_round', storage: 'canonical_decimal_string' });
const abs = n => n < 0n ? -n : n;
const gcd = (a, b) => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a || 1n; };
export function fraction(n, d = 1n) {
  if (!d) throw new Error('División por cero.');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d); return { n: n / g, d: d / g };
}
export const add = (a, b) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
export const subtract = (a, b) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
export const multiply = (a, b) => fraction(a.n * b.n, a.d * b.d);
export const divide = (a, b) => fraction(a.n * b.d, a.d * b.n);
export const compare = (a, b) => { const d = a.n * b.d - b.n * a.d; return d < 0n ? -1 : d > 0n ? 1 : 0; };
export function decimal(value) {
  if (!['number', 'string'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value)) throw new Error('Decimal finito requerido.');
  const raw = String(value).trim();
  if (!raw || raw.length > 128) throw new Error('Decimal fuera de los límites admitidos.');
  const m = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d{1,2}))?$/.exec(raw);
  if (!m) throw new Error('Usa un decimal con punto y sin separadores de miles.');
  const exponent = Number(m[5] || 0); if (Math.abs(exponent) > 38) throw new Error('Exponente fuera de rango.');
  let digits = ((m[2] || '0') + (m[3] ?? m[4] ?? '')).replace(/^0+/, '') || '0';
  let scale = (m[3] ?? m[4] ?? '').length - exponent;
  if (digits === '0') return { text: '0', ratio: fraction(0n) };
  if (scale < 0) { digits += '0'.repeat(-scale); scale = 0; }
  while (scale > 0 && digits.endsWith('0')) { digits = digits.slice(0, -1); scale--; }
  if (digits.length > DECIMAL_POLICY.significant_digits || scale > DECIMAL_POLICY.fractional_digits) throw new Error('Máximo 34 cifras significativas y 18 decimales.');
  const integer = BigInt(digits);
  if (typeof value === 'number' && integer > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Envía el importe como texto decimal para conservar su precisión.');
  let text = scale ? `${digits.padStart(scale + 1, '0').slice(0, -scale)}.${digits.padStart(scale + 1, '0').slice(-scale)}` : digits;
  if (m[1] === '-') text = '-' + text;
  return { text, ratio: fraction(m[1] === '-' ? -integer : integer, 10n ** BigInt(scale)) };
}
export function roundedUnits(value, places = 8) {
  const n = abs(value.n) * 10n ** BigInt(places), q = n / value.d, r = n % value.d;
  return (value.n < 0n ? -1n : 1n) * (q + (r * 2n >= value.d ? 1n : 0n));
}
export const roundedNumber = (value, places = 8) => Number(roundedUnits(value, places)) / 10 ** places;
