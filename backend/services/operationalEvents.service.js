const ApiError = require('../utils/ApiError');
const repository = require('../repositories/operationalEvents.repository');
const { publishOperationalEvent } = require('../realtime/operationalEvents');

const ALLOWED_SEVERITIES = new Set(['info', 'success', 'warning', 'critical']);

async function emit(input) {
  if (!input?.organizationId || !input?.eventType || !input?.title) {
    throw new ApiError(500, 'Evento operacional incompleto.');
  }
  const event = await repository.emitEvent({
    ...input,
    severity: ALLOWED_SEVERITIES.has(input.severity) ? input.severity : 'info',
  });
  publishOperationalEvent(event);
  return event;
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

async function acknowledge(eventId, sessionUser, organizationContext) {
  const organizationId = organizationContext?.organization_id || sessionUser?.organization_id;
  if (!organizationId) throw new ApiError(403, 'No hay organización activa.');
  const row = await repository.acknowledgeEvent({ eventId, organizationId, userId: sessionUser?.user_id });
  if (!row) throw new ApiError(404, 'Alerta no encontrada.');
  return row;
}

async function resolve(eventId, sessionUser, organizationContext) {
  const organizationId = organizationContext?.organization_id || sessionUser?.organization_id;
  if (!organizationId) throw new ApiError(403, 'No hay organización activa.');
  const row = await repository.resolveEvent({ eventId, organizationId, userId: sessionUser?.user_id });
  if (!row) throw new ApiError(404, 'Alerta no encontrada.');
  return row;
}

module.exports = { emit, list, alerts, summary, acknowledge, resolve };
