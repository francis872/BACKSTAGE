import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

function readRole() {
  try { return JSON.parse(window.localStorage.getItem('backstage_user') || '{}').role; } catch { return null; }
}

function SpatialDatasetAdmin({ revision = 0, onChanged }) {
  const canWrite = useMemo(() => ['admin', 'analyst'].includes(readRole()), []);
  const [sources, setSources] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [storage, setStorage] = useState(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const requests = [apiRequest('/spatial/sources'), apiRequest('/spatial/status')];
      if (canWrite) requests.push(apiRequest('/spatial/jobs'));
      const responses = await Promise.all(requests);
      const values = await Promise.all(responses.map((response) => response.json().then((data) => {
        if (!response.ok) throw new Error(data.error || 'No fue posible consultar el catálogo espacial.');
        return data;
      })));
      setSources(values[0]); setStorage(values[1]); setJobs(values[2] || []);
    } catch (error) { setMessage(error.message); }
  }, [canWrite]);

  useEffect(() => { load(); }, [load, revision]);

  const toggle = async (source) => {
    const status = source.status === 'archived' ? 'active' : 'archived';
    try {
      const response = await apiRequest(`/spatial/sources/${encodeURIComponent(source._id)}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible actualizar el dataset.');
      setMessage(`${source.dataset}: ${status === 'active' ? 'activo' : 'archivado'} (${data.affectedObjects} objetos).`);
      await load(); onChanged?.();
    } catch (error) { setMessage(error.message); }
  };

  return (
    <details className="card" style={{ marginBottom: 16 }}>
      <summary><strong>Catálogo y trazabilidad</strong></summary>
      <p className="auth-hint">
        Almacenamiento: {storage?.provider || '—'} · {storage?.persistent ? 'persistente' : 'temporal'}
        {storage && !storage.atlasConfigured ? ' · Atlas sin configurar' : ''}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Dataset</th><th>Proveedor</th><th>Versión</th><th>Licencia</th><th>Estado</th><th /></tr></thead>
          <tbody>{sources.map((source) => (
            <tr key={source._id}>
              <td>{source.dataset}</td><td>{source.provider}</td><td>{source.version}</td><td>{source.license}</td><td>{source.status}</td>
              <td>{canWrite && <button type="button" className="secondary" onClick={() => toggle(source)}>{source.status === 'archived' ? 'Activar' : 'Archivar'}</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {canWrite && <p className="auth-hint">Trabajos: {jobs.length} · completados {jobs.filter((job) => job.status === 'completed').length} · fallidos {jobs.filter((job) => job.status === 'failed').length}</p>}
      {message && <p className="message">{message}</p>}
    </details>
  );
}

export default SpatialDatasetAdmin;
