const { URL } = require('url');
const WebSocket = require('ws');
const { verifyToken } = require('../auth');
const { subscribeSecurityEvents } = require('./securityEvents');
const { subscribeOperationalEvents } = require('./operationalEvents');

function createPayload(event) {
  return JSON.stringify({
    event: 'audit-log-appended',
    data: event,
  });
}

function attachSecurityWebSocketServer(server) {
  const wss = new WebSocket.Server({
    noServer: true,
    clientTracking: true,
  });

  const unsubscribe = subscribeSecurityEvents((event) => {
    const payload = createPayload(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  });

  const unsubscribeOperational = subscribeOperationalEvents((event) => {
    const payload = JSON.stringify({ event: 'operational-event', data: event });
    for (const client of wss.clients) {
      if (
        client.readyState === WebSocket.OPEN &&
        client.channel === 'operations' &&
        Number(client.organizationId) === Number(event.organization_id)
      ) {
        client.send(payload);
      }
    }
  });

  server.on('upgrade', (request, socket, head) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(request.url, 'http://localhost');
    } catch (error) {
      socket.destroy();
      return;
    }

    const isSecurityChannel = parsedUrl.pathname === '/ws/security';
    const isOperationsChannel = parsedUrl.pathname === '/ws/operations';
    if (!isSecurityChannel && !isOperationsChannel) {
      socket.destroy();
      return;
    }

    const token = parsedUrl.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let tokenPayload;
    try {
      tokenPayload = verifyToken(token);
    } catch (error) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.channel = isOperationsChannel ? 'operations' : 'security';
      ws.organizationId = tokenPayload.organization_id || null;
      ws.send(JSON.stringify({
        event: isOperationsChannel ? 'operations-channel-ready' : 'security-channel-ready',
        data: { path: isOperationsChannel ? '/ws/operations' : '/ws/security' },
      }));
      wss.emit('connection', ws, request);
    });
  });

  server.on('close', () => {
    unsubscribe();
    unsubscribeOperational();
    wss.close();
  });
}

module.exports = { attachSecurityWebSocketServer };
