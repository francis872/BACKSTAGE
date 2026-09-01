// EarthArt: motor de inteligencia territorial (índice territorial, detector de brechas y simulaciones).
const { query } = require('./db');

const DIMENSIONS = ['education', 'health', 'infrastructure', 'economy', 'environment', 'security', 'connectivity', 'housing', 'services'];
const DIMENSION_WEIGHT = 100 / DIMENSIONS.length;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function loadLatestDimensionScores(unitId) {
  const result = await query(
    `SELECT DISTINCT ON (dimension) dimension, score, measured_at, details
     FROM territorial_dimension_scores
     WHERE unit_id = $1
     ORDER BY dimension, measured_at DESC, score_id DESC`,
    [unitId]
  );
  return result.rows;
}

async function computeTerritorialIndex(unitId) {
  const scores = await loadLatestDimensionScores(unitId);
  const breakdown = {};
  DIMENSIONS.forEach((dimension) => {
    const row = scores.find((item) => item.dimension === dimension);
    breakdown[dimension] = row ? clamp(Number(row.score), 0, 100) : null;
  });

  const knownScores = Object.values(breakdown).filter((value) => value !== null);
  const compositeScore = knownScores.length
    ? clamp(Math.round((knownScores.reduce((sum, value) => sum + value, 0) / knownScores.length) * 100) / 100, 0, 100)
    : null;

  const insertResult = await query(
    `INSERT INTO territorial_index_snapshots (unit_id, composite_score, breakdown)
     VALUES ($1, $2, $3) RETURNING *`,
    [unitId, compositeScore, breakdown]
  );

  return {
    snapshot: insertResult.rows[0],
    breakdown,
    weightPerDimension: DIMENSION_WEIGHT,
  };
}

async function getLatestIndexSnapshot(unitId) {
  const result = await query(
    `SELECT * FROM territorial_index_snapshots WHERE unit_id = $1 ORDER BY computed_at DESC LIMIT 1`,
    [unitId]
  );
  return result.rows[0] || null;
}

async function loadUnit(unitId) {
  const result = await query('SELECT * FROM territorial_units WHERE unit_id = $1', [unitId]);
  return result.rows[0] || null;
}

async function loadNearestFacilityDistance(unitId, facilityType) {
  const result = await query(
    `SELECT tf.name, tf.capacity,
       ST_Distance(tu.geom::geography, tf.geom::geography) AS distance_m
     FROM territorial_units tu
     LEFT JOIN territorial_facilities tf ON tf.facility_type = $2 AND tf.geom IS NOT NULL
     WHERE tu.unit_id = $1 AND tu.geom IS NOT NULL
     ORDER BY distance_m ASC NULLS LAST
     LIMIT 1`,
    [unitId, facilityType]
  );
  return result.rows[0] || null;
}

