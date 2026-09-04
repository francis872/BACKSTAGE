/**
 * BACKSTAGE Analytics Core — Algorithm registry.
 *
 * Closed catalog of the algorithms that can be executed through the
 * analytics API. This is deliberately a static, code-reviewed list (not
 * a dynamic/arbitrary formula submitted by a client) so that execution
 * is always bounded to known, tested, versioned implementations —
 * see docs/analytics/ALGORITHM_CATALOG.md for the full narrative
 * description of each entry (purpose, inputs, outputs, assumptions).
 */

const multicriteria = require('../../domain/analytics/multicriteria');
const financial = require('../../domain/analytics/financial');
const risk = require('../../domain/analytics/risk');

const ALGORITHMS = {
  'multicriteria.weighted_sum': {
    version: multicriteria.ALGORITHM_VERSION,
    category: 'multicriteria',
    purpose: 'Ranking multicriterio por suma ponderada simple sobre criterios normalizados min-max.',
    run: (params) => multicriteria.weightedSum(params.alternatives, params.weights, { directions: params.directions }),
  },
  'multicriteria.topsis': {
    version: multicriteria.ALGORITHM_VERSION,
    category: 'multicriteria',
    purpose: 'Ranking multicriterio por cercanía a la solución ideal (TOPSIS) con normalización vectorial.',
    run: (params) => multicriteria.topsis(params.alternatives, params.weights, { directions: params.directions }),
  },
  'multicriteria.ahp_weights': {
    version: multicriteria.ALGORITHM_VERSION,
    category: 'multicriteria',
    purpose: 'Derivación de pesos de criterios a partir de una matriz de comparación por pares (AHP), con razón de consistencia.',
    run: (params) => multicriteria.ahpWeights(params.pairwiseMatrix, params.criteriaKeys),
  },
  'multicriteria.sensitivity': {
    version: multicriteria.ALGORITHM_VERSION,
    category: 'multicriteria',
    purpose: 'Análisis de sensibilidad de un ranking multicriterio ante variaciones en los pesos de los criterios.',
    run: (params) => multicriteria.sensitivityAnalysis(params.alternatives, params.weights, {
      directions: params.directions, method: params.method, perturbationPct: params.perturbationPct,
    }),
  },
  'financial.npv_irr': {
    version: financial.ALGORITHM_VERSION,
    category: 'financial',
    purpose: 'Valor presente neto y tasa interna de retorno de una serie de flujos de caja proporcionada por el usuario.',
    run: (params) => ({
      npv: financial.netPresentValue(params.cashFlows, params.discountRate),
      irr: financial.internalRateOfReturn(params.cashFlows),
    }),
  },
  'financial.cap_rate': {
    version: financial.ALGORITHM_VERSION,
    category: 'financial',
    purpose: 'Tasa de capitalización (cap rate) = ingreso operativo neto / valor de la propiedad.',
    run: (params) => ({ capRate: financial.capRate(params.netOperatingIncome, params.propertyValue) }),
  },
  'financial.payback': {
    version: financial.ALGORITHM_VERSION,
    category: 'financial',
    purpose: 'Periodo de recuperación simple y descontado de una inversión.',
    run: (params) => ({
      simple: financial.paybackPeriod(params.cashFlows),
      discounted: params.discountRate != null
        ? financial.discountedPaybackPeriod(params.cashFlows, params.discountRate)
        : null,
    }),
  },
  'financial.dcf': {
    version: financial.ALGORITHM_VERSION,
    category: 'financial',
    purpose: 'Valoración por flujo de caja descontado con valor terminal explícito.',
    run: (params) => financial.discountedCashFlowValue(params.projectedCashFlows, params.discountRate, params.terminalValue),
  },
  'risk.components': {
    version: risk.ALGORITHM_VERSION,
    category: 'risk',
    purpose: 'Riesgo como función explícita de amenaza x exposición x vulnerabilidad.',
    run: (params) => risk.riskFromComponents(params),
  },
  'risk.monte_carlo': {
    version: risk.ALGORITHM_VERSION,
    category: 'risk',
    purpose: 'Simulación Monte Carlo de escenarios de riesgo/pérdida con semilla reproducible y percentiles P5/P50/P95.',
    run: (params) => {
      const factorKeys = Object.keys(params.factors);
      // Sum of sampled factors as the default combine function unless
      // the caller specifies weighted factor contributions.
      const combine = (sample) => factorKeys.reduce(
        (acc, key) => acc + sample[key] * (params.factorWeights?.[key] ?? 1),
        0
      );
      return risk.monteCarloSimulate({
        factors: params.factors, combine, iterations: params.iterations, seed: params.seed,
      });
    },
  },
  'risk.stress_test': {
    version: risk.ALGORITHM_VERSION,
    category: 'risk',
    purpose: 'Pruebas de estrés sobre componentes de riesgo base con escenarios de multiplicadores.',
    run: (params) => risk.stressTest(params.baseComponents, params.scenarios),
  },
  'risk.geographic_concentration': {
    version: risk.ALGORITHM_VERSION,
    category: 'risk',
    purpose: 'Índice de concentración geográfica de un portafolio (Herfindahl-Hirschman).',
    run: (params) => risk.geographicConcentration(params.items),
  },
};

function getAlgorithm(name) {
  const algorithm = ALGORITHMS[name];
  if (!algorithm) {
    const available = Object.keys(ALGORITHMS).join(', ');
    throw new Error(`Algoritmo desconocido: "${name}". Disponibles: ${available}.`);
  }
  return algorithm;
}

function listAlgorithms() {
  return Object.entries(ALGORITHMS).map(([name, algorithm]) => ({
    name,
    version: algorithm.version,
    category: algorithm.category,
    purpose: algorithm.purpose,
  }));
}

module.exports = { ALGORITHMS, getAlgorithm, listAlgorithms };
