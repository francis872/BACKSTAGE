const ApiError = require('../utils/ApiError');
const analysisRepository = require('../repositories/analysis.repository');
const multicriteria = require('../domain/analytics/multicriteria');
const analyticsJobsRepository = require('../repositories/analyticsJobs.repository');

const DEFAULT_WEIGHTS = {
  population_potential: 0.25,
  accessibility: 0.2,
  competition_intensity: 0.15,
  cannibalization: 0.15,
  territorial_risk: 0.25,
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWeights(inputWeights) {
  const merged = { ...DEFAULT_WEIGHTS, ...(inputWeights || {}) };
  const values = Object.values(merged);
  const invalid = values.some((value) => typeof value !== 'number' || Number.isNaN(value) || value < 0);
  if (invalid) {
    throw new ApiError(400, 'criteria_weights debe contener números positivos.');
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) {
    throw new ApiError(400, 'La suma de los pesos debe ser mayor que 0.');
  }
  return Object.fromEntries(Object.entries(merged).map(([key, value]) => [key, value / sum]));
}

function buildDimensionScores(metrics) {
  const populationPotential = clamp(((Number(metrics.population_total_zone) || 0) / 50000) * 100);
  const accessibility = clamp((Number(metrics.poi_count_1200m) || 0) * 6.5);
  const competitionIntensity = clamp(((Number(metrics.competitor_distance_m) || 0) / 3500) * 100);
  const cannibalization = clamp(((Number(metrics.own_store_distance_m) || 0) / 3000) * 100);

  const flood = Number(metrics.flood_risk);
  const landslide = Number(metrics.landslide_risk);
  const crime = Number(metrics.crime_risk);
  const climate = Number(metrics.climate_exposure);
  const riskValues = [flood, landslide, crime, climate].filter((value) => !Number.isNaN(value));
  const riskAverage = riskValues.length > 0
    ? riskValues.reduce((acc, value) => acc + value, 0) / riskValues.length
    : 0.5;
  const territorialRisk = clamp((1 - riskAverage) * 100);

  return {
    population_potential: Number(populationPotential.toFixed(2)),
    accessibility: Number(accessibility.toFixed(2)),
    competition_intensity: Number(competitionIntensity.toFixed(2)),
    cannibalization: Number(cannibalization.toFixed(2)),
    territorial_risk: Number(territorialRisk.toFixed(2)),
  };
}

function buildExplanation(metrics, scores, weights) {
  return [
    {
      criterion: 'population_potential',
      variable: 'population_total_zone',
      observed_value: Number(metrics.population_total_zone) || 0,
      weight: weights.population_potential,
      score: scores.population_potential,
      contribution: Number((scores.population_potential * weights.population_potential).toFixed(2)),
      source: 'territorial_zones / demographic_indicators',
      confidence: 'demo',
      notes: 'Población disponible en la zona donde cae la ubicación candidata.',
    },
    {
      criterion: 'accessibility',
      variable: 'poi_count_1200m',
      observed_value: Number(metrics.poi_count_1200m) || 0,
      weight: weights.accessibility,
      score: scores.accessibility,
      contribution: Number((scores.accessibility * weights.accessibility).toFixed(2)),
      source: 'points_of_interest',
      confidence: 'demo',
      notes: 'Conteo de equipamientos y generadores de demanda en radio geométrico de 1200m.',
    },
    {
      criterion: 'competition_intensity',
      variable: 'competitor_distance_m',
      observed_value: Number(metrics.competitor_distance_m) || null,
      weight: weights.competition_intensity,
      score: scores.competition_intensity,
      contribution: Number((scores.competition_intensity * weights.competition_intensity).toFixed(2)),
      source: 'competitors',
      confidence: 'demo',
      notes: 'Mayor distancia al competidor cercano aumenta oportunidad.',
    },
    {
      criterion: 'cannibalization',
      variable: 'own_store_distance_m',
      observed_value: Number(metrics.own_store_distance_m) || null,
      weight: weights.cannibalization,
      score: scores.cannibalization,
      contribution: Number((scores.cannibalization * weights.cannibalization).toFixed(2)),
      source: 'business_locations + locations',
      confidence: 'demo',
      notes: 'Mayor distancia a tienda propia reduce canibalización.',
    },
    {
      criterion: 'territorial_risk',
      variable: 'flood/landslide/crime/climate',
      observed_value: {
        flood_risk: Number(metrics.flood_risk) || null,
        landslide_risk: Number(metrics.landslide_risk) || null,
        crime_risk: Number(metrics.crime_risk) || null,
        climate_exposure: Number(metrics.climate_exposure) || null,
      },
      weight: weights.territorial_risk,
      score: scores.territorial_risk,
      contribution: Number((scores.territorial_risk * weights.territorial_risk).toFixed(2)),
      source: 'risk_assessments',
      confidence: 'demo',
      notes: 'Se invierte el promedio de riesgos para puntuar seguridad territorial.',
    },
  ];
}

function buildRecommendation(rankedCandidates) {
  const best = rankedCandidates[0];
  if (!best) return 'No fue posible generar recomendación.';
  const second = rankedCandidates[1];
  if (!second) {
    return `La alternativa recomendada es "${best.candidate_name}" con puntaje total ${best.score_total}/100.`;
  }
  const diff = Number((best.score_total - second.score_total).toFixed(2));
  return `La alternativa recomendada es "${best.candidate_name}" con ${best.score_total}/100, superando por ${diff} puntos a "${second.candidate_name}".`;
}

async function resolveCandidatePoint(candidate, fallbackCity, organizationId) {
  if (candidate.location_id) {
    const location = await analysisRepository.findLocationById(candidate.location_id, organizationId);
    if (!location) {
      throw new ApiError(404, `No se encontró location_id ${candidate.location_id} con geometría válida.`);
    }
    return {
      location_id: location.location_id,
      name: candidate.name || location.name,
      city: candidate.city || location.city || fallbackCity || null,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
    };
  }

  const lat = Number(candidate.lat);
  const lng = Number(candidate.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new ApiError(400, 'Cada candidato debe incluir location_id o coordenadas lat/lng válidas.');
  }

  return analysisRepository.buildCandidateFromCoordinates({
    name: candidate.name || 'Candidato',
    city: candidate.city || fallbackCity || null,
    lat,
    lng,
  });
}

async function scoreCandidates(payload, organizationId, sessionUser) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (candidates.length === 0) {
    throw new ApiError(400, 'Debes enviar al menos un candidato.');
  }

  const weights = normalizeWeights(payload.criteria_weights);
  const scoredCandidates = [];

  for (const candidate of candidates) {
    const resolved = await resolveCandidatePoint(candidate, payload.city, organizationId);
    const metrics = await analysisRepository.computeCandidateMetrics({
      city: resolved.city,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      ownBrandName: payload.own_brand_name || 'McDonald%',
    });
    const scoreByDimension = buildDimensionScores(metrics);
    const explanation = buildExplanation(metrics, scoreByDimension, weights);

    scoredCandidates.push({
      candidate_name: resolved.name,
      location_id: resolved.location_id,
      city: resolved.city,
      score_by_dimension: scoreByDimension,
      metrics,
      explanation,
    });
  }

  // Real multicriteria ranking (TOPSIS): every dimension in
  // buildDimensionScores() is already constructed so that "higher is
  // better" (competition_intensity and territorial_risk are inverted at
  // the source), so all criteria are benefit-oriented here.
  const startedAt = Date.now();
  const method = payload.ranking_method === 'weighted_sum' ? 'weighted_sum' : 'topsis';
  const rankFn = method === 'weighted_sum' ? multicriteria.weightedSum : multicriteria.topsis;
  const alternatives = scoredCandidates.map((c) => ({ name: c.candidate_name, criteria: c.score_by_dimension }));
  const directions = Object.fromEntries(Object.keys(weights).map((key) => [key, 'benefit']));

  let rankingResult;
  let job = null;
  try {
    rankingResult = rankFn(alternatives, weights, { directions });
    job = await analyticsJobsRepository.createJob({
      organizationId,
      requestedByUserId: sessionUser?.user_id || null,
      algorithmName: `multicriteria.${method}`,
      algorithmVersion: multicriteria.ALGORITHM_VERSION,
      params: { weights, candidateCount: alternatives.length },
      context: { module: 'comparador', project_name: payload.project_name || null },
    });
    await analyticsJobsRepository.completeJob(job.analytics_job_id, {
      result: { ranking: rankingResult.ranking.map((r) => ({ name: r.name, scoreTotal: r.scoreTotal, rank: r.rank })) },
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    if (job) {
      await analyticsJobsRepository.failJob(job.analytics_job_id, { error: error.message, durationMs: Date.now() - startedAt });
    }
    throw new ApiError(400, `Error en el ranking multicriterio: ${error.message}`);
  }

  const scoreByName = new Map(scoredCandidates.map((c) => [c.candidate_name, c]));
  const ranked = rankingResult.ranking.map((row) => {
    const base = scoreByName.get(row.name);
    return {
      ...base,
      score_total: row.scoreTotal,
      rank_position: row.rank,
      ranking_method: method,
      analytics_job_id: job.analytics_job_id,
    };
  });

  return { ranked, weights, rankingMethod: method, analyticsJobId: job.analytics_job_id };
}

function buildPairwiseComparison(ranked) {
  const comparisons = [];
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < ranked.length; j += 1) {
      const left = ranked[i];
      const right = ranked[j];
      const dimensions = Object.keys(left.score_by_dimension).map((dimension) => {
        const leftScore = Number(left.score_by_dimension[dimension] || 0);
        const rightScore = Number(right.score_by_dimension[dimension] || 0);
        return {
          dimension,
          left_score: leftScore,
          right_score: rightScore,
          delta: Number((leftScore - rightScore).toFixed(2)),
          winner: leftScore === rightScore ? 'tie' : (leftScore > rightScore ? left.candidate_name : right.candidate_name),
        };
      });
      comparisons.push({
        left_candidate: left.candidate_name,
        right_candidate: right.candidate_name,
        score_delta_total: Number((left.score_total - right.score_total).toFixed(2)),
        winner: left.score_total === right.score_total ? 'tie' : (left.score_total > right.score_total ? left.candidate_name : right.candidate_name),
        dimensions,
      });
    }
  }
  return comparisons;
}

