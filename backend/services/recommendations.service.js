const { query } = require('../db');
const ApiError = require('../utils/ApiError');
const analysisRepository = require('../repositories/analysis.repository');

const STATUSES = ['proposed', 'under_review', 'approved', 'rejected', 'in_progress', 'completed', 'expired'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

async function assertLocationBelongsToOrganization(locationId, organizationId) {
  const location = await query(
    'SELECT location_id FROM locations WHERE location_id = $1 AND organization_id = $2',
    [locationId, organizationId]
  );
  if (location.rows.length === 0) {
    throw new ApiError(400, 'location_id no pertenece a la organización activa.');
  }
}

async function listRecommendations(organizationId, { status, priority, limit = 50 } = {}) {
  const conditions = ['r.organization_id = $1'];
  const params = [organizationId];

  if (status) {
    if (!STATUSES.includes(status)) throw new ApiError(400, `status inválido. Valores permitidos: ${STATUSES.join(', ')}.`);
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }
  if (priority) {
    if (!PRIORITIES.includes(priority)) throw new ApiError(400, `priority inválida. Valores permitidos: ${PRIORITIES.join(', ')}.`);
    params.push(priority);
    conditions.push(`r.priority = $${params.length}`);
  }
  params.push(Math.min(Number(limit) || 50, 200));

  const result = await query(
    `SELECT r.*, l.name AS location_name, l.city AS location_city,
            u.name AS reviewed_by_name, ar.project_name AS analysis_project_name
     FROM recommendations r
     LEFT JOIN locations l ON l.location_id = r.location_id
     LEFT JOIN users u ON u.user_id = r.reviewed_by_user_id
     LEFT JOIN analysis_runs ar ON ar.analysis_run_id = r.analysis_run_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE r.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
       r.requested_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

async function getSummary(organizationId) {
  const result = await query(
    `SELECT status, COUNT(*)::int AS count, COALESCE(AVG(confidence), 0)::float AS avg_confidence
     FROM recommendations WHERE organization_id = $1 GROUP BY status`,
    [organizationId]
  );
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  result.rows.forEach((row) => { byStatus[row.status] = row.count; });

  const pendingReview = await query(
    `SELECT COUNT(*)::int AS count FROM recommendations
     WHERE organization_id = $1 AND status IN ('proposed', 'under_review')`,
    [organizationId]
  );

  return {
    by_status: byStatus,
    total: Object.values(byStatus).reduce((acc, v) => acc + v, 0),
    pending_review: pendingReview.rows[0].count,
  };
}

async function getRecommendationById(id, organizationId) {
  const result = await query(
    `SELECT r.*, l.name AS location_name, l.city AS location_city,
            u.name AS reviewed_by_name, ar.project_name AS analysis_project_name
     FROM recommendations r
     LEFT JOIN locations l ON l.location_id = r.location_id
     LEFT JOIN users u ON u.user_id = r.reviewed_by_user_id
     LEFT JOIN analysis_runs ar ON ar.analysis_run_id = r.analysis_run_id
     WHERE r.recommendation_id = $1 AND r.organization_id = $2`,
    [id, organizationId]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Recomendación no encontrada.');
  return result.rows[0];
}

async function createRecommendation(data, sessionUser, organizationContext) {
  const {
    location_id, query_type, parameters, result: resultPayload, score,
    title, priority, confidence, expected_impact, analysis_run_id,
  } = data;
  if (!location_id || !query_type) {
    throw new ApiError(400, 'location_id y query_type son requeridos.');
  }
  if (priority && !PRIORITIES.includes(priority)) {
    throw new ApiError(400, `priority inválida. Valores permitidos: ${PRIORITIES.join(', ')}.`);
  }
  await assertLocationBelongsToOrganization(location_id, organizationContext.organization_id);
  const inserted = await query(
    `INSERT INTO recommendations
       (location_id, query_type, parameters, result, score, organization_id, requested_by_user_id,
        title, priority, confidence, expected_impact, analysis_run_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'proposed')
     RETURNING *`,
    [
      location_id, query_type, parameters || null, resultPayload || null, score || null,
      organizationContext.organization_id, sessionUser.user_id,
      title || null, priority || null, confidence ?? null, expected_impact || null, analysis_run_id || null,
    ]
  );
  return inserted.rows[0];
}

async function updateRecommendation(id, data, organizationContext) {
  const { location_id, query_type, parameters, result: resultPayload, score, title, priority, expected_impact } = data;
  await assertLocationBelongsToOrganization(location_id, organizationContext.organization_id);
  if (priority && !PRIORITIES.includes(priority)) {
    throw new ApiError(400, `priority inválida. Valores permitidos: ${PRIORITIES.join(', ')}.`);
  }
  const updated = await query(
    `UPDATE recommendations SET
       location_id = $1, query_type = $2, parameters = $3, result = $4, score = $5,
       title = COALESCE($6, title), priority = COALESCE($7, priority), expected_impact = COALESCE($8, expected_impact)
     WHERE recommendation_id = $9
       AND organization_id = $10
     RETURNING *`,
    [location_id, query_type, parameters || null, resultPayload || null, score || null,
      title || null, priority || null, expected_impact || null, id, organizationContext.organization_id]
  );
  if (updated.rows.length === 0) throw new ApiError(404, 'Recomendación no encontrada.');
  return updated.rows[0];
}

async function deleteRecommendation(id, organizationContext) {
  const deleted = await query(
    'DELETE FROM recommendations WHERE recommendation_id = $1 AND organization_id = $2 RETURNING *',
    [id, organizationContext.organization_id]
  );
  if (deleted.rows.length === 0) throw new ApiError(404, 'Recomendación no encontrada.');
  return deleted.rows[0];
}

const TRANSITIONS = {
  proposed: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['in_progress', 'expired'],
  in_progress: ['completed', 'expired'],
  rejected: [],
  completed: [],
  expired: [],
};

async function reviewRecommendation(id, organizationId, sessionUser, { decision, notes }) {
  if (!['approved', 'rejected', 'under_review', 'in_progress', 'completed'].includes(decision)) {
    throw new ApiError(400, `decision inválida. Valores permitidos: ${STATUSES.join(', ')}.`);
  }
  const current = await getRecommendationById(id, organizationId);
  const allowedNext = TRANSITIONS[current.status] || [];
  if (!allowedNext.includes(decision)) {
    throw new ApiError(
      400,
      `Transición inválida: "${current.status}" -> "${decision}". Transiciones permitidas desde "${current.status}": ${allowedNext.join(', ') || 'ninguna'}.`
    );
  }
  if ((decision === 'approved' || decision === 'rejected') && !notes) {
    throw new ApiError(400, 'Se requiere una justificación (notes) para aprobar o rechazar una recomendación.');
  }
  const updated = await query(
    `UPDATE recommendations SET
       status = $1, reviewed_by_user_id = $2, review_notes = $3, reviewed_at = now()
     WHERE recommendation_id = $4 AND organization_id = $5
     RETURNING *`,
    [decision, sessionUser.user_id, notes || null, id, organizationId]
  );
  const row = updated.rows[0];
  if (row?.analysis_run_id && (decision === 'approved' || decision === 'rejected')) {
    await query(
      `UPDATE analysis_runs
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
         'operational_recommendation_reviewed_at', now(),
         'operational_recommendation_reviewed_by_user_id', $1,
         'operational_recommendation_decision', $2,
         'operational_recommendation_id', $3
       ),
       updated_at = now()
       WHERE analysis_run_id = $4 AND organization_id = $5`,
      [sessionUser.user_id, decision, row.recommendation_id, row.analysis_run_id, organizationId]
    );
  }
  return row;
}

function inferPriority(rankPosition, riskClassification) {
  if (riskClassification?.severity === 'critical') return 'critical';
  if (riskClassification?.severity === 'high') return 'high';
  if (rankPosition === 1) return 'high';
  if (rankPosition === 2) return 'medium';
  return 'low';
}

function buildExpectedImpact(candidate, probabilityResult, riskClassification) {
  const dims = Object.entries(candidate.score_by_dimension || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => key.replace(/_/g, ' '));
  const parts = [];
  if (dims.length > 0) parts.push(`Fortalezas principales: ${dims.join(' y ')}.`);
  if (probabilityResult?.selected_distribution) {
    const survival = Number(probabilityResult.observation_evaluation?.survival_probability);
    parts.push(
      Number.isFinite(survival)
        ? `Motor probabilístico: ${probabilityResult.selected_distribution}, cola derecha ${(survival * 100).toFixed(1)}%.`
        : `Motor probabilístico: ${probabilityResult.selected_distribution}.`
    );
  }
  if (riskClassification?.severity && riskClassification.severity !== 'missing') {
    parts.push(`Riesgo territorial: ${riskClassification.severity} (${((riskClassification.average || 0) * 100).toFixed(1)}% promedio).`);
  }
  return parts.join(' ') || 'Impacto esperado no cuantificado con la información disponible.';
}

function classifyCandidateRisk(candidate, riskRows) {
  const row = (riskRows || []).find((item) => Number(item.location_id) === Number(candidate.location_id));
  if (!row || !row.risk_id) return { severity: 'missing', average: null, max_component: null };
  const values = [row.flood_risk, row.landslide_risk, row.crime_risk, row.climate_exposure]
    .map(Number)
    .filter(Number.isFinite);
  if (!values.length) return { severity: 'missing', average: null, max_component: null };
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const maxComponent = Math.max(...values);
  let severity = 'low';
  if (average >= 0.70 || maxComponent >= 0.80) severity = 'critical';
  else if (average >= 0.40) severity = 'high';
  else if (average >= 0.20) severity = 'medium';
  return { severity, average: Number(average.toFixed(4)), max_component: Number(maxComponent.toFixed(4)) };
}

/**
 * Generates draft recommendations directly from a completed analysis
 * run's multicriteria ranking, linking each recommendation back to the
 * run and candidate that produced it (traceability requirement). Uses
 * the TOPSIS closeness coefficient (0-100) as the confidence basis and
 * rank position as an explainable, documented priority heuristic — never
 * presented as more than that.
 */
async function generateFromAnalysisRun(analysisRunId, organizationId, sessionUser, { topN = 1 } = {}) {
  const run = await analysisRepository.getAnalysisRunByIdForOrganization(analysisRunId, organizationId);
  if (!run) throw new ApiError(404, 'Análisis no encontrado.');

  const probabilityResult = run.metadata?.probability_result || null;
  const riskReviewed = Boolean(run.metadata?.risk_reviewed_at);
  if (!probabilityResult) {
    throw new ApiError(409, 'Debes completar el Motor Probabilístico antes de generar la recomendación operacional.');
  }
  if (!riskReviewed) {
    throw new ApiError(409, 'Debes completar la revisión de riesgos antes de generar la recomendación operacional.');
  }

  const riskRows = await analysisRepository.getOperationalRisksByRun({ analysisRunId, organizationId });
  const candidates = (run.ranking || []).slice(0, Math.max(1, Math.min(topN, run.ranking.length)));
  if (candidates.length === 0) {
    throw new ApiError(400, 'El análisis no tiene candidatos en su ranking.');
  }

  const created = [];
  for (const candidate of candidates) {
    if (!candidate.location_id) continue;
    const existing = await query(
      `SELECT recommendation_id FROM recommendations
       WHERE analysis_run_id = $1 AND location_id = $2 AND organization_id = $3`,
      [analysisRunId, candidate.location_id, organizationId]
    );
    if (existing.rows.length > 0) continue;

    const riskClassification = classifyCandidateRisk(candidate, riskRows);
    const probabilityObservation = probabilityResult.observation_evaluation || {};
    const confidenceBase = Number(candidate.score_total || 0) / 100;
    const riskPenalty = riskClassification.severity === 'critical' ? 0.25
      : riskClassification.severity === 'high' ? 0.15
        : riskClassification.severity === 'medium' ? 0.05 : 0;
    const confidence = Math.max(0, Math.min(1, confidenceBase - riskPenalty));

    const resultPayload = {
      candidate_name: candidate.candidate_name,
      score_total: candidate.score_total,
      score_by_dimension: candidate.score_by_dimension,
      probability: {
        dataset_key: probabilityResult.dataset_key,
        selected_distribution: probabilityResult.selected_distribution,
        percentile: probabilityObservation.percentile ?? null,
        cdf: probabilityObservation.cdf ?? null,
        survival_probability: probabilityObservation.survival_probability ?? null,
      },
      risk: riskClassification,
      rationale: {
        ranking_position: candidate.rank_position,
        ranking_score: candidate.score_total,
        risk_adjusted_confidence: Number(confidence.toFixed(4)),
        human_review_required: true,
      },
    };

    const inserted = await query(
      `INSERT INTO recommendations
         (location_id, query_type, parameters, result, score, organization_id, requested_by_user_id,
          title, priority, confidence, expected_impact, analysis_run_id, status)
       VALUES ($1, 'operational_decision', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'proposed')
       RETURNING *`,
      [
        candidate.location_id,
        {
          analysis_run_id: Number(analysisRunId),
          rank_position: candidate.rank_position,
          weights: run.criteria_weights,
          probability_completed_at: run.metadata?.probability_completed_at || null,
          risk_reviewed_at: run.metadata?.risk_reviewed_at || null,
        },
        resultPayload,
        candidate.score_total,
        organizationId,
        sessionUser.user_id,
        `${run.project_name}: ${candidate.candidate_name}`,
        inferPriority(candidate.rank_position, riskClassification),
        Number(confidence.toFixed(4)),
        buildExpectedImpact(candidate, probabilityResult, riskClassification),
        analysisRunId,
      ]
    );
    created.push(inserted.rows[0]);
  }

  await query(
    `UPDATE analysis_runs
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
       'operational_recommendation_generated_at', now(),
       'operational_recommendation_generated_by_user_id', $1,
       'operational_recommendation_count', $2
     ),
     updated_at = now()
     WHERE analysis_run_id = $3 AND organization_id = $4`,
    [sessionUser.user_id, created.length, analysisRunId, organizationId]
  );

  return created;
}

async function getExampleRecommendation() {
  const locationResult = await query(
    `SELECT l.name, l.address, h.metric->>'queue_minutes' AS queue_minutes, h.metric->>'occupancy' AS occupancy
     FROM locations l
     LEFT JOIN location_histories h ON h.location_id = l.location_id
     WHERE l.external_id = 'mcd-001'
     ORDER BY h.observed_at DESC LIMIT 1`
  );

  const restaurant = locationResult.rows[0];
  if (!restaurant) {
    return { message: 'No se encontró un restaurante de ejemplo en la base de datos.' };
  }

  const queueMinutes = restaurant.queue_minutes ? Number(restaurant.queue_minutes) : null;
  const occupancy = restaurant.occupancy ? Number(restaurant.occupancy) : null;
  const message = queueMinutes
    ? `El restaurante ${restaurant.name} tiene una fila estimada de ${queueMinutes} minutos. Si recorres 600 metros adicionales ahorrarás 14 minutos.`
    : `El restaurante ${restaurant.name} no tiene datos de espera en este momento, pero está disponible para análisis.`;

  return {
    message,
    location: { name: restaurant.name, address: restaurant.address, queue_minutes: queueMinutes, occupancy },
  };
}

module.exports = {
  STATUSES,
  PRIORITIES,
  listRecommendations,
  getSummary,
  getRecommendationById,
  createRecommendation,
  updateRecommendation,
  deleteRecommendation,
  reviewRecommendation,
  generateFromAnalysisRun,
  getExampleRecommendation,
};
