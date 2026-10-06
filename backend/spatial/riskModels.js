const MODEL_VERSION = 'backstage-risk-v1';

function unit(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new TypeError(`${name} debe estar entre 0 y 1.`);
  return number;
}

function weightedModel(inputs, definition) {
  const contributions = {};
  let score = 0;
  for (const [name, config] of Object.entries(definition)) {
    const raw = unit(inputs[name], name);
    const normalized = config.invert ? 1 - raw : raw;
    contributions[name] = { input: raw, normalized, weight: config.weight, contribution: normalized * config.weight };
    score += contributions[name].contribution;
  }
  return { score: Math.max(0, Math.min(1, score)), contributions };
}

function classify(score) {
  if (score < 0.2) return 'very_low';
  if (score < 0.4) return 'low';
  if (score < 0.6) return 'moderate';
  if (score < 0.8) return 'high';
  return 'critical';
}

const DEFINITIONS = Object.freeze({
  wildfire: {
    dryness: { weight: 0.25 }, temperature: { weight: 0.15 }, wind: { weight: 0.15 },
    vegetationFuel: { weight: 0.20 }, slope: { weight: 0.10 }, humidity: { weight: 0.15, invert: true },
  },
  flood: {
    rainfall: { weight: 0.25 }, drainageDeficit: { weight: 0.20 }, riverProximity: { weight: 0.15 },
    impermeability: { weight: 0.15 }, soilSaturation: { weight: 0.15 }, relativeElevation: { weight: 0.10, invert: true },
  },
  landslide: {
    slope: { weight: 0.25 }, rainfall: { weight: 0.20 }, soilSaturation: { weight: 0.20 },
    geologySusceptibility: { weight: 0.15 }, vegetationLoss: { weight: 0.10 }, seismicity: { weight: 0.10 },
  },
});

function evaluateRisk(input = {}) {
  const dataMode = input.dataMode || 'declared';
  if (!['measured', 'derived', 'declared', 'procedural'].includes(dataMode)) throw new TypeError('dataMode no es válido.');
  const results = {};
  for (const [hazard, definition] of Object.entries(DEFINITIONS)) {
    if (!input[hazard]) continue;
    const evaluated = weightedModel(input[hazard], definition);
    results[hazard] = { ...evaluated, classification: classify(evaluated.score) };
  }
  if (!Object.keys(results).length) throw new TypeError('Se requiere al menos un conjunto wildfire, flood o landslide.');
  const scores = Object.values(results).map((result) => result.score);
  const combinedScore = 1 - scores.reduce((product, score) => product * (1 - score), 1);
  const confidence = input.confidence == null ? null : unit(input.confidence, 'confidence');
  return {
    modelVersion: MODEL_VERSION,
    dataMode,
    evaluatedAt: new Date().toISOString(),
    hazards: results,
    combined: { score: combinedScore, classification: classify(combinedScore) },
    confidence,
    context: input.context || null,
    advisory: 'Índice de priorización, no pronóstico ni sustituto de evaluación técnica en campo.',
  };
}

module.exports = { MODEL_VERSION, DEFINITIONS, classify, weightedModel, evaluateRisk };
