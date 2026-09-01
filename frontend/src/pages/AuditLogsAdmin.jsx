import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

function AuditLogsAdmin() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/audit-logs?limit=120');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el log de auditoría.');
      setRows(Array.isArray(data) ? data : []);
      setMessage('');
    } catch (error) {
      setRows([]);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  return (
    <section>
      <h2>Auditoría de acciones</h2>
      <p>Registro de escrituras y eliminaciones para trazabilidad operativa.</p>
      <div className="form-actions">
        <button type="button" onClick={loadAuditLogs}>Actualizar</button>
      </div>
      {message && <p className="message">{message}</p>}
      {loading ? (
        <p>Cargando logs...</p>
      ) : (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Acción</th>
                <th>Recurso</th>
                <th>Método</th>
                <th>Status</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.audit_log_id}>
                  <td>{new Date(row.created_at).toLocaleString('es-CO')}</td>
                  <td>{row.action}</td>
                  <td>{row.resource_type}{row.resource_id ? `/${row.resource_id}` : ''}</td>
                  <td>{row.request_method}</td>
                  <td>{row.status_code}</td>
                  <td>{row.user_id ?? 'sistema'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default AuditLogsAdmin;

