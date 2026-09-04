/**
 * BACKSTAGE Analytics Core — Risk analytics.
 *
 * Implements risk as an explicit function of threat, exposure and
 * vulnerability (not an opaque "risk score"), probability x impact
 * matrices, expected loss, Monte Carlo simulation with a reproducible
 * seeded random generator, and portfolio geographic concentration.
 */

const { quantile } = require('./normalization');

const ALGORITHM_VERSION = '1.0.0';

function assertUnitInterval(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error(`${label} debe ser un número entre 0 y 1.`);
  }
}

/**
 * Risk = Threat x Exposure x Vulnerability, the standard disaster-risk
 * decomposition. Each factor must be provided in [0, 1]; this makes
 * explicit which of the three drivers is responsible for a high risk
 * value instead of collapsing everything into a single unexplained
 * number.
 */
function riskFromComponents({ threat, exposure, vulnerability }) {
  assertUnitInterval(threat, 'threat');
  assertUnitInterval(exposure, 'exposure');
  assertUnitInterval(vulnerability, 'vulnerability');
  const risk = threat * exposure * vulnerability;
  return {
    threat,
    exposure,
    vulnerability,
    risk: Number(risk.toFixed(6)),
  };
}

/**
 * Expected loss = probability of occurrence x cost/impact if it occurs.
 * Both must be supplied explicitly (probability in [0,1], cost in the
 * caller's chosen currency/unit).
 */
function expectedLoss(probability, impactCost) {
  assertUnitInterval(probability, 'probability');
  if (typeof impactCost !== 'number' || Number.isNaN(impactCost)) {
    throw new Error('impactCost debe ser numérico.');
  }
  return Number((probability * impactCost).toFixed(6));
}

/**
 * Classifies a (probability, impact) pair against a configurable
 * probability/impact matrix. Bands must be provided in ascending order
 * and covering [0,1] for probability, and ascending cost thresholds for
 * impact; otherwise throws instead of guessing a classification.
 */
function classifyProbabilityImpact(probability, impactCost, {
  probabilityBands = [
    { max: 0.2, label: 'baja' },
    { max: 0.5, label: 'media' },
    { max: 0.8, label: 'alta' },
    { max: 1, label: 'muy alta' },
  ],
  impactBands = [
    { max: 10000, label: 'menor' },
    { max: 100000, label: 'moderado' },
    { max: 1000000, label: 'mayor' },
    { max: Infinity, label: 'severo' },
  ],
} = {}) {
  assertUnitInterval(probability, 'probability');
  const probabilityLabel = probabilityBands.find((band) => probability <= band.max)?.label;
  const impactLabel = impactBands.find((band) => impactCost <= band.max)?.label;
  if (!probabilityLabel || !impactLabel) {
    throw new Error('No fue posible clasificar probabilidad/impacto con las bandas provistas.');
  }
  return { probabilityLabel, impactLabel, probability, impactCost };
}

