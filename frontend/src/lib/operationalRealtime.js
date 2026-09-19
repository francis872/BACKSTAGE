import { getToken } from './auth';

function websocketUrl(path) {
  const configured = import.meta.env.VITE_WS_BASE_URL;
  if (configured) return `${configured.replace(/\/$/, '')}${path}`;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

export function connectOperationalRealtime({ onEvent, onStatus }) {
  const token = getToken();
  if (!token) return () => {};

  let socket;
  let retryTimer;
  let closed = false;

  const connect = () => {
    if (closed) return;
    socket = new WebSocket(websocketUrl(`/ws/operations?token=${encodeURIComponent(token)}`));
    socket.onopen = () => onStatus?.('connected');
    socket.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data);
        if (payload.event === 'operational-event') onEvent?.(payload.data);
      } catch {
        // Ignore malformed realtime frames.
      }
    };
    socket.onerror = () => onStatus?.('error');
    socket.onclose = () => {
      onStatus?.('disconnected');
      if (!closed) retryTimer = window.setTimeout(connect, 3000);
    };
  };

  connect();
  return () => {
    closed = true;
    if (retryTimer) window.clearTimeout(retryTimer);
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  };
}
