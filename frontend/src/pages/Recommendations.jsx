import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

const STATUS_LABELS = {
  proposed: 'Propuesta',
  under_review: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  in_progress: 'En progreso',
  completed: 'Completada',
  expired: 'Expirada',
};

const PRIORITY_LABELS = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const NEXT_ACTIONS = {
  proposed: [
    { decision: 'approved', label: 'Aprobar', needsNotes: true },
    { decision: 'rejected', label: 'Rechazar', needsNotes: true },
    { decision: 'under_review', label: 'Enviar a revisión', needsNotes: false },
  ],
  under_review: [
    { decision: 'approved', label: 'Aprobar', needsNotes: true },
    { decision: 'rejected', label: 'Rechazar', needsNotes: true },
  ],
  approved: [
    { decision: 'in_progress', label: 'Marcar en progreso', needsNotes: false },
  ],
  in_progress: [
    { decision: 'completed', label: 'Marcar completada', needsNotes: false },
  ],
  rejected: [],
  completed: [],
  expired: [],
};

function ReviewControls({ recommendation, onReview }) {
  const [pendingDecision, setPendingDecision] = useState(null);
  const [notes, setNotes] = useState('');
  const actions = NEXT_ACTIONS[recommendation.status] || [];

  if (actions.length === 0) return null;

  if (pendingDecision) {
    const action = actions.find((a) => a.decision === pendingDecision);
    return (
      <div className="review-controls">
        <label>Justificación {action.needsNotes ? '(requerida)' : '(opcional)'}</label>
        <textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="form-actions">
          <button
            type="button"
            onClick={() => onReview(recommendation.recommendation_id, pendingDecision, notes)}
            disabled={action.needsNotes && !notes.trim()}
          >
            Confirmar {action.label.toLowerCase()}
          </button>
          <button type="button" className="secondary" onClick={() => { setPendingDecision(null); setNotes(''); }}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-actions">
      {actions.map((action) => (
        <button key={action.decision} type="button" onClick={() => setPendingDecision(action.decision)}>
          {action.label}
        </button>
      ))}
    </div>
  );
}

function Recommendations() {
  const [recommendations, setRecommendations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [locations, setLocations] = useState([]);
  const [analysisRuns, setAnalysisRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedAnalysisRun, setSelectedAnalysisRun] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const loadAll = async (status) => {
    setLoading(true);
    try {
      const query = status ? `?status=${status}` : '';
      const [recRes, summaryRes] = await Promise.all([
        apiRequest(`/recommendations${query}`),
        apiRequest('/recommendations/summary'),
      ]);
      const [recData, summaryData] = await Promise.all([recRes.json(), summaryRes.json()]);
      if (!recRes.ok) throw new Error(recData.error || 'No se pudieron cargar las recomendaciones.');
      setRecommendations(Array.isArray(recData) ? recData : []);
      setSummary(summaryData);
    } catch (error) {
      setMessage(error.message);
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll(statusFilter);
    apiRequest('/locations').then((res) => res.json()).then((data) => setLocations(Array.isArray(data) ? data : [])).catch(() => setLocations([]));
    apiRequest('/analysis?limit=10').then((res) => res.json()).then((data) => setAnalysisRuns(Array.isArray(data) ? data : [])).catch(() => setAnalysisRuns([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleReview = async (id, decision, notes) => {
    setMessage('');
    try {
      const res = await apiRequest(`/recommendations/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes: notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la recomendación.');
      setMessage(`Recomendación actualizada a "${STATUS_LABELS[decision] || decision}".`);
      loadAll(statusFilter);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const generateFromAnalysis = async (event) => {
    event.preventDefault();
    if (!selectedAnalysisRun) {
      setMessage('Selecciona una ejecución de análisis.');
      return;
    }
    setMessage('');
    try {
      const res = await apiRequest(`/recommendations/from-analysis/${selectedAnalysisRun}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topN: 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron generar recomendaciones.');
      setMessage(data.length > 0
        ? `Se generaron ${data.length} recomendación(es) a partir del análisis seleccionado.`
        : 'El análisis seleccionado ya tiene recomendaciones generadas (sin duplicados).');
      loadAll(statusFilter);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const getLocationName = (locationId) => {
    const location = locations.find((loc) => loc.location_id === Number(locationId));
    return location ? `${location.name} — ${location.city}` : null;
  };

  return (
    <section>
      <h2>Recomendaciones</h2>
      <p>Dashboard decisional: cada recomendación queda vinculada al análisis que la originó, con estado, prioridad y confianza trazables.</p>

      {summary && (
        <div className="metric-grid">
          <article className="metric-card"><span>Total</span><strong>{summary.total}</strong></article>
          <article className="metric-card"><span>Pendientes de revisión</span><strong>{summary.pending_review}</strong></article>
          <article className="metric-card"><span>Aprobadas</span><strong>{summary.by_status.approved}</strong></article>
          <article className="metric-card"><span>En progreso</span><strong>{summary.by_status.in_progress}</strong></article>
          <article className="metric-card"><span>Completadas</span><strong>{summary.by_status.completed}</strong></article>
          <article className="metric-card"><span>Rechazadas</span><strong>{summary.by_status.rejected}</strong></article>
        </div>
      )}

      <article className="form-section">
        <h3>Generar recomendaciones desde un análisis</h3>
        <p className="auth-hint">
          Toma el ranking multicriterio (TOPSIS) de una ejecución del Comparador Inteligente y propone
          recomendaciones para sus mejores candidatos, vinculadas al análisis de origen.
        </p>
        <form onSubmit={generateFromAnalysis} className="entity-form">
          <div className="field-row">
            <label>Ejecución de análisis</label>
            <select value={selectedAnalysisRun} onChange={(e) => setSelectedAnalysisRun(e.target.value)} required>
              <option value="">Seleccionar</option>
              {analysisRuns.map((run) => (
                <option key={run.analysis_run_id} value={run.analysis_run_id}>
                  #{run.analysis_run_id} · {run.project_name} · {new Date(run.created_at).toLocaleDateString('es-CO')}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button type="submit">Generar recomendaciones</button>
          </div>
        </form>
      </article>

      <article className="form-section">
        <div className="score-row">
          <h3>Recomendaciones</h3>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        {message && <p className="message">{message}</p>}
        {loading ? (
          <p>Cargando recomendaciones...</p>
        ) : recommendations.length === 0 ? (
          <p>No hay recomendaciones para este filtro.</p>
        ) : (
          <div className="card-grid">
            {recommendations.map((recommendation) => (
              <article className={`card recommendation-card priority-${recommendation.priority || 'none'}`} key={recommendation.recommendation_id}>
                <div className="score-row">
                  <h3>{recommendation.title || recommendation.query_type}</h3>
                  <span className={`status-pill status-${recommendation.status}`}>{STATUS_LABELS[recommendation.status] || recommendation.status}</span>
                </div>
                <p>
                  Ubicación:{' '}
                  {recommendation.location_name
                    ? `${recommendation.location_name} — ${recommendation.location_city}`
                    : getLocationName(recommendation.location_id) || <span className="missing-location">desconocida</span>}
                </p>
                <dl className="property-details">
                  <div><dt>Prioridad</dt><dd>{PRIORITY_LABELS[recommendation.priority] || 'Sin definir'}</dd></div>
                  <div><dt>Confianza</dt><dd>{recommendation.confidence != null ? `${(recommendation.confidence * 100).toFixed(0)}%` : 's/d'}</dd></div>
                  <div><dt>Puntaje</dt><dd>{recommendation.score ?? 's/d'}</dd></div>
                  <div><dt>Análisis origen</dt><dd>{recommendation.analysis_project_name || 'Manual'}</dd></div>
                </dl>
                {recommendation.expected_impact && <p className="auth-hint">{recommendation.expected_impact}</p>}
                {recommendation.review_notes && (
                  <p className="auth-hint">
                    Revisado por {recommendation.reviewed_by_name || 'N/D'}: “{recommendation.review_notes}”
                  </p>
                )}
                <ReviewControls recommendation={recommendation} onReview={handleReview} />
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setExpandedId(expandedId === recommendation.recommendation_id ? null : recommendation.recommendation_id)}
                >
                  {expandedId === recommendation.recommendation_id ? 'Ocultar detalle técnico' : 'Ver detalle técnico'}
                </button>
                {expandedId === recommendation.recommendation_id && (
                  <pre className="technical-detail">{JSON.stringify(recommendation.result, null, 2)}</pre>
                )}
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export default Recommendations;
