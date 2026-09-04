/**
 * BACKSTAGE Analytics Core — Multicriteria decision analysis.
 *
 * Implements the algorithms used to rank territorial/portfolio
 * alternatives against multiple, possibly conflicting, criteria:
 *   - Weighted sum (simple additive weighting)
 *   - TOPSIS (Technique for Order Preference by Similarity to Ideal Solution)
 *   - AHP (Analytic Hierarchy Process) for deriving weights from pairwise
 *     comparisons, including its consistency ratio check
 *   - Weight sensitivity analysis
 *
 * All functions are pure and deterministic: the same inputs always
 * produce the same outputs, which is what makes an execution
 * reproducible and worth recording as an analytics_jobs row.
 */

const { minMax } = require('./normalization');

const ALGORITHM_VERSION = '1.0.0';

// Random Index table for AHP consistency ratio (Saaty, 1980), indexed by
// matrix size (n). n=1,2 have no meaningful inconsistency (RI = 0).
const AHP_RANDOM_INDEX = {
  1: 0, 2: 0, 3: 0.58, 4: 0.9, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49,
};

function validateAlternatives(alternatives) {
  if (!Array.isArray(alternatives) || alternatives.length === 0) {
    throw new Error('Se requiere al menos una alternativa (candidato) para evaluar.');
  }
  alternatives.forEach((alt, index) => {
    if (!alt || typeof alt !== 'object' || !alt.criteria || typeof alt.criteria !== 'object') {
      throw new Error(`Alternativa en posición ${index} inválida: falta "criteria" (objeto criterio->valor).`);
    }
  });
}

function extractCriteriaKeys(alternatives) {
  const keys = Object.keys(alternatives[0].criteria);
  alternatives.forEach((alt, index) => {
    const altKeys = Object.keys(alt.criteria);
    if (altKeys.length !== keys.length || !keys.every((k) => altKeys.includes(k))) {
      throw new Error(
        `Alternativa en posición ${index} tiene criterios distintos a la primera alternativa. ` +
        'Todas las alternativas deben tener exactamente el mismo conjunto de criterios.'
      );
    }
  });
  return keys;
}

/**
 * Validates and normalizes a weights map so it sums to exactly 1
 * (within floating point tolerance). Throws on missing/negative weights
 * instead of silently defaulting to equal weighting.
 */
function normalizeWeights(weights, criteriaKeys) {
  if (!weights || typeof weights !== 'object') {
    throw new Error('Se requiere un objeto de pesos (criterio -> peso numérico).');
  }
  const missing = criteriaKeys.filter((k) => !(k in weights));
  if (missing.length > 0) {
    throw new Error(`Faltan pesos para los criterios: ${missing.join(', ')}.`);
  }
  const values = criteriaKeys.map((k) => Number(weights[k]));
  if (values.some((v) => Number.isNaN(v) || v < 0)) {
    throw new Error('Todos los pesos deben ser números no negativos.');
  }
  const total = values.reduce((acc, v) => acc + v, 0);
  if (total === 0) {
    throw new Error('La suma de los pesos no puede ser cero.');
  }
  const normalized = {};
  criteriaKeys.forEach((k, i) => {
    normalized[k] = values[i] / total;
  });
  return normalized;
}

function directionOf(directions, key) {
  const direction = directions?.[key] || 'benefit';
  if (direction !== 'benefit' && direction !== 'cost') {
    throw new Error(`Dirección inválida para criterio "${key}": use "benefit" o "cost".`);
  }
  return direction;
}

/**
 * Simple additive weighted sum. Missing values for a criterion are
 * treated as an explicit error (not silently replaced by 0), per the
 * requirement to never hide missing data.
 */
function weightedSum(alternatives, weights, { directions = {} } = {}) {
  validateAlternatives(alternatives);
  const criteriaKeys = extractCriteriaKeys(alternatives);
  const normalizedWeights = normalizeWeights(weights, criteriaKeys);

  const perCriterionNormalized = {};
  criteriaKeys.forEach((key) => {
    const rawValues = alternatives.map((alt) => alt.criteria[key]);
    if (rawValues.some((v) => v === null || v === undefined)) {
      throw new Error(`El criterio "${key}" tiene valores faltantes. Complétalos o excluye la alternativa.`);
    }
    perCriterionNormalized[key] = minMax(rawValues, { direction: directionOf(directions, key) });
  });

  const scores = alternatives.map((alt, altIndex) => {
    const byDimension = {};
    let total = 0;
    criteriaKeys.forEach((key) => {
      const normalizedValue = perCriterionNormalized[key].values[altIndex];
      const contribution = normalizedValue * normalizedWeights[key];
      byDimension[key] = Number((normalizedValue * 100).toFixed(2));
      total += contribution;
    });
    return {
      name: alt.name,
      scoreTotal: Number((total * 100).toFixed(2)),
      scoreByDimension: byDimension,
    };
  });

  const ranked = scores
    .slice()
    .sort((a, b) => b.scoreTotal - a.scoreTotal)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    method: 'weighted_sum',
    version: ALGORITHM_VERSION,
    weights: normalizedWeights,
    ranking: ranked,
  };
}

