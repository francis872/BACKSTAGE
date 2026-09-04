import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

function formatDimensionLabel(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function DimensionBreakdown({ scores }) {
  const entries = Object.entries(scores || {});
  if (entries.length === 0) return null;
  return (
    <div className="dimension-breakdown">
      {entries.map(([dimension, value]) => {
        const numeric = Math.max(0, Math.min(100, Number(value) || 0));
        return (
          <div className="dimension-row" key={dimension}>
            <div className="dimension-row-label">
              <span>{formatDimensionLabel(dimension)}</span>
              <strong>{numeric.toFixed(1)}</strong>
            </div>
            <div className="dimension-bar-track">
              <div className="dimension-bar-fill" style={{ width: `${numeric}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Reports() {
  const [analysisId, setAnalysisId] = useState('');
  const [availableRuns, setAvailableRuns] = useState([]);
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState('');
  const [loadingRuns, setLoadingRuns] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiRequest('/analysis?limit=30')
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        const rows = Array.isArray(data) ? data : [];
        setAvailableRuns(rows);
        if (rows.length > 0) {
          setAnalysisId(String(rows[0].analysis_run_id));
        }
      })
      .catch(() => {
        if (mounted) setMessage('No fue posible cargar las ejecuciones disponibles.');
      })
      .finally(() => {
        if (mounted) setLoadingRuns(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedRun = useMemo(
    () => availableRuns.find((item) => String(item.analysis_run_id) === String(analysisId)),
    [availableRuns, analysisId]
  );

  const loadReport = async (event) => {
    event.preventDefault();
    setMessage('');
    setReport(null);
    try {
      const res = await apiRequest(`/analysis/${analysisId}/report`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el informe.');
      setReport(data);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <section>
      <h2>Informes ejecutivos</h2>
      <p>Informe imprimible completo de análisis con resumen, ranking y anexo metodológico.</p>
      <form className="entity-form form-section" onSubmit={loadReport}>
        <div className="field-row">
          <label>Ejecución disponible</label>
          <select value={analysisId} onChange={(event) => setAnalysisId(event.target.value)} disabled={loadingRuns}>
            {availableRuns.length === 0 && <option value="">Sin ejecuciones disponibles</option>}
            {availableRuns.map((row) => (
              <option key={row.analysis_run_id} value={row.analysis_run_id}>
                #{row.analysis_run_id} · {row.project_name} · {new Date(row.created_at).toLocaleString('es-CO')}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <label>O ID manual</label>
          <input value={analysisId} onChange={(event) => setAnalysisId(event.target.value)} required />
        </div>
        <div className="form-actions">
          <button type="submit" disabled={!analysisId}>Cargar informe</button>
          <button type="button" className="secondary" onClick={() => window.print()} disabled={!report}>Imprimir</button>
        </div>
      </form>
      {selectedRun && (
        <p className="message">
          Seleccionado: {selectedRun.project_name} · {selectedRun.city || 'Sin ciudad'} · {selectedRun.status}
        </p>
      )}
      {message && <p className="message">{message}</p>}

      {report && (
        <article className="form-section report-print">
          <header className="report-header">
            <p className="eyebrow">BACKSTAGE Intelligence Report</p>
            <h3>{report.header.project_name}</h3>
            <p>Ciudad: {report.header.city || 'No especificada'}</p>
            <p>Objetivo: {report.header.objective || 'No especificado'}</p>
            <p>Generado: {new Date(report.generated_at).toLocaleString('es-CO')}</p>
          </header>

          <section>
            <h4>Resumen ejecutivo</h4>
            <p>{report.executive_summary}</p>
          </section>

          <section>
            <h4>Ponderaciones</h4>
            <div className="weight-grid">
              {Object.entries(report.criteria_weights || {}).map(([key, value]) => (
                <div className="metric-card" key={key}>
                  <span>{key}</span>
                  <strong>{(Number(value) * 100).toFixed(1)}%</strong>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h4>Ranking final</h4>
            <div className="card-grid">
              {(report.ranking || []).map((row) => (
                <article className="card" key={`${row.rank_position}-${row.candidate_name}`}>
                  <div className="score-row">
                    <h3>#{row.rank_position} {row.candidate_name}</h3>
                    <span className="score">{row.score_total}</span>
                  </div>
                  <DimensionBreakdown scores={row.score_by_dimension} />
                </article>
              ))}
            </div>
          </section>
        </article>
      )}
    </section>
  );
}

export default Reports;

