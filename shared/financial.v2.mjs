import { decimal, fraction, add, multiply, divide, compare, roundedUnits } from './decimal.mjs';

export const VERSION = 'backstage-financial-2';
const zero = fraction(0n), one = fraction(1n);
export const NUMERIC_POLICY = { input: 'canonical_decimal_string', arithmetic: 'exact_rational', money_digits: 6, ratio_digits: 4, rounding: 'half_away_from_zero', irr: 'binary64_bisection_normalized_flows', max_periods: 120 };
function text(value, digits = 6) {
  const units = roundedUnits(value, digits), s = (units < 0n ? -units : units).toString().padStart(digits + 1, '0');
  return (units < 0n ? '-' : '') + (digits ? `${s.slice(0, -digits)}.${s.slice(-digits)}` : s);
}
const amount = v => ({ value: Number(text(v)), decimal: text(v) });
const series = values => {
  if (!Array.isArray(values) || values.length < 2 || values.length > 121) throw Error('Se requieren entre 2 y 121 flujos, incluido el periodo 0.');
  return values.map(v => decimal(v).ratio);
};
function rate(value) {
  const r = decimal(value).ratio;
  if (compare(r, fraction(-99n, 100n)) < 0 || compare(r, fraction(10n)) > 0) throw Error('La tasa por periodo debe estar entre -0.99 y 10.');
  return r;
}
function discounted(flows, r) {
  const base = add(one, r); let power = one;
  return flows.map(flow => { const value = divide(flow, power); power = multiply(power, base); return value; });
}
const sum = flows => flows.reduce(add, zero);
function payback(flows) {
  if (compare(flows[0], zero) >= 0) return 0;
  let total = flows[0];
  for (let t = 1; t < flows.length; t++) {
    const previous = total; total = add(total, flows[t]);
    if (compare(previous, zero) < 0 && compare(total, zero) >= 0) return Number(text(add(fraction(BigInt(t - 1)), divide(fraction(-previous.n, previous.d), flows[t])), 4));
  }
  return null;
}
function irr(flows) {
  const signs = flows.filter(v => v.n !== 0n).map(v => v.n > 0n ? 1 : -1);
  const changes = signs.slice(1).filter((s, i) => s !== signs[i]).length;
  if (changes !== 1) return { irr: null, converged: false, reason: changes === 0 ? 'no_sign_change' : 'multiple_sign_changes', note: 'No se selecciona una TIR entre posibles raíces múltiples.' };
  const numeric = flows.map(v => Number(v.n) / Number(v.d)), scale = Math.max(...numeric.map(Math.abs));
  const normalized = numeric.map(v => v / scale);
  // Polynomial in q=1/(1+r) avoids overflow near r=-1 for long horizons.
  const value = r => {
    const q = 1 / (1 + r);
    if (q <= 1) return normalized.reduceRight((acc, v) => acc * q + v, 0);
    return normalized.reduce((acc, v) => acc / q + v, 0);
  };
  let low = -0.99, high = 10, a = value(low), b = value(high);
  if (a === 0) return { irr: low, converged: true, iterations: 0, method: 'bisection' };
  if (b === 0) return { irr: high, converged: true, iterations: 0, method: 'bisection' };
  if (Math.sign(a) === Math.sign(b)) return { irr: null, converged: false, reason: 'root_outside_bounds', bounds: [low, high] };
  for (let i = 1; i <= 100; i++) {
    const mid = (low + high) / 2, v = value(mid);
    if (v === 0 || high - low < 1e-12) return { irr: Number(mid.toFixed(10)), converged: true, iterations: i, method: 'bisection' };
    if (Math.sign(v) === Math.sign(a)) { low = mid; a = v; } else high = mid;
  }
  return { irr: null, converged: false, reason: 'iteration_limit' };
}
export function runFinancial(name, p) {
  if (name === 'financial.cap_rate') {
    const noi = decimal(p.netOperatingIncome).ratio, value = decimal(p.propertyValue).ratio;
    if (compare(value, zero) <= 0) throw Error('El valor de la propiedad debe ser positivo.');
    return { capRate: Number(text(multiply(divide(noi, value), fraction(100n)), 4)) };
  }
  if (name === 'financial.dcf') {
    if (!Array.isArray(p.projectedCashFlows) || !p.projectedCashFlows.length || p.projectedCashFlows.length > 120) throw Error('El horizonte debe contener entre 1 y 120 periodos.');
    const flows = series(['0', ...p.projectedCashFlows]), r = rate(p.discountRate);
    const pv = sum(discounted(flows, r)), terminal = decimal(p.terminalValue ?? '0').ratio;
    const terminalFlows = flows.map((_, i) => i === flows.length - 1 ? terminal : zero);
    const tv = sum(discounted(terminalFlows, r)), a = amount(pv), b = amount(tv), total = amount(add(pv, tv));
    return { presentValueOfFlows: a.value, presentValueOfTerminal: b.value, totalValue: total.value, presentValueOfFlows_decimal: a.decimal, presentValueOfTerminal_decimal: b.decimal, totalValue_decimal: total.decimal };
  }
  const flows = series(p.cashFlows);
  if (name === 'financial.npv_irr') {
    const npv = amount(sum(discounted(flows, rate(p.discountRate)))) ;
    return { npv: npv.value, npv_decimal: npv.decimal, irr: irr(flows) };
  }
  if (name === 'financial.payback') return { simple: payback(flows), discounted: p.discountRate == null ? null : payback(discounted(flows, rate(p.discountRate))) };
  throw Error('Motor financiero no soportado.');
}