/**
 * TOPSIS: ranks alternatives by their geometric closeness to an ideal
 * solution (best value per criterion) relative to a negative-ideal
 * solution (worst value per criterion), using vector-normalized,
 * weighted criteria distances.
 */
function topsis(alternatives, weights, { directions = {} } = {}) {
  validateAlternatives(alternatives);
  const criteriaKeys = extractCriteriaKeys(alternatives);
  const normalizedWeights = normalizeWeights(weights, criteriaKeys);
  const n = alternatives.length;

  // Vector normalization (standard TOPSIS step): r_ij = x_ij / sqrt(sum(x_ij^2))
  const columnVectors = {};
  criteriaKeys.forEach((key) => {
    const rawValues = alternatives.map((alt) => alt.criteria[key]);
    if (rawValues.some((v) => v === null || v === undefined)) {
      throw new Error(`El criterio "${key}" tiene valores faltantes. Complétalos o excluye la alternativa.`);
    }
    const numeric = rawValues.map((v) => Number(v));
    const denom = Math.sqrt(numeric.reduce((acc, v) => acc + v * v, 0));
    columnVectors[key] = denom === 0 ? numeric.map(() => 0) : numeric.map((v) => v / denom);
  });

  // Weighted normalized matrix
  const weighted = {};
  criteriaKeys.forEach((key) => {
    weighted[key] = columnVectors[key].map((v) => v * normalizedWeights[key]);
  });

  // Ideal (A+) and negative-ideal (A-) solutions per criterion direction
  const ideal = {};
  const antiIdeal = {};
  criteriaKeys.forEach((key) => {
    const direction = directionOf(directions, key);
    const values = weighted[key];
    const best = direction === 'benefit' ? Math.max(...values) : Math.min(...values);
    const worst = direction === 'benefit' ? Math.min(...values) : Math.max(...values);
    ideal[key] = best;
    antiIdeal[key] = worst;
  });

  const rows = [];
  for (let i = 0; i < n; i += 1) {
    let distToIdeal = 0;
    let distToAnti = 0;
    const byDimension = {};
    criteriaKeys.forEach((key) => {
      const v = weighted[key][i];
      distToIdeal += (v - ideal[key]) ** 2;
      distToAnti += (v - antiIdeal[key]) ** 2;
      byDimension[key] = Number((v * 100).toFixed(4));
    });
    distToIdeal = Math.sqrt(distToIdeal);
    distToAnti = Math.sqrt(distToAnti);
    const denom = distToIdeal + distToAnti;
    const closeness = denom === 0 ? 0 : distToAnti / denom;
    rows.push({
      name: alternatives[i].name,
      scoreTotal: Number((closeness * 100).toFixed(2)),
      scoreByDimension: byDimension,
      distanceToIdeal: Number(distToIdeal.toFixed(6)),
      distanceToAntiIdeal: Number(distToAnti.toFixed(6)),
    });
  }

  const ranked = rows
    .slice()
    .sort((a, b) => b.scoreTotal - a.scoreTotal)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    method: 'topsis',
    version: ALGORITHM_VERSION,
    weights: normalizedWeights,
    idealSolution: ideal,
    antiIdealSolution: antiIdeal,
    ranking: ranked,
  };
}

/**
 * AHP: derives criteria weights from a pairwise comparison matrix using
 * the normalized-column-average method, and reports the consistency
 * ratio (CR). A CR above 0.10 signals the pairwise judgments are
 * inconsistent enough that the derived weights should not be trusted
 * without revising the comparisons (Saaty's standard threshold).
 */
