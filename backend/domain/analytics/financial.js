/**
 * BACKSTAGE Analytics Core — Financial & real-estate analytics.
 *
 * Implements deterministic financial evaluation primitives: net present
 * value, internal rate of return, cap rate, payback period (simple and
 * discounted). These operate purely on cash-flow scenarios explicitly
 * provided by the caller (observed data or user assumptions) — this
 * module never invents a cash flow or applies a fixed "average
 * appreciation %" as if it were a fact.
 */

const ALGORITHM_VERSION = '1.0.0';

function validateCashFlows(cashFlows) {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) {
    throw new Error(
      'Se requiere un arreglo de flujos de caja con al menos 2 periodos: ' +
      'el periodo 0 (inversión inicial, normalmente negativa) y al menos un periodo futuro.'
    );
  }
  const numeric = cashFlows.map((v) => Number(v));
  if (numeric.some((v) => Number.isNaN(v))) {
    throw new Error('Todos los flujos de caja deben ser numéricos.');
  }
  return numeric;
}

/**
 * Net present value of a cash-flow series at a given discount rate.
 * cashFlows[0] is period 0 (typically the negative initial investment).
 */
function netPresentValue(cashFlows, discountRatePerPeriod) {
  const flows = validateCashFlows(cashFlows);
  if (typeof discountRatePerPeriod !== 'number' || discountRatePerPeriod <= -1) {
    throw new Error('La tasa de descuento debe ser un número mayor a -1 (ej. 0.10 para 10%).');
  }
  const npv = flows.reduce(
    (acc, cashFlow, period) => acc + cashFlow / (1 + discountRatePerPeriod) ** period,
    0
  );
  return Number(npv.toFixed(6));
}

/**
 * Internal rate of return via Newton-Raphson with a bisection fallback,
 * both bounded and with a fixed iteration budget so the computation is
 * always deterministic and terminates. Returns null (not NaN, not 0)
 * when no sign change exists in the cash-flow series, i.e. IRR is
 * mathematically undefined for that scenario — this must be surfaced
 * to the user, not hidden behind a fabricated number.
 */
function internalRateOfReturn(cashFlows, { guess = 0.1, maxIterations = 100, tolerance = 1e-7 } = {}) {
  const flows = validateCashFlows(cashFlows);
  const hasPositive = flows.some((v) => v > 0);
  const hasNegative = flows.some((v) => v < 0);
  if (!hasPositive || !hasNegative) {
    return { irr: null, converged: false, reason: 'La serie de flujos de caja no cambia de signo; la TIR no está definida.' };
  }

  const npvAt = (rate) => netPresentValue(flows, rate);
  const derivativeAt = (rate) =>
    flows.reduce((acc, cashFlow, period) => (period === 0 ? acc : acc - period * cashFlow / (1 + rate) ** (period + 1)), 0);

  let rate = guess;
  for (let i = 0; i < maxIterations; i += 1) {
    const value = npvAt(rate);
    const derivative = derivativeAt(rate);
    if (derivative === 0) break;
    const nextRate = rate - value / derivative;
    if (Math.abs(nextRate - rate) < tolerance) {
      return { irr: Number(nextRate.toFixed(6)), converged: true, iterations: i + 1, method: 'newton-raphson' };
    }
    rate = nextRate;
  }

  // Fallback: bounded bisection over a wide, sane range.
  let low = -0.99;
  let high = 10;
  let lowValue = npvAt(low);
  const highValue = npvAt(high);
  if (Math.sign(lowValue) === Math.sign(highValue)) {
    return { irr: null, converged: false, reason: 'No fue posible acotar una raíz para la TIR en el rango [-99%, 1000%].' };
  }
  for (let i = 0; i < maxIterations; i += 1) {
    const mid = (low + high) / 2;
    const midValue = npvAt(mid);
    if (Math.abs(midValue) < tolerance) {
      return { irr: Number(mid.toFixed(6)), converged: true, iterations: i + 1, method: 'bisection' };
    }
    if (Math.sign(midValue) === Math.sign(lowValue)) {
      low = mid;
      lowValue = midValue;
    } else {
      high = mid;
    }
  }
  return { irr: Number(((low + high) / 2).toFixed(6)), converged: true, iterations: maxIterations, method: 'bisection' };
}

/**
 * Capitalization rate = Net Operating Income / Property Value.
 * Both inputs must be explicitly provided; this function never derives
 * NOI from an assumed rent-to-value ratio.
 */
function capRate(netOperatingIncome, propertyValue) {
  if (typeof propertyValue !== 'number' || propertyValue <= 0) {
    throw new Error('El valor de la propiedad debe ser un número positivo.');
  }
  if (typeof netOperatingIncome !== 'number') {
    throw new Error('El ingreso operativo neto (NOI) debe ser numérico.');
  }
  return Number(((netOperatingIncome / propertyValue) * 100).toFixed(4));
}

/**
 * Simple (undiscounted) payback period, expressed in periods (may be
 * fractional, interpolated within the period the cumulative flow turns
 * positive). Returns null if the investment is never recovered within
 * the provided horizon.
 */
function paybackPeriod(cashFlows) {
  const flows = validateCashFlows(cashFlows);
  let cumulative = flows[0];
  for (let period = 1; period < flows.length; period += 1) {
    const previousCumulative = cumulative;
    cumulative += flows[period];
    if (previousCumulative < 0 && cumulative >= 0) {
      const fraction = flows[period] === 0 ? 0 : Math.abs(previousCumulative) / flows[period];
      return Number((period - 1 + fraction).toFixed(4));
    }
  }
  return null;
}

/**
 * Discounted payback period: same idea as paybackPeriod, but on the
 * present-valued cash flows at the given discount rate.
 */
function discountedPaybackPeriod(cashFlows, discountRatePerPeriod) {
  const flows = validateCashFlows(cashFlows);
  const discounted = flows.map((cashFlow, period) => cashFlow / (1 + discountRatePerPeriod) ** period);
  return paybackPeriod(discounted);
}

/**
 * Discounted cash flow valuation: present value of explicit projected
 * cash flows plus an optional terminal value (already a present-day
 * amount at the end of the horizon, discounted back to period 0).
 * `terminalValue` must be supplied by the caller (e.g. from a
 * Gordon-growth or exit-multiple assumption) — this function does not
 * invent one.
 */
function discountedCashFlowValue(projectedCashFlows, discountRatePerPeriod, terminalValue = 0) {
  if (!Array.isArray(projectedCashFlows) || projectedCashFlows.length === 0) {
    throw new Error('Se requiere al menos un flujo de caja proyectado.');
  }
  const numeric = projectedCashFlows.map((v) => Number(v));
  if (numeric.some((v) => Number.isNaN(v))) {
    throw new Error('Todos los flujos de caja proyectados deben ser numéricos.');
  }
  const horizon = numeric.length;
  const presentValueOfFlows = numeric.reduce(
    (acc, cashFlow, index) => acc + cashFlow / (1 + discountRatePerPeriod) ** (index + 1),
    0
  );
  const presentValueOfTerminal = terminalValue / (1 + discountRatePerPeriod) ** horizon;
  return {
    presentValueOfFlows: Number(presentValueOfFlows.toFixed(6)),
    presentValueOfTerminal: Number(presentValueOfTerminal.toFixed(6)),
    totalValue: Number((presentValueOfFlows + presentValueOfTerminal).toFixed(6)),
  };
}

module.exports = {
  ALGORITHM_VERSION,
  netPresentValue,
  internalRateOfReturn,
  capRate,
  paybackPeriod,
  discountedPaybackPeriod,
  discountedCashFlowValue,
};
