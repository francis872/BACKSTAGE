const ApiError = require('../utils/ApiError');
const repository = require('../repositories/operationalEvents.repository');

const ALLOWED_SEVERITIES = new Set(['info', 'success', 'warning', 'critical']);

async function emit(input) {
  if (!input?.organizationId || !input?.eventType || !input?.title) {
    throw new ApiError(500, 'Evento operacional incompleto.');
  }
  return repository.emitEvent({
    ...input,
    severity: ALLOWED_SEVERITIES.has(input.severity) ? input.severity : 'info',
  });
}

async function list(organizationId, options = {}) {
  if (!organizationId) throw new ApiError(403, 'No hay organización activa.');
  return repository.listEvents({ organizationId, ...options });
}

async function alerts(organizationId, limit = 20) {
  if (!organizationId) throw new ApiError(403, 'No hay organización activa.');
  const events = await repository.listEvents({ organizationId, limit: Math.min(Number(limit) || 20, 100) });
  return events.filter((event) => event.severity === 'warning' || event.severity === 'critical');
}

async function summary(organizationId) {
  if (!organizationId) throw new ApiError(403, 'No hay organización activa.');
  return repository.getAlertSummary({ organizationId });
}

module.exports = { emit, list, alerts, summary };
