const crypto = require('node:crypto');
const { environment } = require('./workerHeartbeat.service');
const { transition, DEFAULTS } = require('../domain/monitorState');
const { currentActor } = require('./resourceAuthorization.service');
const ApiError = require('../utils/ApiError');
function monitorConfiguration(env) {
  const scope = environment(env.BACKSTAGE_RUNTIME_ENV);
  const origins = {};
  for (const name of ['api', 'web']) {
    const url = new URL(env[`MONITOR_${name.toUpperCase()}_ORIGIN`]);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Invalid monitor origin');
    origins[name] = url.origin;
  }
  if (!['true', 'false'].includes(env.MONITOR_EXPECT_PROTECTION)) throw Error('Set MONITOR_EXPECT_PROTECTION explicitly');
  const protectedHosting = env.MONITOR_EXPECT_PROTECTION === 'true';
  if (protectedHosting && !env.MONITOR_VERCEL_BYPASS) throw Error('Missing authorized hosting bypass');
  return { scope, origins, protectedHosting, bypass: env.MONITOR_VERCEL_BYPASS };
}
function createHostedMonitor({ infrastructure = require('../infrastructure/platformMongo'), env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const config = () => monitorConfiguration(env);
  async function probe(component, settings) {
    const started = performance.now(), url = `${settings.origins[component]}${component === 'web' ? '/api/health' : '/health'}`;
    try {
      const options = { redirect: 'error', signal: AbortSignal.timeout(8000) };
      const response = await fetchImpl(url, { ...options, headers: settings.protectedHosting ? { 'x-vercel-protection-bypass': settings.bypass } : {} });
      const raw = await response.text();
      if (Buffer.byteLength(raw) > 16384) throw Error('Invalid health response');
      const body = JSON.parse(raw);
      let protection = true;
      if (settings.protectedHosting) {
        const denied = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
        protection = [302, 401, 403].includes(denied.status);
      }
      const healthy = response.status === 200 && body.status === 'ok' && body.mongodb === 'healthy' && body.primaryStore === 'mongodb' && protection && Boolean(response.headers.get('x-request-id'));
      return { component, healthy, status: healthy ? 'healthy' : 'readiness_failure', http_status: response.status, latency_ms: Math.round(performance.now() - started) };
    } catch {
      return { component, healthy: false, status: 'probe_failed_or_timed_out', latency_ms: Math.round(performance.now() - started) };
    }
  }
  async function cycle() {
    const settings = config(), db = await infrastructure.getMongoDatabase(), collection = db.collection('soi_provider_locks');
    const id = `monitor:hosted-${settings.scope}`, owner = crypto.randomUUID();
    await collection.updateOne({ _id: id }, { $setOnInsert: { kind: 'hosted_operational_monitor', environment: settings.scope } }, { upsert: true });
    const claimed = await collection.findOneAndUpdate({ _id: id, $or: [{ lease_until: { $exists: false } }, { lease_until: { $lte: new Date(now()) } }] }, { $set: { lease_owner: owner, lease_until: new Date(now() + 45000) } }, { returnDocument: 'after', includeResultMetadata: false });
    if (!claimed) return { skipped: true, reason: 'another_monitor_cycle' };
    const samples = await Promise.all(['api', 'web'].map(component => probe(component, settings)));
    const heartbeat = await collection.findOne({ _id: `bco:worker-heartbeat:${settings.scope}` });
    const age = heartbeat?.checked_at ? now() - new Date(heartbeat.checked_at).getTime() : Infinity;
    samples.push({ component: 'computational_worker', healthy: Number.isFinite(age) && age >= 0 && age <= 60000, status: Number.isFinite(age) && age >= 0 && age <= 60000 ? 'heartbeat_recent' : 'heartbeat_missing_or_stale' });
    const checkedAt = new Date(now()).toISOString(), changed = transition(claimed, samples, DEFAULTS, checkedAt);
    const result = await collection.updateOne({ _id: id, lease_owner: owner, lease_until: { $gt: new Date(now()) } }, { $set: {
      checked_at: checkedAt, samples, incidents: changed.incidents,
      events: [...(claimed.events || []), ...changed.events].slice(-100),
      recipient_role: 'admin', requires_local_computer_and_signed_in_user: false,
      external_delivery: false,
    }, $unset: { lease_owner: '', lease_until: '' } });
    if (result.matchedCount !== 1) throw Error('Monitor lease lost');
    return { checked_at: checkedAt, healthy: samples.every(s => s.healthy), samples, new_events: changed.events };
  }
  async function read(context) {
    const db = await infrastructure.getMongoDatabase();
    const actor = await currentActor(db, undefined, context);
    if (actor.role !== 'admin') throw new ApiError(403, 'El monitoreo requiere un administrador vigente.');
    const scope = environment(env.BACKSTAGE_RUNTIME_ENV);
    const row = await db.collection('soi_provider_locks').findOne({ _id: `monitor:hosted-${scope}` });
    const age = row?.checked_at ? now() - Date.parse(row.checked_at) : Infinity;
    return { scope, recipient_role: 'admin', status: !row?.checked_at ? 'not_configured' : age < 0 || age > 180000 ? 'monitor_stale' : Object.values(row.incidents || {}).some(i => i.open) ? 'incident_open' : 'healthy',
      checked_at: row?.checked_at || null, incidents: row?.incidents || {}, events: (row?.events || []).slice(-20),
      external_delivery: false, requires_local_computer_and_signed_in_user: false };
  }
  return { cycle, read };
}
module.exports = { monitorConfiguration, createHostedMonitor };
