import { useState } from 'react';
import { apiRequest } from '../lib/api';
import { getSessionUser } from '../lib/auth';
import AnalyticsEvidence from './AnalyticsEvidence';
import rules from '../../../shared/spatialRules.v1.json';

export default function SpatialAnalysisPanel({ projectId }) {
  const [method, setMethod] = useState('distance_matrix'), [coordinates, setCoordinates] = useState(''), [point, setPoint] = useState(''), [source, setSource] = useState('');
  const [result, setResult] = useState(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const canWrite = ['admin', 'analyst'].includes(getSessionUser()?.role);
  const submit = async e => {
    e.preventDefault(); setBusy(true); setResult(null); setMessage('');
    try {
      const values = JSON.parse(coordinates);
      const payload = { algorithm: method, crs: 'OGC:CRS84', coordinate_order: 'longitude_latitude', source: { name: source, data_type: 'ORGANIZATION_PROVIDED' }, ...(method === 'distance_matrix' ? { coordinates: values } : { point: JSON.parse(point), ring: values }), ...(projectId ? { analysis_run_id: projectId } : {}) };
      const r = await apiRequest('/analytics/gis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await r.json(); if (!r.ok) throw Error(data.error || 'No se pudo calcular GIS.'); setResult(data); setRevision(v => v + 1); setMessage(`Análisis GIS #${data.analytics_job_id} guardado${projectId ? ` en el proyecto #${projectId}` : ' en la organización activa'}.`);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <details className="form-section spatial-analysis-panel">
    <summary><strong>Análisis GIS reproducible</strong></summary>
    <p className="auth-hint">Coordenadas WGS84, orden [longitud, latitud], grados. La distancia es esférica; no representa una ruta vial ni GPS. La contención usa un anillo planar simple, sin certificar su validez topológica.</p>
    <details><summary>Reglas de negocio aplicadas · {rules.version}</summary>{rules.rules.map(rule => <p className="auth-hint" key={rule.id}>{rule.rule}</p>)}</details>
    {canWrite && <form className="entity-form" onSubmit={submit}>
      <div className="field-row"><label htmlFor="gis-method">Cálculo</label><select id="gis-method" value={method} onChange={e => setMethod(e.target.value)}><option value="distance_matrix">Matriz de distancias esféricas</option><option value="point_in_polygon">Contención de un punto en un anillo</option></select></div>
      <div className="field-row"><label htmlFor="gis-coordinates">{method === 'distance_matrix' ? 'Lista JSON de coordenadas [longitud, latitud]' : 'Anillo JSON cerrado de coordenadas'}</label><textarea id="gis-coordinates" required rows="4" value={coordinates} onChange={e => setCoordinates(e.target.value)} /></div>
      {method === 'point_in_polygon' && <div className="field-row"><label htmlFor="gis-point">Punto JSON [longitud, latitud]</label><input id="gis-point" required value={point} onChange={e => setPoint(e.target.value)} /></div>}
      <div className="field-row"><label htmlFor="gis-source">Fuente de las coordenadas</label><input id="gis-source" required maxLength="2000" value={source} onChange={e => setSource(e.target.value)} /></div>
      <button disabled={busy}>{busy ? 'Calculando…' : 'Calcular y guardar GIS'}</button>
    </form>}
    {message && <p className="message" role="status">{message}</p>}
    {result && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11 }}>{JSON.stringify(result.result, null, 2)}</pre>}
    <AnalyticsEvidence projectId={projectId} category="gis." refreshKey={revision} />
  </details>;
}
