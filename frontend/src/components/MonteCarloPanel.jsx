import { useState } from 'react';
import { apiRequest } from '../lib/api';
import AnalyticsEvidence from './AnalyticsEvidence';
import { getSessionUser } from '../lib/auth';

export default function MonteCarloPanel({ projectId }) {
  const [form, setForm] = useState({ factors: '', seed: '42', iterations: '10000', unit: '', source: '' });
  const [result, setResult] = useState(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const canRun = ['admin', 'analyst'].includes(getSessionUser()?.role);
  const change = e => setForm(v => ({ ...v, [e.target.name]: e.target.value }));
  const submit = async e => {
    e.preventDefault(); setBusy(true); setMessage(''); setResult(null);
    try {
      const factors = Object.create(null), factorWeights = Object.create(null);
      const lines = form.factors.trim().split(/\n/);
      for (const line of lines) {
        const parts = line.split(';').map(v => v.trim());
        if (parts.length !== 4 || parts.some(v => !v) || Object.hasOwn(factors, parts[0])) throw Error('Cada línea requiere nombre;media;desviación;peso, sin duplicados.');
        factors[parts[0]] = { mean: Number(parts[1]), stdDev: Number(parts[2]) }; factorWeights[parts[0]] = Number(parts[3]);
      }
      const r = await apiRequest('/analytics/risk-simulation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ algorithm: 'monte_carlo', factors, factorWeights, seed: Number(form.seed), iterations: Number(form.iterations), unit: form.unit, source: form.source, data_type: 'SIMULATED', assumptions: ['Factores normales independientes; suma ponderada; sin truncamiento ni correlaciones estimadas.'], ...(projectId ? { analysis_run_id: projectId } : {}) }) });
      const data = await r.json(); if (!r.ok) throw Error(data.error || 'No se pudo ejecutar la simulación.');
      setResult(data); setRevision(v => v + 1);
      setMessage(`Simulación #${data.analytics_job_id} guardada${projectId ? ` en el proyecto #${projectId}` : ' en la organización activa'}.`);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <article className="form-section monte-carlo-panel">
    <h3>Simulación reproducible de escenarios</h3>
    <p className="auth-hint">Introduce tus factores con distribución normal independiente, en la misma unidad. El resultado es una suma ponderada simulada. P5, P50 y P95 no son intervalos de confianza ni mediciones; una normal puede generar valores negativos.</p>
    {canRun && <form className="entity-form" onSubmit={submit}>
      <div className="field-row"><label htmlFor="mc-factors">Factores: nombre;media;desviación;peso (una línea por factor)</label><textarea id="mc-factors" name="factors" rows="4" required value={form.factors} onChange={change} placeholder="Introduce factores propios" /></div>
      <div className="field-row"><label htmlFor="mc-unit">Unidad común</label><input id="mc-unit" name="unit" required maxLength="100" value={form.unit} onChange={change} /></div>
      <div className="field-row"><label htmlFor="mc-source">Fuente de los parámetros</label><input id="mc-source" name="source" required maxLength="2000" value={form.source} onChange={change} /></div>
      <div className="field-row"><label htmlFor="mc-seed">Semilla</label><input id="mc-seed" name="seed" type="number" min="0" max="4294967295" step="1" required value={form.seed} onChange={change} /></div>
      <div className="field-row"><label htmlFor="mc-iterations">Iteraciones</label><input id="mc-iterations" name="iterations" type="number" min="100" max="200000" step="1" required value={form.iterations} onChange={change} /></div>
      <button type="submit" disabled={busy}>{busy ? 'Simulando…' : 'Ejecutar y guardar simulación'}</button>
    </form>}
    {result && <div className="metric-grid">{['mean', 'stdDev', 'p5', 'p50', 'p95'].map(k => <article className="metric-card" key={k}><span>{({ mean: 'Media', stdDev: 'Desviación', p5: 'P5', p50: 'P50', p95: 'P95' })[k]}</span><strong>{result.result[k]}</strong></article>)}</div>}
    {message && <p className="message" role="status">{message}</p>}
    <AnalyticsEvidence projectId={projectId} category="risk.monte_carlo" refreshKey={revision} />
  </article>;
}
