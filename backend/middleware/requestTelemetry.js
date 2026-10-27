// Route patterns and request IDs only. Never log URLs, queries, credentials or bodies.
function requestTelemetry({ write = line => console.log(line), now = () => performance.now() } = {}) {
  return (req, res, next) => {
    const started = now();
    res.once('finish', () => {
      const route = typeof req.route?.path === 'string' ? `${req.baseUrl || ''}${req.route.path}` : 'unmatched';
      write(JSON.stringify({ event: 'http.completed', request_id: req.requestId || null,
        method: req.method, route, status: res.statusCode, duration_ms: Math.max(0, Math.round((now() - started) * 100) / 100) }));
    });
    next();
  };
}
async function readinessResponse(req, res, getDatabase) {
  let healthy = false;
  try { await (await getDatabase()).command({ ping: 1, maxTimeMS: 3000 }); healthy = true; } catch {}
  return res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'unavailable', mongodb: healthy ? 'healthy' : 'unavailable',
    primaryStore: 'mongodb', spatialStore: 'atlas', service: 'BACKSTAGE Intelligence Backend' });
}
module.exports = { requestTelemetry, readinessResponse };
