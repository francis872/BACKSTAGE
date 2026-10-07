import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

const currency = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
});

const initialForm = {
  location_id: '',
  flood_risk: '',
  landslide_risk: '',
  crime_risk: '',
  climate_exposure: '',
  data_mode: 'declared',
  confidence: '',
  notes: '',
};

function RiskSimulationPanel({ row, onClose }) {
  const [impactCost, setImpactCost] = useState('');
  const [iterations, setIterations] = useState('5000');
  const [seed, setSeed] = useState('42');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const components = {
    flood_risk: Number(row.flood_risk) || 0,
    landslide_risk: Number(row.landslide_risk) || 0,
    crime_risk: Number(row.crime_risk) || 0,
    climate_exposure: Number(row.climate_exposure) || 0,
  };

  const runSimulation = async (event) => {
    event.preventDefault();
    setError('');
    setResult(null);
    const cost = Number(impactCost);
    if (!cost || cost <= 0) {
      setError('Indica un costo de impacto estimado mayor a 0.');
      return;
    }
    setLoading(true);
    try {
      // Each documented risk indicator (0-1) is treated as an independent
      // factor with a standard deviation of 15% of its value (assumption,
      // shown to the user), and the simulated outcome is the average of
      // the four sampled indicators times the user-provided impact cost.
      const factors = Object.fromEntries(
        Object.entries(components).map(([key, mean]) => [key, { mean, stdDev: Math.max(mean * 0.15, 0.01) }])
      );
      const res = await apiRequest('/analytics/risk-simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          algorithm: 'monte_carlo',
          factors,
          factorWeights: { flood_risk: 0.25, landslide_risk: 0.25, crime_risk: 0.25, climate_exposure: 0.25 },
          iterations: Number(iterations),
          seed: Number(seed),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo ejecutar la simulación.');
      // The engine returns a fraction-in-[0,1]-like combined indicator;
      // scale by impact cost client-side for the currency display.
      const scaled = {
        ...data.result,
        p5: data.result.p5 * cost,
        p50: data.result.p50 * cost,
        p95: data.result.p95 * cost,
        mean: data.result.mean * cost,
      };
      setResult({ ...data, result: scaled });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="financial-panel">
      <div className="score-row">
        <h4>Simulación Monte Carlo de pérdida esperada</h4>
        <button type="button" className="secondary" onClick={onClose}>Cerrar</button>
      </div>
      <p className="auth-hint">
        Indicadores base: inundación {components.flood_risk}, deslizamiento {components.landslide_risk},
        crimen {components.crime_risk}, clima {components.climate_exposure} (cada uno simulado con
        desviación estándar del 15% de su valor, semilla reproducible).
      </p>
      <form className="entity-form" onSubmit={runSimulation}>
        <div className="field-row">
          <label>Costo de impacto estimado (COP)</label>
          <input type="number" value={impactCost} onChange={(e) => setImpactCost(e.target.value)} required />
        </div>
        <div className="field-row">
          <label>Iteraciones</label>
          <input type="number" min="100" max="200000" value={iterations} onChange={(e) => setIterations(e.target.value)} />
        </div>
        <div className="field-row">
          <label>Semilla (reproducibilidad)</label>
          <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="submit" disabled={loading}>{loading ? 'Simulando...' : 'Simular'}</button>
        </div>
      </form>
      {error && <p className="message">{error}</p>}
      {result && (
        <div className="metric-grid">
          <article className="metric-card"><span>P5 (optimista)</span><strong>{currency.format(result.result.p5)}</strong></article>
          <article className="metric-card"><span>P50 (mediana)</span><strong>{currency.format(result.result.p50)}</strong></article>
          <article className="metric-card"><span>P95 (adverso)</span><strong>{currency.format(result.result.p95)}</strong></article>
          <article className="metric-card"><span>Pérdida esperada (media)</span><strong>{currency.format(result.result.mean)}</strong></article>
          <article className="metric-card"><span>Ejecución registrada</span><strong>#{result.analytics_job_id}</strong></article>
        </div>
      )}
    </div>
  );
}

function RiskAssessments({ operationalContext, onNavigate }) {
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [simulatingId, setSimulatingId] = useState(null);
  const [severityFilter, setSeverityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [projectRisk, setProjectRisk] = useState(null);
  const [reviewingProject, setReviewingProject] = useState(false);

  const enrichedRows = useMemo(() => rows.map((row) => {
    const indicators = [row.flood_risk, row.landslide_risk, row.crime_risk, row.climate_exposure]
      .map((v) => Number(v))
      .filter((v) => !Number.isNaN(v));
    const avgRisk = indicators.length > 0 ? indicators.reduce((acc, v) => acc + v, 0) / indicators.length : null;
    let severity = 'unknown';
    if (avgRisk != null) {
      if (avgRisk >= 0.7) severity = 'critical';
      else if (avgRisk >= 0.4) severity = 'high';
      else if (avgRisk >= 0.2) severity = 'moderate';
      else severity = 'low';
    }
    return { ...row, avgRisk, severity };
  }), [rows]);

  const summary = useMemo(() => {
    const withRisk = enrichedRows.filter((r) => r.avgRisk != null);
    const avg = withRisk.length > 0 ? withRisk.reduce((acc, r) => acc + r.avgRisk, 0) / withRisk.length : 0;
    return {
      total: enrichedRows.length,
      critical: enrichedRows.filter((r) => r.severity === 'critical').length,
      high: enrichedRows.filter((r) => r.severity === 'high').length,
      moderate: enrichedRows.filter((r) => r.severity === 'moderate').length,
      low: enrichedRows.filter((r) => r.severity === 'low').length,
      avgRiskPct: Number((avg * 100).toFixed(1)),
    };
  }, [enrichedRows]);

  const visibleRows = enrichedRows.filter((row) => {
    const matchesSeverity = !severityFilter || row.severity === severityFilter;
    const text = `${row.location_name || ''} ${row.city || ''}`.toLowerCase();
    return matchesSeverity && text.includes(search.trim().toLowerCase());
  });

  const openDetail = async (row) => {
    setSelectedAssessment(row); setHistoryLoading(true); setHistory([]);
    try {
      const response = await apiRequest(`/risk-assessments/locations/${row.location_id}/history`);
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo cargar el historial.');
      setHistory(data);
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setHistoryLoading(false); }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [assessmentsRes, locationsRes] = await Promise.all([
        apiRequest('/risk-assessments'),
        apiRequest('/locations'),
      ]);
      const [assessmentsData, locationsData] = await Promise.all([assessmentsRes.json(), locationsRes.json()]);
      setRows(assessmentsData);
      setLocations(locationsData);
      setMessage('');
    } catch {
      setRows([]);
      setMessage('No se pudieron cargar las evaluaciones de riesgo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);


  useEffect(() => {
    if (!operationalContext?.analysis_run_id) {
      setProjectRisk(null);
      return;
    }
    apiRequest(`/analysis/${operationalContext.analysis_run_id}/risks`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'No se pudo cargar el riesgo operativo.');
        setProjectRisk(data);
      })
      .catch((error) => setMessage(`Error: ${error.message}`));
  }, [operationalContext?.analysis_run_id]);

  const confirmProjectRiskReview = async () => {
    if (!operationalContext?.analysis_run_id) return;
    setReviewingProject(true);
    setMessage('');
    try {
      const res = await apiRequest(`/analysis/${operationalContext.analysis_run_id}/risks/review`, { method: 'PUT' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cerrar la revisión de riesgos.');
      setProjectRisk(data);
      setMessage('Revisión de riesgos registrada en el proyecto.');
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setReviewingProject(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const reset = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      location_id: Number(form.location_id),
      flood_risk: form.flood_risk ? Number(form.flood_risk) : null,
      landslide_risk: form.landslide_risk ? Number(form.landslide_risk) : null,
      crime_risk: form.crime_risk ? Number(form.crime_risk) : null,
      climate_exposure: form.climate_exposure ? Number(form.climate_exposure) : null,
      data_mode: form.data_mode,
      confidence: form.confidence === '' ? null : Number(form.confidence),
      notes: form.notes,
    };
    try {
      const path = editingId ? `/risk-assessments/${editingId}` : '/risk-assessments';
      const method = editingId ? 'PUT' : 'POST';
      const res = await apiRequest(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en el servidor');
      setMessage(editingId ? 'Evaluación actualizada correctamente.' : 'Evaluación creada correctamente.');
      reset();
      loadData();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const startEdit = (row) => {
    setEditingId(row.risk_id);
    setForm({
      location_id: row.location_id ?? '',
      flood_risk: row.flood_risk ?? '',
      landslide_risk: row.landslide_risk ?? '',
      crime_risk: row.crime_risk ?? '',
      climate_exposure: row.climate_exposure ?? '',
      data_mode: row.details?.data_mode ?? 'declared',
      confidence: row.details?.confidence ?? '',
      notes: row.details?.notes ?? '',
    });
  };

  const remove = async (id) => {
    if (!window.confirm('¿Eliminar esta evaluación de riesgo?')) return;
    try {
      const res = await apiRequest(`/risk-assessments/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en el servidor');
      setMessage('Evaluación eliminada correctamente.');
      loadData();
      reset();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <section>
      <h2>Evaluaciones de Riesgo</h2>

      <div className="metric-grid">
        <article className="metric-card"><span>Total evaluaciones</span><strong>{summary.total}</strong></article>
        <article className="metric-card"><span>Riesgo promedio</span><strong>{summary.avgRiskPct}%</strong></article>
        <article className="metric-card"><span>Críticos</span><strong>{summary.critical}</strong></article>
        <article className="metric-card"><span>Altos</span><strong>{summary.high}</strong></article>
        <article className="metric-card"><span>Moderados</span><strong>{summary.moderate}</strong></article>
        <article className="metric-card"><span>Bajos</span><strong>{summary.low}</strong></article>
      </div>
      <p className="auth-hint">
        Riesgo = promedio reproducible de los cuatro indicadores. Bandas operativas: bajo &lt;20%, moderado 20–40%, alto 40–70%, crítico ≥70%; no son umbrales universales.
      </p>

      {operationalContext?.analysis_run_id && (
        <div className="form-section">
          <p className="eyebrow">Proyecto operativo activo</p>
          <h3>{operationalContext.project_name || `Análisis #${operationalContext.analysis_run_id}`}</h3>
          {projectRisk ? (
            <>
              <div className="metric-grid">
                <article className="metric-card"><span>Cobertura</span><strong>{projectRisk.coverage_pct}%</strong></article>
                <article className="metric-card"><span>Críticos</span><strong>{projectRisk.counts?.critical || 0}</strong></article>
                <article className="metric-card"><span>Altos</span><strong>{projectRisk.counts?.high || 0}</strong></article>
                <article className="metric-card"><span>Sin evaluación</span><strong>{projectRisk.counts?.missing || 0}</strong></article>
              </div>
              <p className="auth-hint">
                Regla operativa BACKSTAGE: bajo &lt;20%, medio 20–40%, alto 40–70%, crítico ≥70%;
                un componente individual ≥80% también clasifica la ubicación como crítica.
              </p>
              <div className="card-grid">
                {(projectRisk.locations || []).map((location) => (
                  <article className="card" key={location.location_id}>
                    <h4>{location.location_name}</h4>
                    <p>{location.city || 'Sin ciudad'} · Severidad: <strong>{location.classification?.severity}</strong></p>
                    <p>Promedio: {location.classification?.average == null ? 'Sin evaluación' : `${(location.classification.average * 100).toFixed(1)}%`}</p>
                  </article>
                ))}
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  onClick={confirmProjectRiskReview}
                  disabled={reviewingProject || (projectRisk.counts?.missing || 0) > 0}
                >
                  {reviewingProject ? 'Registrando revisión…' : projectRisk.reviewed ? 'Riesgos revisados' : 'Confirmar revisión de riesgos'}
                </button>
                {projectRisk.reviewed && onNavigate && (
                  <button type="button" className="secondary" onClick={() => onNavigate('mission-control')}>
                    Volver al Centro de Operaciones
                  </button>
                )}
              </div>
              {(projectRisk.counts?.missing || 0) > 0 && (
                <p className="message">No se puede cerrar esta etapa hasta evaluar todas las ubicaciones vinculadas al proyecto.</p>
              )}
            </>
          ) : <p className="auth-hint">Cargando riesgos vinculados al proyecto…</p>}
        </div>
      )}

      <div className="form-section">
        <h3>{editingId ? 'Editar evaluación' : 'Crear evaluación'}</h3>
        <form onSubmit={submit} className="entity-form">
          <div className="field-row">
            <label>Ubicación</label>
            <select name="location_id" value={form.location_id} onChange={handleChange} required>
              <option value="">Seleccionar</option>
              {locations.map((location) => (
                <option key={location.location_id} value={location.location_id}>{location.name} — {location.city}</option>
              ))}
            </select>
          </div>
          <div className="field-row"><label>Riesgo inundación (0–1)</label><input name="flood_risk" type="number" min="0" max="1" step="0.01" required value={form.flood_risk} onChange={handleChange} /></div>
          <div className="field-row"><label>Riesgo deslizamiento (0–1)</label><input name="landslide_risk" type="number" min="0" max="1" step="0.01" required value={form.landslide_risk} onChange={handleChange} /></div>
          <div className="field-row"><label>Riesgo crimen (0–1)</label><input name="crime_risk" type="number" min="0" max="1" step="0.01" required value={form.crime_risk} onChange={handleChange} /></div>
          <div className="field-row"><label>Exposición climática (0–1)</label><input name="climate_exposure" type="number" min="0" max="1" step="0.01" required value={form.climate_exposure} onChange={handleChange} /></div>
          <div className="field-row"><label>Origen del dato</label><select name="data_mode" value={form.data_mode} onChange={handleChange}><option value="declared">Declarado</option><option value="measured">Medido</option><option value="derived">Derivado</option><option value="procedural">Procedimental</option></select></div>
          <div className="field-row"><label>Confianza (0–1, opcional)</label><input name="confidence" type="number" min="0" max="1" step="0.01" value={form.confidence} onChange={handleChange} /></div>
          <div className="field-row"><label>Notas y evidencia</label><textarea name="notes" maxLength="2000" value={form.notes} onChange={handleChange} /></div>
          <div className="form-actions">
            <button type="submit">{editingId ? 'Actualizar' : 'Crear'}</button>
            {editingId && <button type="button" className="secondary" onClick={reset}>Cancelar</button>}
          </div>
        </form>
        {message && <p className="message">{message}</p>}
      </div>

      <div className="score-row">
        <h3>Listado</h3>
        <input aria-label="Buscar evaluación" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ubicación o ciudad" />
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="">Todas las severidades</option>
          <option value="critical">Crítico</option><option value="high">Alto</option><option value="moderate">Moderado</option><option value="low">Bajo</option>
        </select>
      </div>

      {loading ? <p>Cargando evaluaciones...</p> : (
        <div className="card-grid">
          {visibleRows.map((row) => (
            <article className="card" key={row.risk_id}>
              <div className="score-row">
                <h3>{row.location_name || `Location #${row.location_id}`}</h3>
                <span className={`status-pill severity-${row.severity}`}>
                  {row.severity === 'critical' ? 'Crítico' : row.severity === 'high' ? 'Alto' : row.severity === 'moderate' ? 'Moderado' : row.severity === 'low' ? 'Bajo' : 'Sin datos'}
                </span>
              </div>
              <p>Score: {row.score ?? 's/d'} · Ciudad: {row.city || 's/d'}</p>
              <p>Inundación {row.flood_risk ?? 's/d'} · Deslizamiento {row.landslide_risk ?? 's/d'}</p>
              <p>Crimen {row.crime_risk ?? 's/d'} · Clima {row.climate_exposure ?? 's/d'}</p>
              <div className="card-actions">
                <button type="button" onClick={() => openDetail(row)}>Detalle e historial</button>
                {onNavigate && <button type="button" className="secondary" onClick={() => onNavigate('territorial-explorer', { ...operationalContext, location_id: row.location_id, city: row.city })}>Ver en mapa</button>}
                <button onClick={() => startEdit(row)}>Editar</button>
                <button className="secondary" onClick={() => remove(row.risk_id)}>Eliminar</button>
                <button
                  type="button"
                  onClick={() => setSimulatingId(simulatingId === row.risk_id ? null : row.risk_id)}
                >
                  {simulatingId === row.risk_id ? 'Ocultar simulación' : 'Simular riesgo'}
                </button>
              </div>
              {simulatingId === row.risk_id && (
                <RiskSimulationPanel row={row} onClose={() => setSimulatingId(null)} />
              )}
            </article>
          ))}
        </div>
      )}
      {selectedAssessment && (
        <div className="form-section" style={{ marginTop: 16 }}>
          <div className="score-row"><div><p className="eyebrow">Trazabilidad</p><h3>{selectedAssessment.location_name}</h3></div><button type="button" className="secondary" onClick={() => setSelectedAssessment(null)}>Cerrar</button></div>
          <p>Evaluación #{selectedAssessment.risk_id} · {new Date(selectedAssessment.assessed_at).toLocaleString('es-CO')} · puntaje <strong>{(Number(selectedAssessment.score) * 100).toFixed(1)}%</strong></p>
          <p className="auth-hint">Origen: {selectedAssessment.details?.data_mode || 'no documentado'} · confianza: {selectedAssessment.details?.confidence == null ? 'no declarada' : `${(selectedAssessment.details.confidence * 100).toFixed(0)}%`} · modelo: {selectedAssessment.details?.model || 'legado'}</p>
          {selectedAssessment.details?.notes && <p>{selectedAssessment.details.notes}</p>}
          <h4>Historial de la ubicación</h4>
          {historyLoading ? <p>Cargando historial…</p> : <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Fecha</th><th>Puntaje</th><th>Severidad</th><th>Origen</th><th>Confianza</th></tr></thead><tbody>{history.map((item) => <tr key={item.risk_id}><td>{new Date(item.assessed_at).toLocaleString('es-CO')}</td><td>{(Number(item.score) * 100).toFixed(1)}%</td><td>{item.severity}</td><td>{item.details?.data_mode || 'legado'}</td><td>{item.details?.confidence == null ? '—' : `${(item.details.confidence * 100).toFixed(0)}%`}</td></tr>)}</tbody></table></div>}
        </div>
      )}
    </section>
  );
}

export default RiskAssessments;