async function runGeostrategicAnalysis(payload, sessionUser, organizationContext) {
  const organizationId = organizationContext?.organization_id || sessionUser?.organization_id;
  if (!organizationId) {
    throw new ApiError(403, 'No hay organización activa para ejecutar análisis.');
  }

  const { ranked, weights, rankingMethod, analyticsJobId } = await scoreCandidates(payload, organizationId, sessionUser);
  const run = await analysisRepository.createAnalysisRun({
    projectName: payload.project_name || 'Expansión McDonald’s Bogotá',
    city: payload.city || null,
    objective: payload.objective || 'Priorizar ubicación de expansión con criterios multicriterio.',
    criteriaWeights: weights,
    requestedByUserId: sessionUser?.user_id || null,
    organizationId,
    metadata: {
      analysis_type: payload.analysis_type || 'expansion',
      mode: payload.mode || 'standard',
      ranking_method: rankingMethod,
      analytics_job_id: analyticsJobId,
      note: 'El análisis usa radio geométrico y no isócronas.',
    },
  });

  for (const candidate of ranked) {
    await analysisRepository.insertAnalysisResult({
      analysisRunId: run.analysis_run_id,
      rankPosition: candidate.rank_position,
      candidateName: candidate.candidate_name,
      locationId: candidate.location_id,
      scoreTotal: candidate.score_total,
      scoreByDimension: candidate.score_by_dimension,
      metrics: candidate.metrics,
      explanation: { criteria: candidate.explanation },
    });
  }

  const recommendationText = buildRecommendation(ranked);
  await analysisRepository.setAnalysisRecommendation(run.analysis_run_id, recommendationText, {
    top_candidate: ranked[0] || null,
    ranking: ranked.map((candidate) => ({
      rank_position: candidate.rank_position,
      candidate_name: candidate.candidate_name,
      score_total: candidate.score_total,
    })),
  });

  return {
    analysis_run_id: run.analysis_run_id,
    project_name: payload.project_name || 'Expansión McDonald’s Bogotá',
    city: payload.city || null,
    criteria_weights: weights,
    recommendation: recommendationText,
    ranking: ranked,
    created_at: run.created_at,
  };
}

