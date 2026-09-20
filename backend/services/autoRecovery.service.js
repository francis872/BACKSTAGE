const analysisRepository = require('../repositories/analysis.repository');
const analysisService = require('./analysis.service');
const eventsService = require('./operationalEvents.service');
const metrics = require('./operationalMetrics.service');

const DEFAULT_POLICY = {
  maxAttempts: Number(process.env.AUTO_RECOVERY_MAX_ATTEMPTS || 3),
  baseCooldownMs: Number(process.env.AUTO_RECOVERY_BASE_COOLDOWN_MS || 15 * 60 * 1000),
  maxCooldownMs: Number(process.env.AUTO_RECOVERY_MAX_COOLDOWN_MS || 6 * 60 * 60 * 1000),
  circuitFailureThreshold: Number(process.env.AUTO_RECOVERY_CIRCUIT_FAILURE_THRESHOLD || 2),
  circuitOpenMs: Number(process.env.AUTO_RECOVERY_CIRCUIT_OPEN_MS || 60 * 60 * 1000),
};

const SAFE_ACTIONS = {
  stale: { action: 'recalculate_comparison', requiresSla: false },
  probability_pending: { action: 'retry_probability', requiresSla: true },
  risk_review_pending: { action: 'reopen_risk_review', requiresSla: true },
};

function policy(options = {}) {
  return {
    maxAttempts: Math.max(1, Number(options.maxAttempts || DEFAULT_POLICY.maxAttempts)),
    baseCooldownMs: Math.max(60000, Number(options.baseCooldownMs || DEFAULT_POLICY.baseCooldownMs)),
    maxCooldownMs: Math.max(60000, Number(options.maxCooldownMs || DEFAULT_POLICY.maxCooldownMs)),
    circuitFailureThreshold: Math.max(1, Number(options.circuitFailureThreshold || DEFAULT_POLICY.circuitFailureThreshold)),
    circuitOpenMs: Math.max(60000, Number(options.circuitOpenMs || DEFAULT_POLICY.circuitOpenMs)),
  };
}

function backoffMs(attempt, recoveryPolicy = DEFAULT_POLICY) {
  return Math.min(recoveryPolicy.baseCooldownMs * (2 ** Math.max(0, attempt - 1)), recoveryPolicy.maxCooldownMs);
}

function recoveryCandidate(project) {
  const rule = SAFE_ACTIONS[project.workflow?.state];
  if (!rule) return null;
  if (rule.requiresSla && !project.sla?.breached) return null;
  return rule.action;
}

function canAttempt(state, now, recoveryPolicy) {
  if (!state) return { allowed: true, attempt: 1 };
  const circuitUntil = state.circuit_open_until ? new Date(state.circuit_open_until).getTime() : 0;
  if (circuitUntil > now) return { allowed: false, circuitOpen: true, attempt: Number(state.attempts || 0), circuitOpenUntil: state.circuit_open_until };
  const attempts = Number(state.attempts || 0);
  if (state.locked || attempts >= recoveryPolicy.maxAttempts) {
    return { allowed: false, locked: true, attempt: attempts };
  }
  const nextAt = state.next_attempt_at ? new Date(state.next_attempt_at).getTime() : 0;
  if (nextAt > now) {
    return { allowed: false, cooldown: true, attempt: attempts, nextAttemptAt: state.next_attempt_at };
  }
  return { allowed: true, attempt: attempts + 1 };
}

