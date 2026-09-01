const ApiError = require('../utils/ApiError');
const {
  registerIntegrationSource,
  recordIntegrationEvent,
  getPendingEvents,
  markEventProcessed,
} = require('../ingestion');

async function registerSource(name, type, config) {
  if (!name || !type) {
    throw new ApiError(400, 'name y type son requeridos.');
  }
  return registerIntegrationSource(name, type, config || {});
}

async function recordEvent(sourceId, externalId, payload) {
  if (!sourceId) {
    throw new ApiError(400, 'source_id es requerido.');
  }
  return recordIntegrationEvent(sourceId, externalId, payload || {});
}

async function listPending(limit = 100) {
  return getPendingEvents(limit);
}

async function completeEvent(eventId) {
  await markEventProcessed(eventId, 'processed');
  return { event_id: eventId, status: 'processed' };
}

module.exports = { registerSource, recordEvent, listPending, completeEvent };
