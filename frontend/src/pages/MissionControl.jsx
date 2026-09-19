import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiBarChart2,
  FiCheckCircle,
  FiColumns,
  FiFileText,
  FiLayers,
  FiMap,
  FiMapPin,
  FiRefreshCw,
  FiShield,
  FiTarget,
  FiUser,
} from 'react-icons/fi';
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
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const statusName = (status) => ({
  completed: 'Completado',
  failed: 'Fallido',
  pending: 'Pendiente',
  running: 'En proceso',
}[status] || status || 'Sin estado');

const actionName = (action) => {
  if (!action) return 'Actividad registrada';
  return String(action)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

function MissionControl({ onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [runs, setRuns] = useState([]);
  const [operationalProjects, setOperationalProjects] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [chainStatus, setChainStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [operationalEvents, setOperationalEvents] = useState([]);

  const load = useCallback(async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    setMessage('');

    try {
      const [summaryResult, runsResult, operationsResult, auditResult, chainResult, eventsResult] = await Promise.allSettled([
        apiRequest('/insights/summary'),
        apiRequest('/analysis?limit=8'),
        apiRequest('/analysis/operations?limit=8'),
        apiRequest('/audit-logs?limit=6'),
        apiRequest('/audit-logs/chain-status'),
        apiRequest('/operational-events?limit=20'),
      ]);

      if (summaryResult.status !== 'fulfilled' || !summaryResult.value.ok) {
        throw new Error('No fue posible consultar el estado operativo.');
      }

      const summaryData = await summaryResult.value.json();
      setSummary(summaryData || {});

      if (runsResult.status === 'fulfilled' && runsResult.value.ok) {
        const runsData = await runsResult.value.json();
        setRuns(Array.isArray(runsData) ? runsData : []);
      } else {
        setRuns([]);
      }

      if (operationsResult.status === 'fulfilled' && operationsResult.value.ok) {
        const operationsData = await operationsResult.value.json();
        setOperationalProjects(Array.isArray(operationsData) ? operationsData : []);
      } else {
        setOperationalProjects([]);
      }

      if (auditResult.status === 'fulfilled' && auditResult.value.ok) {
        const auditData = await auditResult.value.json();
        setAuditRows(Array.isArray(auditData.audit_logs) ? auditData.audit_logs : []);
      } else {
        setAuditRows([]);
      }

      if (chainResult.status === 'fulfilled' && chainResult.value.ok) {
        setChainStatus(await chainResult.value.json());
      } else {
        setChainStatus(null);
      }

      if (eventsResult.status === 'fulfilled' && eventsResult.value.ok) {
        const eventData = await eventsResult.value.json();
        setOperationalEvents(Array.isArray(eventData) ? eventData : []);
      } else {
        setOperationalEvents([]);
      }
    } catch (error) {
      setMessage(error.message || 'No fue posible cargar el Centro de Operaciones.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);


  const createProject = async () => {
    const projectName = window.prompt('Nombre del proyecto operativo');
    if (!projectName?.trim()) return;
    setCreatingProject(true);
    try {
      const res = await apiRequest('/analysis/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: projectName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el proyecto.');
      onNavigate('territorial-explorer', data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCreatingProject(false);
    }
  };


  const updateAlert = async (eventId, action) => {
    try {
      const res = await apiRequest(`/operational-events/${eventId}/${action}`, { method: 'PUT' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la alerta.');
      await load(true);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const alerts = useMemo(() => {
    if (!summary) return [];

    const result = [];

    if (+summary.analyses_attention > 0) {
      result.push({
        level: 'warning',
        title: 'Análisis requieren revisión',
        detail: summary.analyses_attention + ' ejecuciones no están completadas.',
        target: 'reports',
      });
    }

    if (+summary.locations === 0) {
      result.push({
        level: 'critical',
        title: 'No hay ubicaciones operativas',
        detail: 'Registra ubicaciones antes de ejecutar inteligencia territorial.',
        target: 'territorial-explorer',
      });
    }

    if (+summary.layers_active === 0) {
      result.push({
        level: 'critical',
        title: 'No hay capas activas',
        detail: 'El catálogo no reporta capas activas disponibles.',
        target: 'admin-layer-catalog',
      });
    }

    if (chainStatus && chainStatus.chain_enabled && chainStatus.valid === false) {
      result.push({
        level: 'critical',
        title: 'Integridad de auditoría comprometida',
        detail: 'La cadena hash de auditoría reporta una inconsistencia.',
        target: 'admin-audit-logs',
      });
    }

    operationalEvents
      .filter((event) => event.severity === 'warning' || event.severity === 'critical')
      .slice(0, 6)
      .forEach((event) => {
        result.push({
          level: event.severity,
          title: event.title,
          detail: event.message || event.project_name || 'Evento operacional.',
          target: event.target || 'mission-control',
          context: event.analysis_run_id ? {
            analysis_run_id: event.analysis_run_id,
            project_name: event.project_name,
            city: event.city,
          } : null,
          eventId: event.operational_event_id,
        });
      });

    return result;
  }, [summary, chainStatus, operationalEvents]);

  const kpis = [
    ['Análisis totales', summary?.analyses_total ?? 0, (summary?.analyses_24h ?? 0) + ' en las últimas 24 h', FiActivity],
    ['Ubicaciones', summary?.locations ?? 0, 'Base territorial disponible', FiMapPin],
    ['Evaluaciones de riesgo', summary?.risk_assessments ?? 0, 'Registros de la organización', FiAlertTriangle],
    ['Recomendaciones', summary?.recommendations ?? 0, 'Decisiones almacenadas', FiTarget],
  ];

  const chainLabel = !chainStatus
    ? 'No disponible'
    : !chainStatus.chain_enabled
      ? 'Deshabilitada'
      : chainStatus.valid
        ? 'Íntegra'
        : 'Inconsistente';

  return (
    <section className="mission-control">
      <header className="mission-hero">
        <div>
          <p className="hero-label">OPERACIÓN / CENTRO DE OPERACIONES</p>
          <h1>Centro de Operaciones</h1>
          <p className="hero-desc">
            Supervisa datos, análisis, actividad y decisiones de BACKSTAGE desde un único punto operativo.
          </p>
        </div>
        <div className="hero-actions">
          <span className={'system-status ' + (summary?.operational_status === 'operational' ? 'ok' : 'warn')}>
            <FiActivity />
            {loading ? 'Consultando' : summary?.operational_status === 'operational' ? 'Operación estable' : 'Requiere atención'}
          </span>
          <button className="refresh-btn" onClick={() => load(true)} disabled={refreshing}>
            <FiRefreshCw />
            {refreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </header>

      <div className="kpi-grid">
        {kpis.map(([label, value, meta, Icon]) => (
          <article className="kpi-card" key={label}>
            <Icon className="kpi-icon" />
            <div>
              <span>{label}</span>
              <strong>{loading ? '—' : value}</strong>
              <small>{meta}</small>
            </div>
          </article>
        ))}
      </div>

      <section className="operations-overview">
        <div className="section-head">
          <div>
            <p className="section-kicker">SALUD OPERATIVA</p>
            <h2>Estado de la plataforma</h2>
          </div>
          <small>Último análisis: {dateTime(summary?.last_analysis_at)}</small>
        </div>
        <div className="health-grid">
          <article>
            <FiCheckCircle />
            <span>Ejecuciones completadas</span>
            <strong>{summary?.analyses_completed ?? 0} / {summary?.analyses_total ?? 0}</strong>
            <small>{summary?.completion_rate == null ? 'Sin ejecuciones' : summary.completion_rate + '% completado'}</small>
          </article>
          <article>
            <FiLayers />
            <span>Capas disponibles</span>
            <strong>{summary?.layers_active ?? 0} / {summary?.layers_total ?? 0}</strong>
            <small>{summary?.layer_readiness_rate == null ? 'Sin catálogo' : summary.layer_readiness_rate + '% activas'}</small>
          </article>
          <article>
            <FiActivity />
            <span>Actividad 24 h</span>
            <strong>{summary?.activity_24h ?? 0}</strong>
            <small>acciones registradas</small>
          </article>
          <article>
            <FiShield />
            <span>Integridad de auditoría</span>
            <strong className="health-text-value">{chainLabel}</strong>
            <small>{chainStatus?.hashed_rows ?? 0} registros verificados</small>
          </article>
        </div>
      </section>

      <div className="operations-layout">
        <section className="panel">
          <p className="section-kicker">CONTROL</p>
          <h2>Atención operativa</h2>
          <p className="muted">Condiciones detectadas a partir del estado real de BACKSTAGE.</p>

          {loading ? (
            <p className="state">Evaluando…</p>
          ) : alerts.length ? (
            <div className="alert-list">
              {alerts.map((alert) => (
                <article className={'alert-item ' + alert.level} key={alert.eventId || alert.title}>
                  <FiAlertTriangle />
                  <div>
                    <strong>{alert.title}</strong>
                    <p>{alert.detail}</p>
                  </div>
                  <div className="alert-actions">
                    <button onClick={() => onNavigate(alert.target, alert.context || null)}>Abrir</button>
                    {alert.eventId && (
                      <>
                        <button onClick={() => updateAlert(alert.eventId, 'acknowledge')}>Reconocer</button>
                        <button onClick={() => updateAlert(alert.eventId, 'resolve')}>Resolver</button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="all-clear">
              <FiCheckCircle />
              <div>
                <strong>Sin alertas operativas</strong>
                <p>Las métricas disponibles no muestran pendientes críticos.</p>
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <p className="section-kicker">ACTIVIDAD</p>
          <h2>Actividad reciente</h2>
          <p className="muted">Últimas acciones auditadas dentro de la organización.</p>

          {loading ? (
            <p className="state">Cargando actividad…</p>
          ) : auditRows.length ? (
            <div className="activity-feed">
              {auditRows.map((row) => (
                <article key={row.audit_log_id}>
                  <div className="activity-icon"><FiUser /></div>
                  <div className="activity-copy">
                    <strong>{actionName(row.action)}</strong>
                    <p>
                      {row.actor_email || row.actor_user_id || 'Actor no identificado'}
                      {' · '}
                      {row.target_type || 'objeto'}
                      {row.target_id ? ' #' + row.target_id : ''}
                    </p>
                    <small>{dateTime(row.created_at)}</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="state">No hay actividad reciente disponible.</p>
          )}

          <button className="panel-action" onClick={() => onNavigate('admin-audit-logs')}>
            Abrir auditoría completa →
          </button>

          {operationalEvents.length > 0 && (
            <div className="operational-event-feed">
              <p className="section-kicker">EVENTOS DEL WORKFLOW</p>
              {operationalEvents.slice(0, 6).map((event) => (
                <button
                  type="button"
                  key={event.operational_event_id}
                  className={`operational-event ${event.severity}`}
                  onClick={() => onNavigate(event.target || 'mission-control', event.analysis_run_id ? {
                    analysis_run_id: event.analysis_run_id,
                    project_name: event.project_name,
                    city: event.city,
                  } : null)}
                >
                  <span>{event.title}</span>
                  <small>{event.project_name || 'Sistema'} · {dateTime(event.created_at)}</small>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>


      <section className="panel">
        <div className="section-head">
          <div>
            <p className="section-kicker">ORQUESTACIÓN</p>
            <h2>Proyectos en operación</h2>
          </div>
          <div className="hero-actions">
            <small>El Centro de Operaciones determina el siguiente paso según el estado real de cada análisis.</small>
            <button className="refresh-btn" type="button" onClick={createProject} disabled={creatingProject}>
              {creatingProject ? 'Creando…' : 'Nuevo proyecto'}
            </button>
          </div>
        </div>
        {loading ? (
          <p className="state">Calculando flujo operativo…</p>
        ) : operationalProjects.length ? (
          <div className="workflow-project-list">
            {operationalProjects.map((project) => (
              <article className="workflow-project" key={project.analysis_run_id}>
                <div>
                  <div className="project-control-badges">
                    <span className={'workflow-state ' + project.workflow.state}>{project.workflow.label}</span>
                    <span className={'priority-badge ' + project.priority}>{project.priority}</span>
                    <span className="health-badge">Health {project.health}%</span>
                    {project.sla?.breached && <span className="sla-badge">SLA vencido · {project.sla.age_hours}h</span>}
                  </div>
                  <strong>{project.project_name || 'Proyecto sin nombre'}</strong>
                  <p>{project.city || 'Sin ciudad'} · {project.candidate_count || 0} candidatos · {project.result_count || 0} resultados</p>
                  {project.timeline && (
                    <div className="project-timeline">
                      <div className="timeline-progress">
                        <span style={{ width: `${project.timeline.progress_pct}%` }} />
                      </div>
                      <div className="timeline-steps">
                        {project.timeline.steps.map((step) => (
                          <button
                            type="button"
                            key={step.key}
                            className={`timeline-step ${step.status}`}
                            onClick={() => step.status !== 'blocked' && onNavigate(step.target, project)}
                            disabled={step.status === 'blocked'}
                            title={step.completed_at ? `${step.label}: ${dateTime(step.completed_at)}` : step.label}
                          >
                            <span className="timeline-dot" />
                            <span>{step.label}</span>
                          </button>
                        ))}
                      </div>
                      <small className="timeline-summary">
                        {project.timeline.completed_steps}/{project.timeline.total_steps} etapas · {project.timeline.progress_pct}% completado
                      </small>
                    </div>
                  )}
                </div>
                <div className="workflow-project-action">
                  <small>{project.blocked_reason || project.recommendation_text || 'Aún no existe recomendación para este proyecto.'}</small>
                  {project.workflow.state === 'stale' && (
                    <strong className="stale-warning">Resultados STALE: las etapas dependientes deben recalcularse.</strong>
                  )}
                  <button onClick={() => onNavigate(project.workflow.target, project)}>
                    {project.workflow.next_action} →
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="state">No hay proyectos operativos registrados.</p>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <p className="section-kicker">ACCESOS RÁPIDOS</p>
            <h2>Flujos de trabajo</h2>
          </div>
        </div>
        <div className="workflow-grid">
          {FLOWS.map(([key, title, description, Icon]) => (
            <article className="workflow-card" key={key}>
              <Icon />
              <strong>{title}</strong>
              <p>{description}</p>
              <button onClick={() => onNavigate(key)}>Abrir →</button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <p className="section-kicker">TRAZABILIDAD</p>
            <h2>Ejecuciones recientes</h2>
          </div>
          <button className="link-btn" onClick={() => onNavigate('reports')}>Ver informes →</button>
        </div>

        {loading ? (
          <p className="state">Cargando ejecuciones…</p>
        ) : runs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Análisis</th>
                  <th>Proyecto</th>
                  <th>Ciudad</th>
                  <th>Estado</th>
                  <th>Creado</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.analysis_run_id}>
                    <td>#{run.analysis_run_id}</td>
                    <td>
                      <strong>{run.project_name || 'Sin nombre'}</strong>
                      <small>{run.objective || run.recommendation_text || 'Sin descripción'}</small>
                    </td>
                    <td>{run.city || '—'}</td>
                    <td><span className={'run-status ' + run.status}>{statusName(run.status)}</span></td>
                    <td>{dateTime(run.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="state">Aún no hay ejecuciones registradas.</p>
        )}
      </section>

      {message && <div className="message-alert">{message}</div>}
    </section>
  );
}

export default MissionControl;