// Reglas heurísticas de detección de brechas territoriales (población vs. infraestructura disponible).
async function detectGaps(unitId) {
  const unit = await loadUnit(unitId);
  if (!unit) return [];

  const detected = [];
  const population = Number(unit.population) || 0;
  const growth = Number(unit.population_growth_pct) || 0;
  const scores = await loadLatestDimensionScores(unitId);
  const scoreByDimension = {};
  scores.forEach((row) => {
    scoreByDimension[row.dimension] = Number(row.score);
  });

  // Regla 1: población alta pero colegio más cercano lejos (> 3 km).
  const nearestSchool = await loadNearestFacilityDistance(unitId, 'school');
  if (population > 1000 && nearestSchool && nearestSchool.distance_m != null) {
    const distanceKm = Number(nearestSchool.distance_m) / 1000;
    if (distanceKm > 3) {
      detected.push({
        gap_type: 'education_access',
        severity: distanceKm > 6 ? 'critical' : 'high',
        message: `En esta zona viven ${population.toLocaleString('es-CO')} personas, pero el colegio más cercano está a ${distanceKm.toFixed(1)} km.`,
        metric: { population, nearest_school_km: Number(distanceKm.toFixed(2)) },
      });
    }
  }

  // Regla 2: población creciendo rápido pero infraestructura estancada.
  if (growth > 10 && scoreByDimension.infrastructure != null && scoreByDimension.infrastructure < 55) {
    detected.push({
      gap_type: 'infrastructure_lag',
      severity: growth > 20 ? 'critical' : 'high',
      message: `La población creció ${growth.toFixed(1)}% recientemente, pero el índice de infraestructura es de solo ${scoreByDimension.infrastructure.toFixed(0)}/100.`,
      metric: { population_growth_pct: growth, infrastructure_score: scoreByDimension.infrastructure },
    });
  }

  // Regla 3: vivienda/desarrollo en auge con déficit de conectividad/transporte.
  if (scoreByDimension.housing != null && scoreByDimension.connectivity != null && scoreByDimension.housing >= 70 && scoreByDimension.connectivity < 50) {
    detected.push({
      gap_type: 'mobility_deficit',
      severity: 'medium',
      message: `Existe concentración de nuevos desarrollos inmobiliarios (${scoreByDimension.housing.toFixed(0)}/100) en una zona con déficit de transporte (${scoreByDimension.connectivity.toFixed(0)}/100).`,
      metric: { housing_score: scoreByDimension.housing, connectivity_score: scoreByDimension.connectivity },
    });
  }

  const stored = [];
  for (const gap of detected) {
    const insertResult = await query(
      `INSERT INTO territorial_gaps (unit_id, gap_type, severity, message, metric)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [unitId, gap.gap_type, gap.severity, gap.message, gap.metric]
    );
    stored.push(insertResult.rows[0]);
  }

  return stored;
}

// Simulación heurística "qué pasaría si": estima población beneficiada, cobertura y costo de una nueva instalación.
function estimateScenario(unit, params) {
  const population = Number(unit.population) || 0;
  const capacity = Number(params.capacity) || 0;
  const costPerSeat = Number(params.cost_per_seat) || 0;
  const coverageFactor = clamp(Number(params.coverage_radius_km) || 2, 0.5, 20);

  const catchmentPopulation = clamp(population * (coverageFactor / 10), 0, population);
  const populationBenefited = Math.round(Math.min(catchmentPopulation, capacity * 8));
  const estimatedCost = Math.round(capacity * costPerSeat);
  const coverageRatioPct = population > 0 ? clamp(Math.round((populationBenefited / population) * 10000) / 100, 0, 100) : 0;
  const costPerPersonBenefited = populationBenefited > 0 ? Math.round((estimatedCost / populationBenefited) * 100) / 100 : null;

  return {
    name: params.name || null,
    latitude: params.latitude ?? null,
    longitude: params.longitude ?? null,
    capacity,
    coverage_radius_km: coverageFactor,
    population_benefited: populationBenefited,
    coverage_ratio_pct: coverageRatioPct,
    estimated_cost: estimatedCost,
    cost_per_person_benefited: costPerPersonBenefited,
  };
}

async function simulateInfrastructure(unitId, params) {
  const unit = await loadUnit(unitId);
  if (!unit) return null;

  const alternatives = Array.isArray(params.alternatives) && params.alternatives.length > 0 ? params.alternatives : [params];
  const evaluated = alternatives.map((alt) => estimateScenario(unit, { ...params, ...alt }));

  let bestIndex = 0;
  evaluated.forEach((alt, index) => {
    const best = evaluated[bestIndex];
    const altScore = alt.cost_per_person_benefited === null ? -Infinity : -alt.cost_per_person_benefited;
    const bestScore = best.cost_per_person_benefited === null ? -Infinity : -best.cost_per_person_benefited;
    if (alt.population_benefited > best.population_benefited || (alt.population_benefited === best.population_benefited && altScore > bestScore)) {
      bestIndex = index;
    }
  });

  const best = evaluated[bestIndex];
  const bestLabel = evaluated.length > 1 ? `alternativa ${String.fromCharCode(65 + bestIndex)}` : 'la opción evaluada';
  const recommendation = best
    ? `Recomendación: ${bestLabel}. Beneficiaría a ${best.population_benefited.toLocaleString('es-CO')} personas (${best.coverage_ratio_pct}% de la zona) con un costo estimado de ${best.estimated_cost.toLocaleString('es-CO')}.`
    : 'No fue posible generar una recomendación con los parámetros suministrados.';

  const result = {
    scenario_type: params.scenario_type || 'new_facility',
    alternatives: evaluated,
    best_alternative_index: bestIndex,
  };

  const insertResult = await query(
    `INSERT INTO territorial_simulations (unit_id, scenario_type, parameters, result, recommendation)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [unitId, params.scenario_type || 'new_facility', params, result, recommendation]
  );

  return insertResult.rows[0];
}

module.exports = {
  DIMENSIONS,
  computeTerritorialIndex,
  getLatestIndexSnapshot,
  detectGaps,
  simulateInfrastructure,
};
