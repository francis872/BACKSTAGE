import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

const statuses = { verified: 'Reproducción verificada', legacy_replayed: 'Cálculo histórico repetido; sin huellas de origen', mismatch: 'El registro no coincide', engine_changed: 'Las fuentes o versión del motor cambiaron', unsupported_version: 'Versión no disponible', invalid_snapshot: 'Registro inválido', missing_contract: 'Falta el contrato original' };
export default function AnalyticsEvidence({ projectId, category, refreshKey = 0 }) {
  const [jobs, setJobs] = useState([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true; setJobs([]); setMessage('');
    apiRequest(`/analytics/jobs?limit=30${projectId ? `&project_id=${encodeURIComponent(projectId)}` : ''}`)
      .then(async r => { const data = await r.json(); if (!r.ok) throw Error(data.error || 'No se pudo cargar la evidencia.'); if (active) setJobs(Array.isArray(data) ? data.filter(j => j.algorithm_name?.startsWith(category) && j.status === 'succeeded') : []); })
      .catch(e => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, [projectId, category, refreshKey]);
  const action = async (job, download) => {
    setBusy(true); setMessage('');
    try {
      const r = await apiRequest(`/analytics/jobs/${job.analytics_job_id}/${download ? 'export' : 'reproducibility'}`);
      const data = await r.json(); if (!r.ok) throw Error(data.error || 'No se pudo comprobar la ejecución.');
      const report = download ? data.verification : data;
      setMessage(statuses[report.status] || `Comprobación: ${report.status}`);
      if (download) { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `backstage-analisis-${job.analytics_job_id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  return <details className="form-section analytics-evidence">
    <summary><strong>Evidencia {category === 'financial.' ? 'financiera' : category === 'gis.' ? 'geográfica' : 'de simulación'} guardada{projectId ? ` · proyecto #${projectId}` : ' · organización activa'}</strong></summary>
    {jobs.length === 0 && <p className="auth-hint">Sin ejecuciones guardadas en este contexto.</p>}
    {jobs.map(job => <article className="card" key={job.analytics_job_id}>
      <h4>#{job.analytics_job_id} · {job.algorithm_name}</h4>
      <p>{job.algorithm_version} · {job.params?.currency || job.params?.unit || 'Unidad no declarada'} · periodo: {job.params?.period || 'no declarado'}</p>
      <p className="auth-hint">{job.analysis?.uncertainty?.note || 'Registro histórico; sin contrato de integridad de origen.'}</p>
      {job.analysis && <p className="auth-hint" style={{ overflowWrap: 'anywhere' }}>Huella: {job.analysis.manifest_sha256}</p>}
      <details><summary>Entradas y resultado conservados</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11 }}>{JSON.stringify({ inputs: job.params, result: job.result }, null, 2)}</pre></details>
      <div className="form-actions"><button type="button" disabled={busy} onClick={() => action(job, false)}>Comprobar ejecución #{job.analytics_job_id}</button><button type="button" className="secondary" disabled={busy} onClick={() => action(job, true)}>Descargar análisis #{job.analytics_job_id}</button></div>
    </article>)}
    {message && <p role="status" className="message">{message}</p>}
  </details>;
}
