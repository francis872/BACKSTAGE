const { URL } = require('node:url');
const WebSocket = require('ws');
const { verifyToken } = require('../auth');
const organizationService = require('../services/organization.service');
const { subscribeSecurityEvents } = require('./securityEvents');
const { subscribeOperationalEvents } = require('./operationalEvents');

function attachSecurityWebSocketServer(server, {
  memberships = organizationService,
  verify = verifyToken,
  revalidateIntervalMs = 15000,
  authorizationTimeoutMs = 5000,
} = {}) {
  const wss = new WebSocket.Server({ noServer: true, clientTracking: true });
  const credentials = new WeakMap();
  const queues = new WeakMap();
  let disposed = false;

  async function authorized(token, channel, organizationId) {
    const claims = verify(token);
    if (!Number.isSafeInteger(Number(claims.sub)) || Number(claims.sub) <= 0
      || !Number.isSafeInteger(Number(organizationId)) || Number(organizationId) <= 0) throw new Error('Unauthorized');
    let timeout;
    try {
      const current = await Promise.race([
        memberships.getUserMemberships(Number(claims.sub), {session_version:claims.sv??0,session_id:claims.jti||null}),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Unavailable')), authorizationTimeoutMs); }),
      ]);
      // A lookup can outlive the token's validity. Verify again before accepting it.
      verify(token);
      const membership = memberships.resolveMembership(current, Number(organizationId));
      if (!(channel === 'security' ? ['admin'] : ['admin', 'analyst', 'viewer']).includes(membership.role)) throw new Error('Forbidden');
      return membership;
    } finally { clearTimeout(timeout); }
  }

  function enqueue(client, event, channel, send = true) {
    const previous = queues.get(client) || Promise.resolve();
    const work = previous.then(async () => {
      if (client.readyState !== WebSocket.OPEN) return;
      const credential = credentials.get(client);
      if (!credential) return client.close(1008, 'Access revoked');
      await authorized(credential.token, client.channel, client.organizationId);
      if (send && client.readyState === WebSocket.OPEN && client.channel === channel
        && Number(client.organizationId) === Number(event.organization_id)) {
        client.send(JSON.stringify({ event: channel === 'security' ? 'audit-log-appended' : 'operational-event', data: event }));
      }
    }).catch(() => { if (client.readyState === WebSocket.OPEN) client.close(1008, 'Access revoked'); });
    queues.set(client, work);
  }

  function publish(event, channel) {
    if (!Number.isSafeInteger(Number(event.organization_id)) || Number(event.organization_id) <= 0) return;
    for (const client of wss.clients) {
      if (client.channel === channel && Number(client.organizationId) === Number(event.organization_id)) enqueue(client, event, channel);
    }
  }
  const unsubscribeSecurity = subscribeSecurityEvents(event => publish(event, 'security'));
  const unsubscribeOperations = subscribeOperationalEvents(event => publish(event, 'operations'));
  const timer = setInterval(() => {
    for (const client of wss.clients) enqueue(client, null, null, false);
  }, Math.max(10, revalidateIntervalMs));
  timer.unref?.();

  const upgrade = async (request, socket, head) => {
    // Consume socket errors while asynchronous authorization is pending.
    const socketError = () => {};
    socket.on('error', socketError);
    try {
      const url = new URL(request.url, 'http://localhost');
      const channel = url.pathname === '/ws/security' ? 'security' : url.pathname === '/ws/operations' ? 'operations' : null;
      if (!channel) return socket.destroy();
      const header = request.headers.authorization;
      const token = typeof header === 'string' && /^Bearer \S+$/i.test(header) ? header.slice(7) : url.searchParams.get('token');
      if (!token) throw new Error('Unauthorized');
      const claims = verify(token);
      await authorized(token, channel, claims.organization_id);
      if (socket.destroyed || disposed) return socket.destroy();
      wss.handleUpgrade(request, socket, head, client => {
        client.channel = channel;
        client.organizationId = Number(claims.organization_id);
        credentials.set(client, { token });
        client.send(JSON.stringify({ event: channel === 'security' ? 'security-channel-ready' : 'operations-channel-ready', data: { path: url.pathname } }));
        wss.emit('connection', client, request);
      });
    } catch {
      if (!socket.destroyed) socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    } finally { socket.removeListener('error', socketError); }
  };
  server.on('upgrade', upgrade);
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearInterval(timer);
    unsubscribeSecurity(); unsubscribeOperations();
    server.removeListener('upgrade', upgrade);
    for (const client of wss.clients) client.terminate();
    wss.close();
  }
  server.once('close', dispose);
  return { close: dispose };
}
module.exports = { attachSecurityWebSocketServer };
