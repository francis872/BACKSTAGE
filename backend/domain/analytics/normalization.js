/**
 * BACKSTAGE Analytics Core — Normalization & scaling primitives.
 *
 * Pure, deterministic, side-effect free functions used as building blocks
 * by the multicriteria decision engine (see ./multicriteria.js) and any
 * other module that needs to bring heterogeneous variables onto a common
 * scale before comparing or combining them.
 *
 * Every function documents its behaviour on degenerate inputs (empty
 * arrays, constant arrays) explicitly instead of silently returning NaN
 * or zero, per the project's "no silent defaults" rule.
 */

const ALGORITHM_VERSION = '1.0.0';

function assertNonEmpty(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label}: se requiere un arreglo no vacío de valores numéricos.`);
  }
}

function toNumbers(values, label) {
  const numeric = values.map((v) => Number(v));
  if (numeric.some((v) => Number.isNaN(v))) {
    throw new Error(`${label}: todos los valores deben ser numéricos.`);
  }
  return numeric;
}

/**
 * Min-max normalization to the [0, 1] range.
 * If every value is identical (constant series), there is no basis to
 * rank them: returns 1 for every element (benefit) or 0 for cost, and
 * flags `constant: true` so callers can surface this explicitly instead
 * of pretending a meaningful ranking exists.
 */
function minMax(values, { direction = 'benefit' } = {}) {
  assertNonEmpty(values, 'minMax');
  const numeric = toNumbers(values, 'minMax');
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const isConstant = max === min;

  if (isConstant) {
    const flat = direction === 'benefit' ? 1 : 0;
    return { values: numeric.map(() => flat), constant: true, min, max };
  }

  const normalized = numeric.map((v) => {
    const scaled = (v - min) / (max - min);
    return direction === 'benefit' ? scaled : 1 - scaled;
  });
  return { values: normalized, constant: false, min, max };
}

/**
 * Z-score standardization: (x - mean) / stdDev (population stddev).
 * If stdDev is 0 (constant series), returns 0 for every element and
 * flags `constant: true` instead of dividing by zero.
 */
function zScore(values) {
  assertNonEmpty(values, 'zScore');
  const numeric = toNumbers(values, 'zScore');
  const mean = numeric.reduce((acc, v) => acc + v, 0) / numeric.length;
  const variance = numeric.reduce((acc, v) => acc + (v - mean) ** 2, 0) / numeric.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return { values: numeric.map(() => 0), constant: true, mean, stdDev };
  }
  return { values: numeric.map((v) => (v - mean) / stdDev), constant: false, mean, stdDev };
}

function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantile(sortedValues, q) {
  if (sortedValues.length === 1) return sortedValues[0];
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedValues[base + 1] !== undefined) {
    return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
  }
  return sortedValues[base];
}

/**
 * Robust scaling using median and interquartile range (IQR = Q3 - Q1).
 * Less sensitive to outliers than min-max or z-score. If IQR is 0,
 * returns 0 for every element and flags `constant: true`.
 */
function robustScale(values) {
  assertNonEmpty(values, 'robustScale');
  const numeric = toNumbers(values, 'robustScale');
  const sorted = [...numeric].sort((a, b) => a - b);
  const med = median(sorted);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;

  if (iqr === 0) {
    return { values: numeric.map(() => 0), constant: true, median: med, iqr };
  }
  return { values: numeric.map((v) => (v - med) / iqr), constant: false, median: med, iqr };
}

/**
 * Natural log transform. Only valid for strictly positive variables
 * (e.g. price per m², population). Throws explicitly instead of
 * returning NaN/-Infinity for zero or negative values, since applying
 * a log transform to such variables is a modelling error, not an
 * implementation detail to hide.
 */
function logTransform(values) {
  assertNonEmpty(values, 'logTransform');
  const numeric = toNumbers(values, 'logTransform');
  const invalid = numeric.some((v) => v <= 0);
  if (invalid) {
    throw new Error(
      'logTransform: la transformación logarítmica solo es válida para valores estrictamente positivos.'
    );
  }
  return { values: numeric.map((v) => Math.log(v)) };
}

/**
 * Winsorization: clips values outside the [lowerPct, upperPct] quantiles
 * to the quantile boundary, reducing the influence of extreme outliers
 * while keeping every observation. The applied bounds are always
 * returned so the transformation is never hidden from the caller.
 */
function winsorize(values, { lowerPct = 0.05, upperPct = 0.95 } = {}) {
  assertNonEmpty(values, 'winsorize');
  if (lowerPct < 0 || upperPct > 1 || lowerPct >= upperPct) {
    throw new Error('winsorize: lowerPct/upperPct deben cumplir 0 <= lowerPct < upperPct <= 1.');
  }
  const numeric = toNumbers(values, 'winsorize');
  const sorted = [...numeric].sort((a, b) => a - b);
  const lowerBound = quantile(sorted, lowerPct);
  const upperBound = quantile(sorted, upperPct);
  const clipped = numeric.map((v) => Math.min(Math.max(v, lowerBound), upperBound));
  return { values: clipped, lowerBound, upperBound };
}

module.exports = {
  ALGORITHM_VERSION,
  minMax,
  zScore,
  robustScale,
  logTransform,
  winsorize,
  quantile,
  median,
};
