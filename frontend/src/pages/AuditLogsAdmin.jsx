import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { getToken } from '../lib/auth';

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(base64 + padding);
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}

function getJwtState(token) {
  if (!token) {
    return { status: 'missing', label: 'Sin token' };
  }
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return { status: 'invalid', label: 'Token inválido' };
  }
  if (!payload.exp) {
    return { status: 'unknown', label: 'Expiración no disponible', payload };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const remainingSeconds = payload.exp - nowSeconds;
  if (remainingSeconds <= 0) {
    return { status: 'expired', label: 'Token expirado', payload, remainingSeconds };
  }
  if (remainingSeconds <= 900) {
    return { status: 'warning', label: 'Token por expirar', payload, remainingSeconds };
  }
  return { status: 'valid', label: 'Token vigente', payload, remainingSeconds };
}

function formatDateTime(value) {
  if (!value) {
    return 'N/D';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/D';
  }
  return date.toLocaleString();
}

function formatRemaining(remainingSeconds) {
  if (typeof remainingSeconds !== 'number') {
    return 'N/D';
  }
  const minutes = Math.floor(Math.abs(remainingSeconds) / 60);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const sign = remainingSeconds < 0 ? '-' : '';
  if (hours > 0) {
    return `${sign}${hours}h ${mins}m`;
  }
  return `${sign}${mins}m`;
}

