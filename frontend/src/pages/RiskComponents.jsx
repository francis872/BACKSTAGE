import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

const TYPES = { threat: 'Amenaza', exposure: 'Exposición', vulnerability: 'Vulnerabilidad' };
const initialForm = { risk_id: '', component_type: 'threat', component_score: '', notes: '' };

function band(score) {
  const value = Number(score);
  if (value >= 0.7) return 'critical';
  if (value >= 0.4) return 'high';
  if (value >= 0.2) return 'moderate';
  return 'low';
}

function RiskComponents({ operationalContext, onNavigate }) {
  const [components, setComponents] = useState([]); const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true); const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null); const [message, setMessage] = useState('');
  const [typeFilter, setTypeFilter] = useState(''); const [cityFilter, setCityFilter] = useState(''); const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [componentsResponse, assessmentsResponse] = await Promise.all([apiRequest('/risk-components'), apiRequest('/risk-assessments')]);
      const [componentsData, assessmentsData] = await Promise.all([componentsResponse.json(), assessmentsResponse.json()]);
      if (!componentsResponse.ok) throw new Error(componentsData.error || 'No se pudieron cargar los componentes.');
      if (!assessmentsResponse.ok) throw new Error(assessmentsData.error || 'No se pudieron cargar las evaluaciones.');
      setComponents(Array.isArray(componentsData) ? componentsData : []); setAssessments(Array.isArray(assessmentsData) ? assessmentsData : []); setMessage('');
    } catch (error) { setComponents([]); setAssessments([]); setMessage(error.message); } finally { setLoading(false); }
  };
  useEffect(() => { loadData(); }, []);

  const summary = useMemo(() => {
    const average = (type) => {
      const rows = components.filter((item) => item.component_type === type);
      return rows.length ? rows.reduce((sum, item) => sum + Number(item.component_score), 0) / rows.length : null;
    };
    return {
      total: components.length,
      locations: new Set(components.map((item) => item.location_id)).size,
      critical: components.filter((item) => Number(item.component_score) >= 0.7).length,
      threat: average('threat'), exposure: average('exposure'), vulnerability: average('vulnerability'),
    };
  }, [components]);
  const cities = [...new Set(components.map((item) => item.city).filter(Boolean))].sort();
  const visible = components.filter((item) => {
    const haystack = `${item.location_name || ''} ${item.city || ''} ${item.notes || ''}`.toLowerCase();
    return (!typeFilter || item.component_type === typeFilter) && (!cityFilter || item.city === cityFilter) && haystack.includes(search.trim().toLowerCase());
  });

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const reset = () => { setForm(initialForm); setEditingId(null); };
  const submit = async (event) => {
    event.preventDefault();
    try {
      const response = await apiRequest(editingId ? `/risk-components/${editingId}` : '/risk-components', {
        method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, risk_id: Number(form.risk_id), component_score: Number(form.component_score) }),
      });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo guardar el componente.');
      setMessage(editingId ? 'Componente actualizado.' : 'Componente registrado.'); reset(); await loadData();
    } catch (error) { setMessage(`Error: ${error.message}`); }
  };
  const edit = (item) => { setEditingId(item.component_id); setForm({ risk_id: item.risk_id, component_type: item.component_type, component_score: item.component_score, notes: item.notes || '' }); };
  const remove = async (id) => {
    if (!window.confirm('¿Eliminar este componente de riesgo?')) return;
    try { const response = await apiRequest(`/risk-components/${id}`, { method: 'DELETE' }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setMessage('Componente eliminado.'); await loadData(); }
    catch (error) { setMessage(`Error: ${error.message}`); }
  };
  const mapLocation = (item) => onNavigate?.('territorial-explorer', { ...operationalContext, location_id: item.location_id, city: item.city });

  return (
    <section>
      <div className="score-row"><div><p className="eyebrow">Inteligencia de riesgo</p><h2>Dashboard de componentes de riesgo</h2></div></div>
      <div className="metric-grid">
        <article className="metric-card"><span>Componentes</span><strong>{summary.total}</strong></article>
        <article className="metric-card"><span>Ubicaciones cubiertas</span><strong>{summary.locations}</strong></article>
        <article className="metric-card"><span>Componentes críticos</span><strong>{summary.critical}</strong></article>
        {['threat', 'exposure', 'vulnerability'].map((type) => <article className="metric-card" key={type}><span>{TYPES[type]} promedio</span><strong>{summary[type] == null ? 'Sin datos' : `${(summary[type] * 100).toFixed(1)}%`}</strong></article>)}
      </div>
      <p className="auth-hint">Los promedios usan exclusivamente componentes registrados en la organización activa. Bandas operativas: bajo &lt;20%, moderado 20–40%, alto 40–70%, crítico ≥70%.</p>

      <details className="form-section" open={Boolean(editingId)}>
        <summary><strong>{editingId ? 'Editar componente' : 'Registrar componente con evidencia'}</strong></summary>
        <form onSubmit={submit} className="entity-form" style={{ marginTop: 12 }}>
          <div className="field-row"><label>Evaluación de riesgo</label><select name="risk_id" required value={form.risk_id} onChange={change}><option value="">Seleccionar evaluación</option>{assessments.map((item) => <option key={item.risk_id} value={item.risk_id}>#{item.risk_id} · {item.location_name} · {(Number(item.score) * 100).toFixed(1)}%</option>)}</select></div>
          <div className="field-row"><label>Dimensión</label><select name="component_type" value={form.component_type} onChange={change}>{Object.entries(TYPES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
          <div className="field-row"><label>Puntaje (0–1)</label><input name="component_score" type="number" min="0" max="1" step="0.01" required value={form.component_score} onChange={change} /></div>
          <div className="field-row"><label>Evidencia y notas</label><textarea name="notes" maxLength="2000" rows="3" value={form.notes} onChange={change} /></div>
          <div className="form-actions"><button type="submit">{editingId ? 'Actualizar' : 'Registrar'}</button>{editingId && <button type="button" className="secondary" onClick={reset}>Cancelar</button>}</div>
        </form>
      </details>

      <div className="form-section">
        <div className="score-row"><h3>Distribución territorial</h3><div className="form-actions"><input aria-label="Buscar componente" placeholder="Buscar ubicación, ciudad o evidencia" value={search} onChange={(event) => setSearch(event.target.value)} /><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Todas las dimensiones</option>{Object.entries(TYPES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}><option value="">Todas las ciudades</option>{cities.map((city) => <option value={city} key={city}>{city}</option>)}</select></div></div>
        {loading ? <p>Cargando componentes…</p> : visible.length === 0 ? <p>No hay componentes que coincidan con los filtros.</p> : <div className="card-grid">{visible.map((item) => (
          <article className="card" key={item.component_id}>
            <div className="score-row"><div><p className="eyebrow">{TYPES[item.component_type] || item.component_type}</p><h3>{item.location_name}</h3></div><span className={`status-pill severity-${band(item.component_score)}`}>{band(item.component_score)}</span></div>
            <p>{item.city || 'Sin ciudad'} · evaluación #{item.risk_id} · {new Date(item.assessed_at).toLocaleDateString('es-CO')}</p>
            <div title={`${(Number(item.component_score) * 100).toFixed(1)}%`} style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}><div style={{ width: `${Number(item.component_score) * 100}%`, height: '100%', background: Number(item.component_score) >= 0.7 ? '#ff5d73' : Number(item.component_score) >= 0.4 ? '#ffb347' : '#39f5ae' }} /></div>
            <p>Puntaje: <strong>{(Number(item.component_score) * 100).toFixed(1)}%</strong> · riesgo integral de la evaluación: {(Number(item.assessment_score) * 100).toFixed(1)}%</p>
            {item.notes && <p>{item.notes}</p>}
            <div className="card-actions"><button type="button" onClick={() => setSelected(item)}>Detalle</button><button type="button" onClick={() => mapLocation(item)}>Ver en mapa</button><button type="button" onClick={() => edit(item)}>Editar</button><button type="button" className="secondary" onClick={() => remove(item.component_id)}>Eliminar</button></div>
          </article>
        ))}</div>}
      </div>
      {selected && <div className="form-section"><div className="score-row"><div><p className="eyebrow">Trazabilidad del componente</p><h3>{TYPES[selected.component_type]} · {selected.location_name}</h3></div><button type="button" className="secondary" onClick={() => setSelected(null)}>Cerrar</button></div><p>Componente #{selected.component_id} vinculado a evaluación #{selected.risk_id}.</p><p>Fecha evaluada: {new Date(selected.assessed_at).toLocaleString('es-CO')} · ubicación #{selected.location_id} · {selected.city || 'sin ciudad'}.</p><p className="auth-hint">Este valor es evidencia declarada dentro de la evaluación; no se interpreta como medición automática.</p><div className="form-actions"><button type="button" onClick={() => mapLocation(selected)}>Abrir ubicación en mapa</button><button type="button" className="secondary" onClick={() => onNavigate?.('intelligence-evaluations', operationalContext)}>Abrir evaluaciones</button></div></div>}
      {message && <p className="message">{message}</p>}
    </section>
  );
}

export default RiskComponents;
