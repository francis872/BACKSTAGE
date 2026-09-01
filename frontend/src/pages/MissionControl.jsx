import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

function MissionControl({ onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    apiRequest('/insights/summary')
      .then((res) => res.json())
      .then((data) => {
        if (mounted) setSummary(data);
      })
      .catch(() => {
        if (mounted) setMessage('No fue posible cargar los indicadores de misión.');
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section>
      <h2>Mission Control</h2>
      <p>Vista operativa para priorizar proyectos territoriales, riesgos y oportunidades.</p>

      <div className="metric-grid">
        <article className="metric-card"><span>Proyectos activos</span><strong>{summary?.projects_active ?? 1}</strong></article>
        <article className="metric-card"><span>Ubicaciones evaluadas</span><strong>{summary?.locations ?? 0}</strong></article>
        <article className="metric-card"><span>Riesgos críticos</span><strong>{summary?.risk_assessments ?? 0}</strong></article>
        <article className="metric-card"><span>Recomendaciones</span><strong>{summary?.recommendations ?? 0}</strong></article>
      </div>

      <div className="form-actions">
        <button type="button" onClick={() => onNavigate('territorial-explorer')}>Explorar territorio</button>
        <button type="button" onClick={() => onNavigate('intelligence-evaluations')}>Ejecutar evaluación</button>
        <button type="button" onClick={() => onNavigate('portfolio-comparator')}>Comparar ubicaciones</button>
        <button type="button" onClick={() => onNavigate('reports')}>Generar informe</button>
      </div>
      {message && <p className="message">{message}</p>}
    </section>
  );
}

export default MissionControl;