async function compareCandidates(payload, sessionUser, organizationContext) {
  const organizationId = organizationContext?.organization_id || sessionUser?.organization_id;
  if (!organizationId) {
    throw new ApiError(403, 'No hay organización activa para ejecutar comparación.');
  }

  const { ranked, weights, rankingMethod, analyticsJobId } = await scoreCandidates(payload, organizationId, sessionUser);

  let sensitivity = null;
  if (ranked.length >= 2) {
    const alternatives = ranked.map((r) => ({ name: r.candidate_name, criteria: r.score_by_dimension }));
    const directions = Object.fromEntries(Object.keys(weights).map((key) => [key, 'benefit']));
    try {
      sensitivity = multicriteria.sensitivityAnalysis(alternatives, weights, {
        directions, method: rankingMethod, perturbationPct: 0.15,
      });
    } catch {
      sensitivity = null; // Sensitivity is best-effort context, never blocks the main ranking.
    }
  }

  return {
    compared_at: new Date().toISOString(),
    project_name: payload.project_name || 'Comparador avanzado',
    city: payload.city || null,
    criteria_weights: weights,
    ranking_method: rankingMethod,
    analytics_job_id: analyticsJobId,
    recommendation: buildRecommendation(ranked),
    ranking: ranked,
    pairwise: buildPairwiseComparison(ranked),
    sensitivity,
  };
}

async function getAnalysisRunById(id, organizationId) {
  const run = await analysisRepository.getAnalysisRunByIdForOrganization(id, organizationId);
  if (!run) throw new ApiError(404, 'Análisis no encontrado.');
  return run;
}

async function listAnalysisRuns(organizationId, limit) {
  if (!organizationId) {
    throw new ApiError(403, 'No hay organización activa.');
  }
  return analysisRepository.listAnalysisRuns({ organizationId, limit });
}

async function getPrintableReport(id, organizationId) {
  const run = await getAnalysisRunById(id, organizationId);
  const generatedAt = new Date().toISOString();
  const topCandidate = run.ranking?.[0];
  return {
    analysis_run_id: run.analysis_run_id,
    generated_at: generatedAt,
    header: {
      project_name: run.project_name,
      city: run.city,
      objective: run.objective,
      status: run.status,
      created_at: run.created_at,
    },
    executive_summary: run.recommendation_text,
    criteria_weights: run.criteria_weights || {},
    top_candidate: topCandidate || null,
    ranking: run.ranking || [],
    appendix: {
      recommendation_payload: run.recommendation_payload || {},
      updated_at: run.updated_at,
    },
  };
}

module.exports = {
  runGeostrategicAnalysis,
  compareCandidates,
  getAnalysisRunById,
  listAnalysisRuns,
  getPrintableReport,
};
