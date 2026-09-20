const analysisService = require('./analysis.service');
const eventsService = require('./operationalEvents.service');
const eventsRepository = require('../repositories/operationalEvents.repository');
const { publishOperationalEvent } = require('../realtime/operationalEvents');
const autoRecovery = require('./autoRecovery.service');
const metrics = require('./operationalMetrics.service');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
let timer = null;
let running = false;

function conditionsForProject(project) {
  const conditions = [];

  if (project.workflow?.state === 'stale') {
    conditions.push({
      key: `supervisor:stale:${project.analysis_run_id}`,
      type: 'supervisor.stale',
      severity: 'critical',
      title: 'Recalculo requerido',
      message: project.blocked_reason || 'Los resultados del proyecto están desactualizados.',
      target: 'portfolio-comparator',
    });
  }

  if (project.sla?.breached) {
    conditions.push({
      key: `supervisor:sla:${project.analysis_run_id}:${project.workflow?.state}`,
      type: 'supervisor.sla_breached',
      severity: project.priority === 'critical' ? 'critical' : 'warning',
      title: 'SLA operacional vencido',
      message: `${project.workflow?.label || 'Etapa'} lleva ${project.sla.age_hours}h; límite ${project.sla.limit_hours}h.`,
      target: project.workflow?.target || 'mission-control',
    });
  }

  const criticalRisk = Number(project.metadata?.risk_review?.counts?.critical || 0);
  if (criticalRisk > 0 && project.workflow?.state !== 'report_ready') {
    conditions.push({
      key: `supervisor:critical-risk:${project.analysis_run_id}`,
      type: 'supervisor.critical_risk',
      severity: 'critical',
      title: 'Riesgo crítico requiere seguimiento',
      message: `${criticalRisk} riesgo(s) crítico(s) permanecen asociados al proyecto.`,
      target: 'intelligence-evaluations',
    });
  }

  if (project.workflow?.state === 'recommendation_review_pending') {
    conditions.push({
      key: `supervisor:recommendation-review:${project.analysis_run_id}`,
      type: 'supervisor.recommendation_pending',
      severity: project.sla?.breached ? 'warning' : 'info',
      title: 'Decisión humana pendiente',
      message: 'La recomendación operacional está esperando aprobación o rechazo.',
      target: 'intelligence-recommendations',
    });
  }

  if (project.workflow?.state === 'blocked') {
    conditions.push({
      key: `supervisor:blocked:${project.analysis_run_id}`,
      type: 'supervisor.blocked',
      severity: 'warning',
      title: 'Proyecto bloqueado',
      message: project.blocked_reason || 'El workflow no puede avanzar.',
      target: project.workflow?.target || 'mission-control',
    });
  }

  return conditions;
}

async function reconcileProject(project, organizationId) {
  await autoRecovery.reconcileRecoverySuccess(project, organizationId);
  const active = conditionsForProject(project);
  const activeKeys = new Set(active.map((condition) => condition.key));

  for (const condition of active) {
    await eventsService.emit({
      organizationId,
      analysisRunId: project.analysis_run_id,
      eventType: condition.type,
      severity: condition.severity,
      title: condition.title,
      message: condition.message,
      target: condition.target,
      dedupeKey: condition.key,
      payload: {
        supervisor: true,
        workflow_state: project.workflow?.state,
        priority: project.priority,
        health: project.health,
        sla: project.sla,
      },
    });
  }

  const knownKeys = [
    `supervisor:stale:${project.analysis_run_id}`,
    `supervisor:critical-risk:${project.analysis_run_id}`,
    `supervisor:recommendation-review:${project.analysis_run_id}`,
    `supervisor:blocked:${project.analysis_run_id}`,
  ];

  const slaStates = ['exploring','selecting_candidates','candidates_ready','probability_pending','risk_review_pending','critical_risk_reviewed','recommendation_pending','recommendation_review_pending','recommendation_rejected','recommended','stale','blocked'];
  slaStates.forEach((state) => knownKeys.push(`supervisor:sla:${project.analysis_run_id}:${state}`));

  for (const key of knownKeys) {
    if (!activeKeys.has(key)) {
      const resolved = await eventsRepository.resolveByDedupeKey({ organizationId, dedupeKey: key });
      resolved.forEach((event) => publishOperationalEvent({ ...event, lifecycle: 'resolved' }));
    }
  }

  const recoveryResult = await autoRecovery.attemptRecovery(project, organizationId);
  return { conditions: active.length, recovery: recoveryResult };
}

async function runSupervisorCycle() {
  if (running) return { skipped: true };
  running = true;
  const startedAt = Date.now();
  metrics.markSupervisorStart();
  let organizations = 0;
  let projects = 0;
  try {
    const organizationIds = await eventsRepository.listOrganizationsWithActiveRuns();
    organizations = organizationIds.length;
    for (const organizationId of organizationIds) {
      const board = await analysisService.listOperationalBoard(organizationId, 100);
      projects += board.length;
      for (const project of board) {
        await reconcileProject(project, organizationId);
      }
    }
    const durationMs = Date.now() - startedAt;
    metrics.recordSupervisorCycle({ durationMs, projects });
    return { organizations, projects, duration_ms: durationMs };
  } catch (error) {
    metrics.recordSupervisorCycle({ durationMs: Date.now() - startedAt, projects, error: true });
    throw error;
  } finally {
    running = false;
  }
}

function startOperationalSupervisor(options = {}) {
  if (timer) return () => stopOperationalSupervisor();
  const intervalMs = Math.max(Number(options.intervalMs || process.env.OPERATIONAL_SUPERVISOR_INTERVAL_MS || DEFAULT_INTERVAL_MS), 60000);

  runSupervisorCycle().catch((error) => {
    console.error('Operational supervisor initial cycle failed:', error);
  });

  timer = setInterval(() => {
    runSupervisorCycle().catch((error) => {
      console.error('Operational supervisor cycle failed:', error);
    });
  }, intervalMs);
  timer.unref?.();

  return () => stopOperationalSupervisor();
}

function stopOperationalSupervisor() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  conditionsForProject,
  runSupervisorCycle,
  startOperationalSupervisor,
  stopOperationalSupervisor,
};
