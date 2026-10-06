import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

function level(score) { if (score >= 80) return 'very_high'; if (score >= 60) return 'high'; if (score >= 40) return 'moderate'; return 'emerging'; }
const LEVELS = { very_high: 'Muy alta', high: 'Alta', moderate: 'Moderada', emerging: 'Emergente' };

function GeoInsights({ operationalContext, onNavigate }) {
  const [summary, setSummary] = useState(null); const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [city, setCity] = useState(''); const [type, setType] = useState(''); const [category, setCategory] = useState(''); const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); const [comparison, setComparison] = useState([]); const [message, setMessage] = useState(''); const [creatingId, setCreatingId] = useState(null);

  useEffect(() => {
    Promise.all([apiRequest('/insights/summary'), apiRequest('/insights/opportunities')])
      .then(async ([summaryResponse, opportunitiesResponse]) => {
        const [summaryData, opportunities] = await Promise.all([summaryResponse.json(), opportunitiesResponse.json()]);
        if (!summaryResponse.ok) throw new Error(summaryData.error || 'No se pudo cargar el resumen.');
        if (!opportunitiesResponse.ok) throw new Error(opportunities.error || 'No se pudieron cargar las oportunidades.');
        setSummary(summaryData); setRows(Array.isArray(opportunities) ? opportunities : []); setMessage('');
      }).catch((error) => setMessage(error.message)).finally(() => setLoading(false));
  }, []);

  const cities = [...new Set(rows.map((row) => row.city).filter(Boolean))].sort();
  const types = [...new Set(rows.map((row) => row.type).filter(Boolean))].sort();
  const categories = [...new Set(rows.flatMap((row) => row.factors.map((factor) => factor.category)))].sort();
  const visible = rows.filter((row) => {
    const text = `${row.name || ''} ${row.city || ''} ${row.region || ''}`.toLowerCase();
    return (!city || row.city === city) && (!type || row.type === type) && (!category || row.factors.some((factor) => factor.category === category)) && text.includes(search.trim().toLowerCase());
  });
  const metrics = useMemo(() => ({
    total: rows.length,
    cities: new Set(rows.map((row) => row.city).filter(Boolean)).size,
    average: rows.length ? rows.reduce((sum, row) => sum + row.opportunity_score, 0) / rows.length : null,
    strong: rows.filter((row) => row.opportunity_score >= 60).length,
    documented: rows.reduce((sum, row) => sum + row.factor_count, 0),
  }), [rows]);

  const toggleCompare = (row) => setComparison((current) => current.some((item) => item.location_id === row.location_id)
    ? current.filter((item) => item.location_id !== row.location_id)
    : current.length < 3 ? [...current, row] : current);
  const openMap = (row) => onNavigate?.('territorial-explorer', { ...operationalContext, location_id: row.location_id, city: row.city });
  const createProject = async (row) => {
    setCreatingId(row.location_id); setMessage('');
    try {
      const response = await apiRequest(`/insights/opportunities/${row.location_id}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_name: `Validación de oportunidad: ${row.name}` }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo crear el proyecto.');
      setMessage(`Proyecto #${data.analysis_run_id} creado con ${row.name} como candidato inicial.`);
      onNavigate?.('mission-control', { analysis_run_id: data.analysis_run_id, project_name: data.project_name, city: row.city, location_id: row.location_id });
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setCreatingId(null); }
  };

  return (
    <section>
      <div className="score-row"><div><p className="eyebrow">Inteligencia territorial</p><h2>Dashboard de oportunidades</h2></div></div>
      <div className="metric-grid">
        <article className="metric-card"><span>Oportunidades documentadas</span><strong>{metrics.total}</strong></article>
        <article className="metric-card"><span>Ciudades cubiertas</span><strong>{metrics.cities}</strong></article>
        <article className="metric-card"><span>Puntaje promedio</span><strong>{metrics.average == null ? 'Sin datos' : `${metrics.average.toFixed(1)}/100`}</strong></article>
        <article className="metric-card"><span>Alta o muy alta</span><strong>{metrics.strong}</strong></article>
        <article className="metric-card"><span>Factores disponibles</span><strong>{metrics.documented}</strong></article>
        <article className="metric-card"><span>Ubicaciones de la organización</span><strong>{summary?.locations ?? '—'}</strong></article>
      </div>
      <p className="auth-hint">Ranking = promedio aritmético de los factores de mercado disponibles en escala 0–100. El riesgo reciente se presenta por separado y no modifica ocultamente el puntaje.</p>

      <div className="form-section">
        <div className="score-row"><h3>Ranking territorial</h3><div className="form-actions"><input aria-label="Buscar oportunidad" placeholder="Buscar ubicación o región" value={search} onChange={(event) => setSearch(event.target.value)} /><select value={city} onChange={(event) => setCity(event.target.value)}><option value="">Todas las ciudades</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={type} onChange={(event) => setType(event.target.value)}><option value="">Todos los tipos</option>{types.map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todos los factores</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></div></div>
        {loading ? <p>Cargando oportunidades…</p> : visible.length === 0 ? <p>No existen oportunidades documentadas que coincidan con los filtros.</p> : <div className="card-grid">{visible.map((row) => (
          <article className="card" key={row.location_id}>
            <div className="score-row"><div><p className="eyebrow">Posición #{row.rank}</p><h3>{row.name}</h3></div><span className={`status-pill severity-${level(row.opportunity_score) === 'very_high' ? 'low' : level(row.opportunity_score) === 'high' ? 'moderate' : 'unknown'}`}>{LEVELS[level(row.opportunity_score)]}</span></div>
            <p>{row.city || 'Sin ciudad'} · {row.type || 'Sin tipo'} · <strong>{row.opportunity_score}/100</strong></p>
            <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}><div style={{ width: `${row.opportunity_score}%`, height: '100%', background: '#39f5ae' }} /></div>
            <p>{row.factor_count} factores · riesgo reciente: {row.latest_risk_score == null ? 'sin evaluación' : `${(row.latest_risk_score * 100).toFixed(1)}%`}</p>
            <div className="card-actions"><button type="button" onClick={() => setSelected(row)}>Explicación</button><button type="button" onClick={() => toggleCompare(row)}>{comparison.some((item) => item.location_id === row.location_id) ? 'Quitar comparación' : 'Comparar'}</button><button type="button" onClick={() => openMap(row)}>Ver en mapa</button><button type="button" onClick={() => createProject(row)} disabled={creatingId === row.location_id}>{creatingId === row.location_id ? 'Creando…' : 'Crear proyecto'}</button></div>
          </article>
        ))}</div>}
      </div>

      {comparison.length > 0 && <div className="form-section"><div className="score-row"><h3>Comparación seleccionada ({comparison.length}/3)</h3><button type="button" className="secondary" onClick={() => setComparison([])}>Limpiar</button></div><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Ubicación</th><th>Ranking</th><th>Oportunidad</th><th>Riesgo reciente</th><th>Factores</th></tr></thead><tbody>{comparison.map((row) => <tr key={row.location_id}><td>{row.name}</td><td>#{row.rank}</td><td>{row.opportunity_score}/100</td><td>{row.latest_risk_score == null ? '—' : `${(row.latest_risk_score * 100).toFixed(1)}%`}</td><td>{row.factor_count}</td></tr>)}</tbody></table></div></div>}

      {selected && <div className="form-section"><div className="score-row"><div><p className="eyebrow">Explicación del ranking</p><h3>#{selected.rank} · {selected.name}</h3></div><button type="button" className="secondary" onClick={() => setSelected(null)}>Cerrar</button></div><p>Puntaje {selected.opportunity_score}/100 calculado con <code>{selected.methodology}</code>.</p><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Factor</th><th>Área de mercado</th><th>Puntaje</th><th>Detalle registrado</th></tr></thead><tbody>{selected.factors.map((factor) => <tr key={factor.score_id}><td>{factor.category}</td><td>{factor.market_area}</td><td>{factor.score}/100</td><td><code>{JSON.stringify(factor.details)}</code></td></tr>)}</tbody></table></div><p className="auth-hint">La posición solo compara ubicaciones con factores registrados; la cantidad y calidad de evidencia puede diferir entre ubicaciones.</p><div className="form-actions"><button type="button" onClick={() => openMap(selected)}>Abrir en mapa</button><button type="button" onClick={() => createProject(selected)}>Convertir en proyecto</button></div></div>}
      {message && <p className="message">{message}</p>}
    </section>
  );
}

export default GeoInsights;
