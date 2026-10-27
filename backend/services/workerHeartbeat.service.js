const crypto = require('node:crypto');
function environment(value = process.env.BACKSTAGE_RUNTIME_ENV) {
  if (!['staging', 'production'].includes(value)) throw Error('BACKSTAGE_RUNTIME_ENV must be staging or production');
  return value;
}
function createWorkerHeartbeat({ database, env = process.env, now = Date.now, workerId = crypto.randomUUID() }) {
  const scope = environment(env.BACKSTAGE_RUNTIME_ENV);
  async function pulse() {
    const db = await database();
    await db.collection('soi_provider_locks').updateOne({ _id: `bco:worker-heartbeat:${scope}` }, { $set: {
      kind: 'bco_worker_heartbeat', environment: scope, worker_id: workerId,
      checked_at: new Date(now()), execution_mode: 'separate_process',
    } }, { upsert: true });
  }
  return { pulse };
}
module.exports = { createWorkerHeartbeat, environment };