async function attemptRecovery(project, organizationId, options = {}) {
  const action = recoveryCandidate(project);
  if (!action) return { attempted: false, reason: 'not-eligible' };

  const recoveryPolicy = policy(options);
  const current = await analysisRepository.getRecoveryState({
    analysisRunId: project.analysis_run_id,
    organizationId,
    action,
  });
  const eligibility = canAttempt(current, Date.now(), recoveryPolicy);

  if (!eligibility.allowed) {
    if (eligibility.locked && !current?.lock_event_emitted) {
      const lockedState = { ...current, locked: true, lock_event_emitted: true };
      await analysisRepository.recordRecoveryAttempt({
        analysisRunId: project.analysis_run_id, organizationId, action, state: lockedState,
      });
      await eventsService.emit({
        organizationId,
        analysisRunId: project.analysis_run_id,
        eventType: 'auto_recovery.locked',
        severity: 'critical',
        title: 'Auto-Recovery agotado',
        message: `Se alcanzó el máximo de ${recoveryPolicy.maxAttempts} intentos para ${action}. Requiere intervención humana.`,
        target: project.workflow?.target || 'mission-control',
        dedupeKey: `auto-recovery-locked:${project.analysis_run_id}:${action}`,
        payload: { action, attempts: Number(current?.attempts || 0), human_intervention_required: true },
      });
    }
    return { attempted: false, ...eligibility };
  }

  const attempt = eligibility.attempt;
  metrics.recordRecovery('attempt');
  const startedAt = new Date().toISOString();
  const nextAttemptAt = new Date(Date.now() + backoffMs(attempt, recoveryPolicy)).toISOString();

  await eventsService.emit({
    organizationId,
    analysisRunId: project.analysis_run_id,
    eventType: 'auto_recovery.attempt',
    severity: 'info',
    title: 'Auto-Recovery iniciado',
    message: `Intento ${attempt}/${recoveryPolicy.maxAttempts}: ${action}.`,
    target: project.workflow?.target || 'mission-control',
    payload: { action, attempt, max_attempts: recoveryPolicy.maxAttempts },
  });

  try {
    const result = await analysisService.executeOperationalCommand(
      project.analysis_run_id,
      action,
      { source: 'auto_recovery' },
      null,
      { organization_id: organizationId }
    );

    metrics.recordRecovery('success');
    await analysisRepository.recordRecoveryAttempt({
      analysisRunId: project.analysis_run_id,
      organizationId,
      action,
      state: {
        attempts: attempt,
        consecutive_failures: 0,
        circuit_open_until: null,
        last_attempt_at: startedAt,
        next_attempt_at: nextAttemptAt,
        last_status: 'command_dispatched',
        last_error: null,
        locked: attempt >= recoveryPolicy.maxAttempts,
      },
    });

    await eventsService.emit({
      organizationId,
      analysisRunId: project.analysis_run_id,
      eventType: 'auto_recovery.dispatched',
      severity: 'success',
      title: 'Auto-Recovery preparado',
      message: `${action} fue preparado automáticamente. El módulo correspondiente debe regenerar el resultado.`,
      target: result.target,
      payload: { action, attempt, next_attempt_at: nextAttemptAt },
    });

    return { attempted: true, success: true, action, attempt, result };
  } catch (error) {
    metrics.recordRecovery('failure');
    const locked = attempt >= recoveryPolicy.maxAttempts;
    const consecutiveFailures = Number(current?.consecutive_failures || 0) + 1;
    const circuitOpen = consecutiveFailures >= recoveryPolicy.circuitFailureThreshold;
    const circuitOpenUntil = circuitOpen ? new Date(Date.now() + recoveryPolicy.circuitOpenMs).toISOString() : null;
    if (locked) metrics.recordRecovery('lock');
    await analysisRepository.recordRecoveryAttempt({
      analysisRunId: project.analysis_run_id,
      organizationId,
      action,
      state: {
        attempts: attempt,
        consecutive_failures: consecutiveFailures,
        circuit_open_until: circuitOpenUntil,
        last_attempt_at: startedAt,
        next_attempt_at: nextAttemptAt,
        last_status: circuitOpen ? 'circuit_open' : 'failed',
        last_error: error.message,
        locked,
      },
    });

    await eventsService.emit({
      organizationId,
      analysisRunId: project.analysis_run_id,
      eventType: 'auto_recovery.failed',
      severity: locked ? 'critical' : 'warning',
      title: locked ? 'Auto-Recovery requiere intervención' : 'Auto-Recovery falló',
      message: error.message,
      target: project.workflow?.target || 'mission-control',
      dedupeKey: locked ? `auto-recovery-locked:${project.analysis_run_id}:${action}` : null,
      payload: { action, attempt, max_attempts: recoveryPolicy.maxAttempts, next_attempt_at: nextAttemptAt, locked, circuit_open: circuitOpen, circuit_open_until: circuitOpenUntil },
    });

    return { attempted: true, success: false, action, attempt, error: error.message, locked };
  }
}

async function reconcileRecoverySuccess(project, organizationId) {
  const recovery = project.metadata?.auto_recovery || {};
  for (const [action, state] of Object.entries(recovery)) {
    const stillRelevant =
      (action === 'recalculate_comparison' && project.workflow?.state === 'stale') ||
      (action === 'retry_probability' && project.workflow?.state === 'probability_pending') ||
      (action === 'reopen_risk_review' && project.workflow?.state === 'risk_review_pending');

    if (!stillRelevant && state?.attempts) {
      await analysisRepository.clearRecoveryState({ analysisRunId: project.analysis_run_id, organizationId, action });
      await eventsService.emit({
        organizationId,
        analysisRunId: project.analysis_run_id,
        eventType: 'auto_recovery.recovered',
        severity: 'success',
        title: 'Proyecto recuperado',
        message: `La condición asociada a ${action} dejó de estar activa.`,
        target: project.workflow?.target || 'mission-control',
        payload: { action, attempts: state.attempts },
      });
    }
  }
}

module.exports = {
  DEFAULT_POLICY,
  SAFE_ACTIONS,
  backoffMs,
  recoveryCandidate,
  canAttempt,
  attemptRecovery,
  reconcileRecoverySuccess,
};
