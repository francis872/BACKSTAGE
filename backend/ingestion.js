const { query } = require('./db');

async function registerIntegrationSource(name, type, config = {}) {
  const result = await query(
    `INSERT INTO integration_sources (name, type, config)
     VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE SET config = EXCLUDED.config, enabled = TRUE
     RETURNING *`,
    [name, type, config]
  );
  return result.rows[0];
}

async function recordIntegrationEvent(sourceId, externalId, payload) {
  const result = await query(
    `INSERT INTO integration_events (source_id, external_id, payload, status)
     VALUES ($1, $2, $3, 'pending') RETURNING *`,
    [sourceId, externalId, payload]
  );
  return result.rows[0];
}

async function markEventProcessed(eventId, status = 'processed') {
  await query(
    `UPDATE integration_events SET processed_at = now(), status = $2 WHERE event_id = $1`,
    [eventId, status]
  );
}

async function getPendingEvents(limit = 100) {
  const result = await query(
    `SELECT * FROM integration_events WHERE status = 'pending' ORDER BY received_at ASC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

module.exports = {
  registerIntegrationSource,
  recordIntegrationEvent,
  markEventProcessed,
  getPendingEvents,
};
