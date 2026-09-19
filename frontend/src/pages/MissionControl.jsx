import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiActivity, FiAlertTriangle, FiBarChart2, FiCheckCircle, FiColumns, FiFileText, FiLayers, FiMap, FiMapPin, FiRefreshCw, FiTarget } from 'react-icons/fi';
import { apiRequest } from '../lib/api';
import './MissionControl.css';

const FLOWS = [
  ['territorial-explorer', 'Explorador territorial', 'Inspecciona territorio, capas y ubicaciones antes de evaluar.', FiMap],
  ['portfolio-comparator', 'Comparador inteligente', 'Contrasta candidatos con el motor geoestratégico.', FiColumns],
  ['probability-engine', 'Motor probabilístico', 'Revisa distribuciones, ajuste y resultados probabilísticos.', FiBarChart2],
  ['reports', 'Informes ejecutivos', 'Consulta resultados y recomendaciones trazables.', FiFileText],
];

const dateTime = (value) => {
  if (!value) return 'Sin actividad registrada';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const statusName = (status) => ({ completed: 'Completado', failed: 'Fallido', pending: 'Pendiente', running: 'En proceso' }[status] || status || 'Sin estado');

function MissionControl({ onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    setMessage('');
    try {
      const [summaryResponse, runsResponse] = await Promise.all([apiRequest('/insights/summary'), apiRequest('/analysis?limit=8')]);
      if (!summaryResponse.ok || !runsResponse.ok) throw new Error('No fue posible consultar el estado operativo.');
      const [summaryData, runsData] = await Promise.all([summaryResponse.json(), runsResponse.json()]);
      setSummary(summaryData || {});
      setRuns(Array.isArray(runsData) ? runsData : []);
    } catch (error) {
      setMessage(error.message || 'No fue posible cargar el Centro de Operaciones.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const alerts = useMemo(() => {
    if (!summary) return [];
    const result = [];
    if (+summary.analyses_attention > 0) result.push(['Análisis requieren revisión', summary.analyses_attention + ' ejecuciones no están completadas.', 'reports']);
    if (+summary.locations === 0) result.push(['No hay ubicaciones operativas', 'Registra ubicaciones antes de ejecutar inteligencia territorial.', 'territorial-explorer']);
    if (+summary.layers_active === 0) result.push(['No hay capas activas', 'El catálogo no reporta capas activas disponibles.', 'admin-layer-catalog']);
    return result;
  }, [summary]);

  const kpis = [
    ['Análisis totales', summary?.analyses_total ?? 0, (summary?.analyses_24h ?? 0) + ' en las últimas 24 h', FiActivity],
    ['Ubicaciones', summary?.locations ?? 0, 'Base territorial disponible', FiMapPin],
    ['Evaluaciones de riesgo', summary?.risk_assessments ?? 0, 'Registros de la organización', FiAlertTriangle],
    ['Recomendaciones', summary?.recommendations ?? 0, 'Decisiones almacenadas', FiTarget],
  ];

  return <section className="mission-control">
    <header className="mission-hero">
      <div>
        <p className="hero-label">OPERACIÓN / CENTRO DE OPERACIONES</p>
        <h1>Centro de Operaciones</h1>
        <p className="hero-desc">Supervisa datos, análisis y decisiones de BACKSTAGE desde un único punto operativo.</p>
      </div>
      <div className="hero-actions">
        <span className={'system-status ' + (summary?.operational_status === 'operational' ? 'ok' : 'warn')}><FiActivity /> {loading ? 'Consultando' : summary?.operational_status === 'operational' ? 'Operación estable' : 'Requiere atención'}</span>
        <button className="refresh-btn" onClick={() => load(true)} disabled={refreshing}><FiRefreshCw /> {refreshing ? 'Actualizando…' : 'Actualizar'}</button>
      </div>
    </header>

    <div className="kpi-grid">{kpis.map(([label, value, meta, Icon]) => <article className="kpi-card" key={label}><Icon className="kpi-icon" /><div><span>{label}</span><strong>{loading ? '—' : value}</strong><small>{meta}</small></div></article>)}</div>

    <section className="operations-overview">
      <div className="section-head"><div><p className="section-kicker">SALUD OPERATIVA</p><h2>Estado de la plataforma</h2></div><small>Último análisis: {dateTime(summary?.last_analysis_at)}</small></div>
      <div className="health-grid">
        <article><FiCheckCircle /><span>Ejecuciones completadas</span><strong>{summary?.analyses_completed ?? 0} / {summary?.analyses_total ?? 0}</strong><small>{summary?.completion_rate == null ? 'Sin ejecuciones' : summary.completion_rate + '% completado'}</small></article>
        <article><FiLayers /><span>Capas disponibles</span><strong>{summary?.layers_active ?? 0} / {summary?.layers_total ?? 0}</strong><small>{summary?.layer_readiness_rate == null ? 'Sin catálogo' : summary.layer_readiness_rate + '% activas'}</small></article>
        <article><FiActivity /><span>Actividad 24 h</span><strong>{summary?.activity_24h ?? 0}</strong><small>acciones registradas</small></article>
        <article><FiAlertTriangle /><span>Pendientes</span><strong>{summary?.analyses_attention ?? 0}</strong><small>ejecuciones no completadas</small></article>
      </div>
    </section>

    <div className="operations-layout">
      <section className="panel">
        <p className="section-kicker">CONTROL</p><h2>Atención operativa</h2><p className="muted">Condiciones detectadas a partir del estado real.</p>
        {loading ? <p className="state">Evaluando…</p> : alerts.length ? <div className="alert-list">{alerts.map(([title, text, target]) => <article key={title}><FiAlertTriangle /><div><strong>{title}</strong><p>{text}</p></div><button onClick={() => onNavigate(target)}>Abrir</button></article>)}</div> : <div className="all-clear"><FiCheckCircle /><div><strong>Sin alertas operativas</strong><p>Las métricas disponibles no muestran pendientes críticos.</p></div></div>}
      </section>
      <section className="panel">
        <p className="section-kicker">ACCESOS RÁPIDOS</p><h2>Flujos de trabajo</h2>
        <div className="workflow-grid">{FLOWS.map(([key, title, description, Icon]) => <article className="workflow-card" key={key}><Icon /><strong>{title}</strong><p>{description}</p><button onClick={() => onNavigate(key)}>Abrir →</button></article>)}</div>
      </section>
    </div>

    <section className="panel">
      <div className="section-head"><div><p className="section-kicker">TRAZABILIDAD</p><h2>Ejecuciones recientes</h2></div><button className="link-btn" onClick={() => onNavigate('reports')}>Ver informes →</button></div>
      {loading ? <p className="state">Cargando ejecuciones…</p> : runs.length ? <div className="table-wrap"><table><thead><tr><th>Análisis</th><th>Proyecto</th><th>Ciudad</th><th>Estado</th><th>Creado</th></tr></thead><tbody>{runs.map(run => <tr key={run.analysis_run_id}><td>#{run.analysis_run_id}</td><td><strong>{run.project_name || 'Sin nombre'}</strong><small>{run.objective || run.recommendation_text || 'Sin descripción'}</small></td><td>{run.city || '—'}</td><td><span className={'run-status ' + run.status}>{statusName(run.status)}</span></td><td>{dateTime(run.created_at)}</td></tr>)}</tbody></table></div> : <p className="state">Aún no hay ejecuciones registradas.</p>}
    </section>
    {message && <div className="message-alert">{message}</div>}
  </section>;
}

export default MissionControl;
