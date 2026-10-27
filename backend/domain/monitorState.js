// Shared incident transitions; no persistence or deployment credentials.
const DEFAULTS = Object.freeze({ interval_minutes: 5, timeout_ms: 8000, latency_warning_ms: 2000, failures_to_open: 2, successes_to_resolve: 2, history_limit: 288, alert_destination: 'local_private_incident_journal', external_delivery: false });
function transition(previous = {}, samples, config = DEFAULTS, timestamp = new Date().toISOString()) {
  const incidents = { ...(previous.incidents || {}) }, events = [];
  for (const sample of samples) {
    const old = incidents[sample.component] || { failures: 0, successes: 0, open: false };
    const failed = !sample.healthy, failures = failed ? old.failures + 1 : 0, successes = failed ? 0 : old.successes + 1;
    const open = old.open ? successes < config.successes_to_resolve : failures >= config.failures_to_open;
    if (open !== old.open) events.push({ component: sample.component, event: open ? 'incident.opened' : 'incident.resolved', at: timestamp, severity: open ? 'critical' : 'info' });
    incidents[sample.component] = { failures, successes, open, last_status: sample.status, last_checked_at: timestamp, ...(open ? { opened_at: old.opened_at || timestamp } : {}) };
  }
  return { incidents, events };
}
module.exports = { transition, DEFAULTS };