function ahpWeights(pairwiseMatrix, criteriaKeys) {
  const n = criteriaKeys.length;
  if (!Array.isArray(pairwiseMatrix) || pairwiseMatrix.length !== n) {
    throw new Error(`La matriz de comparación por pares debe ser de ${n}x${n} (una fila/columna por criterio).`);
  }
  pairwiseMatrix.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== n) {
      throw new Error(`La fila ${i} de la matriz de comparación por pares debe tener ${n} valores.`);
    }
    row.forEach((value) => {
      if (typeof value !== 'number' || value <= 0) {
        throw new Error('Todos los valores de la matriz de comparación por pares deben ser números positivos.');
      }
    });
  });

  // 1) Normalize each column (divide by column sum)
  const columnSums = Array.from({ length: n }, (_, j) =>
    pairwiseMatrix.reduce((acc, row) => acc + row[j], 0)
  );
  const normalizedMatrix = pairwiseMatrix.map((row) => row.map((value, j) => value / columnSums[j]));

  // 2) Average each row of the normalized matrix -> priority vector (weights)
  const weightsVector = normalizedMatrix.map((row) => row.reduce((acc, v) => acc + v, 0) / n);

  // 3) Consistency check: weighted sum vector, lambda_max, CI, CR
  const weightedSumVector = pairwiseMatrix.map((row) =>
    row.reduce((acc, value, j) => acc + value * weightsVector[j], 0)
  );
  const consistencyVector = weightedSumVector.map((v, i) => v / weightsVector[i]);
  const lambdaMax = consistencyVector.reduce((acc, v) => acc + v, 0) / n;
  const consistencyIndex = n > 2 ? (lambdaMax - n) / (n - 1) : 0;
  const randomIndex = AHP_RANDOM_INDEX[n] ?? AHP_RANDOM_INDEX[10];
  const consistencyRatio = randomIndex === 0 ? 0 : consistencyIndex / randomIndex;

  const weights = {};
  criteriaKeys.forEach((key, i) => {
    weights[key] = Number(weightsVector[i].toFixed(6));
  });

  return {
    method: 'ahp',
    version: ALGORITHM_VERSION,
    weights,
    lambdaMax: Number(lambdaMax.toFixed(6)),
    consistencyIndex: Number(consistencyIndex.toFixed(6)),
    consistencyRatio: Number(consistencyRatio.toFixed(6)),
    isConsistent: consistencyRatio <= 0.1,
    consistencyThreshold: 0.1,
  };
}

/**
 * Weight sensitivity analysis: for each criterion, perturbs its weight
 * by +/- `perturbationPct` (renormalizing the remaining weights
 * proportionally so they still sum to 1) and re-runs the ranking
 * method, reporting whether the top-ranked alternative changes and by
 * how much the winner's score moves. This lets the UI explain *why* a
 * candidate won and how fragile that result is to the weighting
 * scheme, instead of presenting a single opaque ranking.
 */
function sensitivityAnalysis(alternatives, weights, {
  directions = {},
  method = 'topsis',
  perturbationPct = 0.1,
} = {}) {
  validateAlternatives(alternatives);
  const criteriaKeys = extractCriteriaKeys(alternatives);
  const baseWeights = normalizeWeights(weights, criteriaKeys);
  const rank = method === 'weighted_sum' ? weightedSum : topsis;

  const baseResult = rank(alternatives, baseWeights, { directions });
  const baseWinner = baseResult.ranking[0].name;

  const scenarios = [];
  criteriaKeys.forEach((key) => {
    [1 + perturbationPct, 1 - perturbationPct].forEach((factor) => {
      const perturbed = { ...baseWeights };
      const original = perturbed[key];
      const adjusted = Math.max(0, original * factor);
      const others = criteriaKeys.filter((k) => k !== key);
      const othersOriginalSum = others.reduce((acc, k) => acc + perturbed[k], 0);
      const remaining = 1 - adjusted;
      others.forEach((k) => {
        perturbed[k] = othersOriginalSum === 0 ? remaining / others.length : (perturbed[k] / othersOriginalSum) * remaining;
      });
      perturbed[key] = adjusted;

      const result = rank(alternatives, perturbed, { directions });
      const winner = result.ranking[0].name;
      scenarios.push({
        criterion: key,
        weightChange: factor > 1 ? `+${Math.round(perturbationPct * 100)}%` : `-${Math.round(perturbationPct * 100)}%`,
        winner,
        winnerChanged: winner !== baseWinner,
        winnerScore: result.ranking[0].scoreTotal,
      });
    });
  });

  const changedScenarios = scenarios.filter((s) => s.winnerChanged).length;

  return {
    baseWinner,
    baseWeights,
    perturbationPct,
    scenarios,
    stability: {
      totalScenarios: scenarios.length,
      changedScenarios,
      stable: changedScenarios === 0,
    },
  };
}

module.exports = {
  ALGORITHM_VERSION,
  AHP_RANDOM_INDEX,
  weightedSum,
  topsis,
  ahpWeights,
  sensitivityAnalysis,
  normalizeWeights,
};
