import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

const FLOW_MODULES = [
  {
    key: 'territorial-explorer',
    title: 'Explorador territorial',
    description: 'Mapa operativo para capas, contexto urbano y lectura geoestratégica en tiempo real.',
    cta: 'Abrir mapa',
  },
  {
    key: 'portfolio-comparator',
    title: 'Comparador inteligente',
    description: 'Compara ubicaciones y genera ranking multicriterio con recomendación automática.',
    cta: 'Comparar',
  },
  {
    key: 'probability-engine',
    title: 'Backstage Probability Engine',
    description: 'Módulo probabilístico con CDF/1-CDF, umbrales y selección de la mejor distribución.',
    cta: 'Abrir motor',
  },
  {
    key: 'reports',
    title: 'Informes ejecutivos',
    description: 'Cierre listo para imprimir con resumen, ranking y trazabilidad de decisiones.',
    cta: 'Ver informes',
  },
];

function MissionControl({ onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    Promise.all([
      apiRequest('/insights/summary').then((res) => res.json()),
      apiRequest('/analysis?limit=5').then((res) => res.json()),
    ])
      .then(([summaryData, runsData]) => {
        if (!mounted) return;
        setSummary(summaryData || null);
        setRecentRuns(Array.isArray(runsData) ? runsData : []);
      })
      .catch(() => {
        if (mounted) setMessage('No fue posible cargar los indicadores de misión.');
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="stacked-sections">
      <article className="hero">
        <p className="eyebrow">Plataforma conectada</p>
        <h2>Centro de operaciones</h2>
        <p>
          Opera el flujo completo desde territorio → evaluación → probabilidad → informe, sin perder trazabilidad.
        </p>
      </article>

      <article className="form-section">
        <h3>Estado operativo</h3>
        <div className="metric-grid">
          <article className="metric-card"><span>Proyectos activos</span><strong>{summary?.projects_active ?? 0}</strong></article>
          <article className="metric-card"><span>Ubicaciones evaluadas</span><strong>{summary?.locations ?? 0}</strong></article>
          <article className="metric-card"><span>Riesgos críticos</span><strong>{summary?.risk_assessments ?? 0}</strong></article>
          <article className="metric-card"><span>Recomendaciones</span><strong>{summary?.recommendations ?? 0}</strong></article>
        </div>
      </article>

      <article className="form-section">
        <h3>Flujos inteligentes</h3>
        <div className="workflow-grid">
          {FLOW_MODULES.map((item) => (
            <article key={item.key} className="workflow-card">
              <h4>{item.title}</h4>
              <p>{item.description}</p>
              <button type="button" onClick={() => onNavigate(item.key)}>{item.cta}</button>
            </article>
          ))}
        </div>
      </article>

      <article className="form-section">
        <h3>Ejecuciones recientes</h3>
        <div className="card-grid">
          {recentRuns.slice(0, 4).map((run) => (
            <article className="card" key={run.analysis_run_id}>
              <p className="eyebrow">Análisis #{run.analysis_run_id}</p>
              <h4>{run.project_name}</h4>
              <p>{run.recommendation_text || 'Sin recomendación registrada.'}</p>
              <div className="form-actions">
                <button type="button" onClick={() => onNavigate('reports')}>Abrir informe</button>
                <button type="button" className="secondary" onClick={() => onNavigate('probability-engine')}>Ver probabilidad</button>
              </div>
            </article>
          ))}
          {recentRuns.length === 0 && <p className="auth-hint">Aún no hay ejecuciones registradas.</p>}
        </div>
      </article>
      {message && <p className="message">{message}</p>}
    </section>
  );
}

export default MissionControl;
