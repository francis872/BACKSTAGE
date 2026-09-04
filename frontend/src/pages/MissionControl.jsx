import { useEffect, useState } from 'react';
import { FiMap, FiColumns, FiBarChart2, FiFileText, FiFolder, FiMapPin, FiAlertTriangle, FiTarget } from 'react-icons/fi';
import { apiRequest } from '../lib/api';
import './MissionControl.css';

const FLOW_MODULES = [
  {
    key: 'territorial-explorer',
    title: 'Explorador territorial',
    description: 'Mapa operativo para capas, contexto urbano y lectura geoestratégica.',
    icon: FiMap,
    cta: 'Abrir mapa',
  },
  {
    key: 'portfolio-comparator',
    title: 'Comparador inteligente',
    description: 'Compara ubicaciones y genera ranking multicriterio automático.',
    icon: FiColumns,
    cta: 'Comparar',
  },
  {
    key: 'probability-engine',
    title: 'Motor Probabilístico',
    description: 'Análisis distribucional con CDF/1-CDF y selección de mejor ajuste.',
    icon: FiBarChart2,
    cta: 'Abrir motor',
  },
  {
    key: 'reports',
    title: 'Informes ejecutivos',
    description: 'Reportes imprimibles con ranking, resumen y trazabilidad completa.',
    icon: FiFileText,
    cta: 'Ver informes',
  },
];

function MissionControl({ onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      apiRequest('/insights/summary').then((res) => res.json()).catch(() => null),
      apiRequest('/analysis?limit=5').then((res) => res.json()).catch(() => []),
    ])
      .then(([summaryData, runsData]) => {
        if (!mounted) return;
        setSummary(summaryData || {});
        setRecentRuns(Array.isArray(runsData) ? runsData : []);
      })
      .catch(() => {
        if (mounted) setMessage('No fue posible cargar los indicadores de misión.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="mission-control">
      {/* HERO SECTION */}
      <div className="mission-hero">
        <div className="hero-content">
          <p className="hero-label">PLATAFORMA CONECTADA</p>
          <h1>Centro de Operaciones</h1>
          <p className="hero-desc">Inteligencia territorial en tiempo real: territorio → evaluación → probabilidad → decisión</p>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon"><FiFolder /></div>
          <div className="kpi-content">
            <div className="kpi-label">Proyectos activos</div>
            <div className="kpi-value">{loading ? '—' : (summary?.projects_active ?? 0)}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><FiMapPin /></div>
          <div className="kpi-content">
            <div className="kpi-label">Ubicaciones evaluadas</div>
            <div className="kpi-value">{loading ? '—' : (summary?.locations ?? 0)}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><FiAlertTriangle /></div>
          <div className="kpi-content">
            <div className="kpi-label">Riesgos críticos</div>
            <div className="kpi-value">{loading ? '—' : (summary?.risk_assessments ?? 0)}</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><FiTarget /></div>
          <div className="kpi-content">
            <div className="kpi-label">Recomendaciones</div>
            <div className="kpi-value">{loading ? '—' : (summary?.recommendations ?? 0)}</div>
          </div>
        </div>
      </div>

      {/* WORKFLOW MODULES */}
      <div className="workflow-section">
        <div className="section-header">
          <h2>Flujos Inteligentes</h2>
          <p>Accede a cada módulo del ecosistema Backstage</p>
        </div>
        <div className="workflow-grid">
          {FLOW_MODULES.map((item) => (
            <div key={item.key} className="workflow-card">
              <div className="workflow-icon"><item.icon /></div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <button 
                type="button" 
                className="btn-workflow"
                onClick={() => onNavigate(item.key)}
              >
                {item.cta}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* RECENT EXECUTIONS */}
      <div className="executions-section">
        <div className="section-header">
          <h2>Ejecuciones Recientes</h2>
          <p>Últimos análisis ejecutados</p>
        </div>
        {loading ? (
          <div className="loading-state">Cargando ejecuciones...</div>
        ) : recentRuns.length > 0 ? (
          <div className="executions-grid">
            {recentRuns.slice(0, 4).map((run) => (
              <div className="execution-card" key={run.analysis_run_id}>
                <div className="execution-header">
                  <span className="execution-id">Análisis #{run.analysis_run_id}</span>
                  <span className="execution-badge">●</span>
                </div>
                <h4>{run.project_name}</h4>
                <p className="execution-text">{run.recommendation_text || 'Sin recomendación registrada.'}</p>
                <div className="execution-actions">
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={() => onNavigate('reports')}
                  >
                    Informe
                  </button>
                  <button 
                    type="button" 
                    className="btn-tertiary"
                    onClick={() => onNavigate('probability-engine')}
                  >
                    Probabilidad
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>Aún no hay ejecuciones registradas.</p>
            <p>Crea un nuevo análisis desde el Explorador territorial.</p>
          </div>
        )}
      </div>

      {message && <div className="message-alert">{message}</div>}
    </section>
  );
}

export default MissionControl;
