const { query } = require('../db');
const analysisService = require('./analysis.service');

const runtime = {
  supervisor_cycles: 0,
  supervisor_errors: 0,
  supervisor_last_duration_ms: 0,
  supervisor_last_started_at: null,
  supervisor_last_completed_at: null,
  supervisor_projects_scanned: 0,
  recovery_attempts: 0,
  recovery_successes: 0,
  recovery_failures: 0,
  recovery_locks: 0,
};

function recordSupervisorCycle({ durationMs = 0, projects = 0, error = false } = {}) {
  runtime.supervisor_cycles += 1;
  runtime.supervisor_last_duration_ms = durationMs;
  runtime.supervisor_projects_scanned += projects;
  runtime.supervisor_last_completed_at = new Date().toISOString();
  if (error) runtime.supervisor_errors += 1;
}

function markSupervisorStart() {
  runtime.supervisor_last_started_at = new Date().toISOString();
}

function recordRecovery(kind) {
  if (kind === 'attempt') runtime.recovery_attempts += 1;
  if (kind === 'success') runtime.recovery_successes += 1;
  if (kind === 'failure') runtime.recovery_failures += 1;
  if (kind === 'lock') runtime.recovery_locks += 1;
}

async function postgresHealth() {
  const started = Date.now();
  try {
    await query('SELECT 1');
    return { status: 'healthy', latency_ms: Date.now() - started };
  } catch (error) {
    return { status: 'down', latency_ms: Date.now() - started, error: error.message };
  }
}

async function health() {
  const database = await postgresHealth();
  const recoveryTotal = runtime.recovery_successes + runtime.recovery_failures;
  const recoveryRate = recoveryTotal
    ? Number(((runtime.recovery_successes / recoveryTotal) * 100).toFixed(1))
    : null;

  return {
    status: database.status === 'healthy' && runtime.supervisor_errors === 0 ? 'healthy' : 'degraded',
    components: {
      postgres: database,
      supervisor: {
        status: runtime.supervisor_last_completed_at ? 'healthy' : 'starting',
        cycles: runtime.supervisor_cycles,
        errors: runtime.supervisor_errors,
        last_duration_ms: runtime.supervisor_last_duration_ms,
        last_started_at: runtime.supervisor_last_started_at,
        last_completed_at: runtime.supervisor_last_completed_at,
      },
      auto_recovery: {
        status: runtime.recovery_locks > 0 ? 'degraded' : 'healthy',
        attempts: runtime.recovery_attempts,
        successes: runtime.recovery_successes,
        failures: runtime.recovery_failures,
        locks: runtime.recovery_locks,
        success_rate_pct: recoveryRate,
      },
      realtime: {
        status: 'healthy',
        transport: 'websocket',
      },
      event_engine: {
        status: 'healthy',
      },
    },
  };
}

async function metrics(organizationId) {
  const board = await analysisService.listOperationalBoard(organizationId, 100);
  const slaBreaches = board.filter((p) => p.sla?.breached).length;
  const staleProjects = board.filter((p) => p.workflow?.state === 'stale').length;
  const criticalProjects = board.filter((p) => p.priority === 'critical').length;
  const avgHealth = board.length
    ? Number((board.reduce((sum, p) => sum + Number(p.health || 0), 0) / board.length).toFixed(1))
    : null;

  return {
    projects_total: board.length,
    sla_breaches: slaBreaches,
    stale_projects: staleProjects,
    critical_projects: criticalProjects,
    average_project_health: avgHealth,
    supervisor: { ...runtime },
  };
}

async function diagnostics(analysisRunId, organizationId) {
  const board = await analysisService.listOperationalBoard(organizationId, 100);
  const project = board.find((item) => Number(item.analysis_run_id) === Number(analysisRunId));
  if (!project) return null;

  const recovery = project.metadata?.auto_recovery || {};
  const dependencyVersions = project.metadata?.dependency_versions || {};

  return {
    analysis_run_id: project.analysis_run_id,
    project_name: project.project_name,
    workflow: project.workflow,
    timeline: project.timeline,
    priority: project.priority,
    health: project.health,
    sla: project.sla,
    blocked_reason: project.blocked_reason,
    stale: Boolean(project.metadata?.workflow_stale),
    stale_reason: project.metadata?.workflow_stale_reason || null,
    dependency_versions: dependencyVersions,
    auto_recovery: recovery,
    risk_review: project.metadata?.risk_review || null,
  };
}

module.exports = {
  runtime,
  markSupervisorStart,
  recordSupervisorCycle,
  recordRecovery,
  health,
  metrics,
  diagnostics,
};
