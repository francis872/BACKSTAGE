const { setTimeout: delay } = require('node:timers/promises');
const { createHostedMonitor, monitorConfiguration } = require('../services/hostedMonitor.service');
const mongo = require('../infrastructure/platformMongo');
async function main() {
  require('../domain/deploymentTarget').assertRuntimeTarget(process.env);
  monitorConfiguration(process.env);
  const stop = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop.abort());
  const service = createHostedMonitor();
  do {
    try {
      const result = await service.cycle();
      console.log(JSON.stringify({ event: 'monitor.cycle', healthy: result.healthy ?? null, skipped: result.skipped || false }));
      if (process.argv.includes('--once')) { if (result.healthy === false) process.exitCode = 1; break; }
    } catch {
      console.error(JSON.stringify({ event: 'monitor.failed', code: 'MONITOR_OR_STORE_UNAVAILABLE' }));
      if (process.argv.includes('--once')) { process.exitCode = 1; break; }
    }
    try { await delay(60000, undefined, { signal: stop.signal }); } catch { break; }
  } while (!stop.signal.aborted);
}
if (require.main === module) main().catch(() => { console.error(JSON.stringify({ event: 'monitor.failed', code: 'INVALID_MONITOR_CONFIGURATION' })); process.exitCode = 1; }).finally(mongo.closeMongoConnection);
module.exports = { main };