function resolveSecurityWsUrl() {
  if (import.meta.env.VITE_SECURITY_WS_URL) {
    return import.meta.env.VITE_SECURITY_WS_URL;
  }

  const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
  if (!apiUrl || !apiUrl.startsWith('http')) {
    return null;
  }

  try {
    const parsed = new URL(apiUrl);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.pathname = '/ws/security';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch (error) {
    return null;
  }
}

export default function AuditLogsAdmin({ currentUser }) {
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [chainStatus, setChainStatus] = useState(null);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [wsState, setWsState] = useState({ status: 'idle', detail: 'Sin conexión activa' });
  const [lastEventAt, setLastEventAt] = useState(null);
  const latestSeenIdRef = useRef(0);

  const jwtState = getJwtState(getToken());
  const wsBaseUrl = useMemo(() => resolveSecurityWsUrl(), []);

  const appendSecurityEvent = (event, source) => {
    const eventId = Number(event.audit_log_id) || 0;
    if (eventId > latestSeenIdRef.current) {
      latestSeenIdRef.current = eventId;
    }

    const entry = {
      id: `${source}-${event.audit_log_id}-${event.created_at || Date.now()}`,
      source,
      action: event.action,
      targetType: event.target_type,
      targetId: event.target_id,
      actor: event.actor_email,
      createdAt: event.created_at,
      organizationId: event.organization_id,
    };
    setSecurityEvents((prev) => [entry, ...prev].slice(0, 40));
    setLastEventAt(entry.createdAt || new Date().toISOString());
  };

  const loadAuditLogs = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await apiRequest('/audit-logs?limit=100');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'No se pudieron consultar los logs de auditoría.');
      }
      const loadedRows = data.audit_logs || [];
      setRows(loadedRows);
      if (loadedRows.length > 0) {
        latestSeenIdRef.current = Math.max(latestSeenIdRef.current, Number(loadedRows[0].audit_log_id) || 0);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadChainStatus = async () => {
    try {
      const response = await apiRequest('/audit-logs/chain-status');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo validar la cadena hash.');
      }
      setChainStatus(data);
    } catch (error) {
      setChainStatus({ error: error.message });
    }
  };

  useEffect(() => {
    loadAuditLogs();
    loadChainStatus();
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setWsState({ status: 'missing-token', detail: 'Debes iniciar sesión para recibir eventos.' });
      return undefined;
    }
    if (!wsBaseUrl) {
      setWsState({ status: 'unsupported', detail: 'Configura VITE_SECURITY_WS_URL para monitoreo en vivo.' });
      return undefined;
    }

    const socket = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token)}`);
    setWsState({ status: 'connecting', detail: 'Conectando canal de seguridad...' });

    socket.onopen = () => {
      setWsState({ status: 'connected', detail: 'Canal de seguridad en vivo activo.' });
    };
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'audit-log-appended' && payload.data) {
          appendSecurityEvent(payload.data, 'ws');
        }
      } catch (error) {
        setWsState({ status: 'error', detail: 'Mensaje de seguridad no válido.' });
      }
    };
    socket.onerror = () => {
      setWsState({ status: 'error', detail: 'Fallo de conexión WebSocket. Activando seguimiento por sondeo.' });
    };
    socket.onclose = () => {
      setWsState((prev) =>
        prev.status === 'connected'
          ? { status: 'disconnected', detail: 'Canal desconectado. Operando con sondeo periódico.' }
          : prev
      );
    };

    return () => {
      socket.close();
    };
  }, [wsBaseUrl]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await apiRequest('/audit-logs?limit=8');
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'No se pudo sondear auditoría.');
        }
        const incoming = (data.audit_logs || []).filter(
          (item) => Number(item.audit_log_id) > latestSeenIdRef.current
        );
        incoming
          .slice()
          .reverse()
          .forEach((item) => appendSecurityEvent(item, 'poll'));
      } catch (error) {
        // Mensajes repetitivos de red no se muestran en pantalla para no degradar UX.
      }
    }, 20000);

    return () => clearInterval(interval);
  }, []);

  const chainStatusBadge = useMemo(() => {
    if (!chainStatus) {
      return { status: 'neutral', label: 'Validando...' };
    }
    if (chainStatus.error) {
      return { status: 'error', label: 'Sin acceso a estado de cadena' };
    }
    if (!chainStatus.chain_enabled) {
      return { status: 'warning', label: 'Cadena hash deshabilitada' };
    }
    if (chainStatus.valid) {
      return { status: 'ok', label: 'Cadena hash íntegra' };
    }
    return { status: 'error', label: 'Cadena hash inconsistente' };
  }, [chainStatus]);

  return (
    <section className="form-section">
      <h2>Auditoría y seguridad</h2>
      <p>Visibilidad operativa de identidad, trazabilidad criptográfica y eventos críticos.</p>

      <div className="security-grid">
        <article className="security-card">
          <h3>Estado de sesión (JWT)</h3>
          <p className={`status-pill jwt-${jwtState.status}`}>{jwtState.label}</p>
          <ul>
            <li>Usuario: {jwtState.payload?.email || currentUser?.email || 'N/D'}</li>
            <li>Rol: {jwtState.payload?.role || currentUser?.role || 'N/D'}</li>
            <li>Organización: {jwtState.payload?.organization_id || currentUser?.organization_id || 'N/D'}</li>
            <li>Expira: {formatDateTime(jwtState.payload?.exp ? jwtState.payload.exp * 1000 : null)}</li>
            <li>Tiempo restante: {formatRemaining(jwtState.remainingSeconds)}</li>
          </ul>
        </article>

        <article className="security-card">
          <h3>Integridad de audit_logs</h3>
          <p className={`status-pill chain-${chainStatusBadge.status}`}>{chainStatusBadge.label}</p>
          <ul>
            <li>Filas validadas: {chainStatus?.hashed_rows ?? 0}</li>
            <li>Filas legacy: {chainStatus?.skipped_legacy_rows ?? 0}</li>
            <li>Última validación: {formatDateTime(chainStatus?.evaluated_at)}</li>
          </ul>
          {chainStatus?.first_invalid && (
            <p className="message">
              Inconsistencia detectada en registro #{chainStatus.first_invalid.audit_log_id}.
            </p>
          )}
        </article>

        <article className="security-card">
          <h3>Canal de seguridad en vivo</h3>
          <p className={`status-pill ws-${wsState.status}`}>{wsState.detail}</p>
          <ul>
            <li>Fuente WebSocket: {wsBaseUrl || 'No configurada'}</li>
            <li>Último evento: {formatDateTime(lastEventAt)}</li>
            <li>Eventos recientes: {securityEvents.length}</li>
          </ul>
        </article>
      </div>

      <div className="form-actions security-actions">
        <button type="button" onClick={loadAuditLogs} disabled={loading}>
          {loading ? 'Actualizando...' : 'Actualizar auditoría'}
        </button>
        <button type="button" className="ghost-btn" onClick={loadChainStatus}>
          Revalidar cadena hash
        </button>
      </div>

      {message && <p className="message">{message}</p>}

      <div className="audit-live-feed">
        <h3>Eventos de seguridad recientes</h3>
        {securityEvents.length === 0 ? (
          <p className="message">Aún no hay eventos en vivo. Realiza una acción operativa para verificar el stream.</p>
        ) : (
          <ul>
            {securityEvents.map((event) => (
              <li key={event.id}>
                <strong>{event.action}</strong> · {event.targetType} #{event.targetId || 'N/D'} · {event.actor || 'N/D'} ·{' '}
                {formatDateTime(event.createdAt)}
                <span className={`feed-source feed-source-${event.source}`}>{event.source.toUpperCase()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h3>Historial completo</h3>
      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Actor</th>
              <th>Acción</th>
              <th>Objeto</th>
              <th>Org</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.audit_log_id}>
                <td>{row.audit_log_id}</td>
                <td>{new Date(row.created_at).toLocaleString()}</td>
                <td>{row.actor_email || row.actor_user_id}</td>
                <td>{row.action}</td>
                <td>
                  {row.target_type} #{row.target_id || '-'}
                </td>
                <td>{row.organization_id}</td>
                <td>{row.event_hash ? `${String(row.event_hash).slice(0, 10)}...` : 'legacy'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