/**
 * Deterministic, seedable pseudo-random generator (mulberry32).
 * Needed because JavaScript's Math.random() cannot be seeded, and the
 * project requires Monte Carlo runs to be reproducible given the same
 * seed and parameters.
 */
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller transform to turn two uniform(0,1) draws into a standard
// normal draw, using the seeded generator above (so normal draws are
// reproducible too, not just uniform ones).
function normalDraw(random) {
  let u1 = 0;
  let u2 = 0;
  while (u1 === 0) u1 = random();
  while (u2 === 0) u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Monte Carlo simulation over a set of independent risk factors, each
 * modelled as normal(mean, stdDev). `combine(sample)` receives one
 * sampled value per factor (by name) and must return the simulated
 * outcome for that iteration (e.g. total portfolio loss). Returns the
 * full percentile summary (P5/P50/P95) plus mean/stdDev, the seed used
 * (for reproducibility) and iteration count.
 */
function monteCarloSimulate({ factors, combine, iterations = 10000, seed = 42 }) {
  if (!factors || typeof factors !== 'object' || Object.keys(factors).length === 0) {
    throw new Error('Se requiere al menos un factor de riesgo con distribución (mean, stdDev).');
  }
  if (typeof combine !== 'function') {
    throw new Error('Se requiere una función combine(sample) que calcule el resultado simulado.');
  }
  if (!Number.isInteger(iterations) || iterations < 100 || iterations > 200000) {
    throw new Error('iterations debe ser un entero entre 100 y 200000 (límite de recursos).');
  }
  Object.entries(factors).forEach(([name, dist]) => {
    if (typeof dist.mean !== 'number' || typeof dist.stdDev !== 'number' || dist.stdDev < 0) {
      throw new Error(`Factor "${name}" inválido: se requiere {mean, stdDev >= 0}.`);
    }
  });

  const random = mulberry32(seed);
  const factorNames = Object.keys(factors);
  const outcomes = new Array(iterations);

  for (let i = 0; i < iterations; i += 1) {
    const sample = {};
    factorNames.forEach((name) => {
      const { mean, stdDev } = factors[name];
      sample[name] = stdDev === 0 ? mean : mean + stdDev * normalDraw(random);
    });
    outcomes[i] = combine(sample);
  }

  const sorted = [...outcomes].sort((a, b) => a - b);
  const mean = outcomes.reduce((acc, v) => acc + v, 0) / iterations;
  const variance = outcomes.reduce((acc, v) => acc + (v - mean) ** 2, 0) / iterations;

  return {
    iterations,
    seed,
    mean: Number(mean.toFixed(4)),
    stdDev: Number(Math.sqrt(variance).toFixed(4)),
    p5: Number(quantile(sorted, 0.05).toFixed(4)),
    p50: Number(quantile(sorted, 0.5).toFixed(4)),
    p95: Number(quantile(sorted, 0.95).toFixed(4)),
    min: Number(sorted[0].toFixed(4)),
    max: Number(sorted[sorted.length - 1].toFixed(4)),
  };
}

/**
 * Stress testing: applies named scenario multipliers to a set of base
 * risk components and reports the resulting risk value per scenario,
 * so the caller sees exactly which lever moved and by how much,
 * instead of an unexplained "high risk" flag.
 */
function stressTest(baseComponents, scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new Error('Se requiere al menos un escenario de estrés (nombre + multiplicadores).');
  }
  return scenarios.map((scenario) => {
    const stressed = {
      threat: Math.min(1, baseComponents.threat * (scenario.threatMultiplier ?? 1)),
      exposure: Math.min(1, baseComponents.exposure * (scenario.exposureMultiplier ?? 1)),
      vulnerability: Math.min(1, baseComponents.vulnerability * (scenario.vulnerabilityMultiplier ?? 1)),
    };
    const result = riskFromComponents(stressed);
    return { scenario: scenario.name, ...result };
  });
}

/**
 * Herfindahl-Hirschman-style geographic concentration index for a
 * portfolio: sum of squared value-shares per group (e.g. city/zone).
 * Ranges from 1/n (perfectly diversified across n groups) to 1 (fully
 * concentrated in a single group). Requires explicit group + value per
 * item; never infers geography.
 */
function geographicConcentration(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Se requiere al menos un activo con {group, value}.');
  }
  const totals = new Map();
  let grandTotal = 0;
  items.forEach(({ group, value }) => {
    if (!group || typeof value !== 'number' || value < 0) {
      throw new Error('Cada activo requiere {group: string, value: number >= 0}.');
    }
    totals.set(group, (totals.get(group) || 0) + value);
    grandTotal += value;
  });
  if (grandTotal === 0) {
    throw new Error('El valor total del portafolio no puede ser cero.');
  }
  const shares = [...totals.entries()].map(([group, value]) => ({
    group,
    value,
    share: Number((value / grandTotal).toFixed(6)),
  }));
  const hhi = shares.reduce((acc, s) => acc + s.share ** 2, 0);
  return {
    shares: shares.sort((a, b) => b.share - a.share),
    herfindahlIndex: Number(hhi.toFixed(6)),
    groupCount: shares.length,
    minPossibleIndex: Number((1 / shares.length).toFixed(6)),
  };
}

module.exports = {
  ALGORITHM_VERSION,
  riskFromComponents,
  expectedLoss,
  classifyProbabilityImpact,
  monteCarloSimulate,
  stressTest,
  geographicConcentration,
  mulberry32,
};
