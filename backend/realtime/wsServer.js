const { URL } = require('url');
const WebSocket = require('ws');
const { verifyToken } = require('../auth');
const { subscribeSecurityEvents } = require('./securityEvents');

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

  server.on('upgrade', (request, socket, head) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(request.url, 'http://localhost');
    } catch (error) {
      socket.destroy();
      return;
    }

    if (parsedUrl.pathname !== '/ws/security') {
      socket.destroy();
      return;
    }

    const token = parsedUrl.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      verifyToken(token);
    } catch (error) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.send(JSON.stringify({
        event: 'security-channel-ready',
        data: { path: '/ws/security' },
      }));
      wss.emit('connection', ws, request);
    });
  });

  server.on('close', () => {
    unsubscribe();
    wss.close();
  });
}

module.exports = { attachSecurityWebSocketServer };
