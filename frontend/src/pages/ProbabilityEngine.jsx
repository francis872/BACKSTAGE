import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

const DATASETS = [
  { key: 'pedestrian_flow_day', label: 'Flujo peatonal diario' },
  { key: 'commercial_rent_cop_m2', label: 'Renta comercial (COP/m²)' },
];

const CHARTS = [
  { file: 'histogram_unit.png', label: '1. Histograma unitario' },
  { file: 'all_distributions_pdf.png', label: '2. Distribuciones probadas' },
  { file: 'top_pdfs_overlay.png', label: '3. Mejores PDFs superpuestas' },
  { file: 'best_pdf_vs_hist.png', label: '4. Mejor PDF sobre histograma' },
  { file: 'ecdf_vs_best_cdf.png', label: '5. ECDF vs CDF' },
  { file: 'cdf_survival.png', label: '6. CDF y 1-CDF' },
  { file: 'bhattacharyya_ranking.png', label: '7. Ranking Bhattacharyya' },
  { file: 'ks_ranking.png', label: '8. Ranking KS' },
  { file: 'bhattacharyya_threshold.png', label: '9. Umbral Bhattacharyya' },
  { file: 'ks_threshold.png', label: '10. Umbral KS' },
  { file: 'metrics_table.png', label: '11. Tabla de métricas' },
];

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function ProbabilityEngine({ onNavigate, operationalContext }) {
  const [selectedDataset, setSelectedDataset] = useState(DATASETS[0].key);
  const [summary, setSummary] = useState(null);
  const [analysisRuns, setAnalysisRuns] = useState([]);
  const [message, setMessage] = useState('');
  const [expandedChart, setExpandedChart] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedForProject, setSavedForProject] = useState(false);

  useEffect(() => {
    let mounted = true;
    setMessage('');
    setSummary(null);

    fetch(`/probability/output/${selectedDataset}/analysis_summary.json`)
      .then((res) => {
        if (!res.ok) throw new Error('No se pudo cargar el resumen probabilístico.');
        return res.json();
      })
      .then((data) => {
        if (mounted) setSummary(data);
      })
      .catch((error) => {
        if (mounted) setMessage(error.message);
      });

    return () => {
      mounted = false;
    };
  }, [selectedDataset]);

  useEffect(() => {
    let mounted = true;
    apiRequest('/analysis?limit=8')
      .then((res) => res.json())
      .then((data) => {
        if (mounted) {
          setAnalysisRuns(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (mounted) setAnalysisRuns([]);
      });
    return () => {
      mounted = false;
    };
  }, []);


  const persistProbabilityResult = async () => {
    if (!operationalContext?.analysis_run_id || !summary) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await apiRequest(`/analysis/${operationalContext.analysis_run_id}/probability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_key: selectedDataset,
          dataset_label: selectedDatasetLabel,
          selected_distribution: summary.selected_distribution,
          observation_evaluation: summary.observation_evaluation || {},
          integral_validation: summary.integral_validation || {},
          heuristic_note: summary.heuristic_note || null,
          source: 'probability-engine',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar el resultado probabilístico.');
      setSavedForProject(true);
      setMessage(`Resultado probabilístico registrado en el proyecto #${operationalContext.analysis_run_id}.`);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const selectedDatasetLabel = useMemo(
    () => DATASETS.find((item) => item.key === selectedDataset)?.label || selectedDataset,
    [selectedDataset]
  );

  return (
    <section className="stacked-sections">
      <article className="hero probability-hero">
        <p className="eyebrow">Inteligencia matemática aplicada</p>
        <h2>Backstage Probability Engine</h2>
        <p>
          Motor analítico para ajuste de distribuciones, evaluación de colas y selección probabilística de ubicaciones.
          Conecta automáticamente resultados académicos con decisiones operativas del negocio.
        </p>
        <div className="form-actions">
          <button type="button" onClick={() => onNavigate('portfolio-comparator')}>Evaluar ubicaciones</button>
          <button type="button" onClick={() => onNavigate('reports')}>Abrir informe ejecutivo</button>
        </div>
      </article>

      {operationalContext?.analysis_run_id && (
        <article className="form-section">
          <p className="eyebrow">Proyecto operativo activo</p>
          <h3>{operationalContext.project_name || `Análisis #${operationalContext.analysis_run_id}`}</h3>
          <p className="auth-hint">
            Análisis #{operationalContext.analysis_run_id} · {operationalContext.city || 'Sin ciudad'}.
            El resultado probabilístico que confirmes quedará asociado a esta ejecución.
          </p>
        </article>
      )}

      <article className="form-section">
        <h3>Dataset activo</h3>
        <div className="dataset-switcher">
          {DATASETS.map((dataset) => (
            <button
              type="button"
              key={dataset.key}
              className={selectedDataset === dataset.key ? 'active' : ''}
              onClick={() => setSelectedDataset(dataset.key)}
            >
              {dataset.label}
            </button>
          ))}
        </div>
      </article>

      {summary && (
        <article className="form-section">
          <h3>Resultado seleccionado para {selectedDatasetLabel}</h3>
          <div className="metric-grid">
            <article className="metric-card">
              <span>Distribución seleccionada</span>
              <strong>{summary.selected_distribution}</strong>
            </article>
            <article className="metric-card">
              <span>Percentil observado</span>
              <strong>{Number(summary.observation_evaluation?.percentile || 0).toFixed(2)}</strong>
            </article>
            <article className="metric-card">
              <span>Probabilidad acumulada F(x)</span>
              <strong>{formatPercent(summary.observation_evaluation?.cdf)}</strong>
            </article>
            <article className="metric-card">
              <span>Probabilidad cola derecha 1-F(x)</span>
              <strong>{formatPercent(summary.observation_evaluation?.survival_probability)}</strong>
            </article>
            <article className="metric-card">
              <span>Validación ∫h(x)dx</span>
              <strong>{Number(summary.integral_validation?.h_integral || 0).toFixed(5)}</strong>
            </article>
            <article className="metric-card">
              <span>Validación ∫f(x)dx</span>
              <strong>{Number(summary.integral_validation?.f_integral || 0).toFixed(5)}</strong>
            </article>
          </div>
          <p className="auth-hint">{summary.heuristic_note}</p>
          {operationalContext?.analysis_run_id ? (
            <div className="form-actions">
              <button type="button" onClick={persistProbabilityResult} disabled={saving}>
                {saving ? 'Registrando…' : savedForProject ? 'Resultado registrado' : 'Confirmar resultado en proyecto'}
              </button>
              {savedForProject && (
                <button type="button" className="secondary" onClick={() => onNavigate('mission-control')}>
                  Volver al Centro de Operaciones
                </button>
              )}
            </div>
          ) : (
            <p className="message">Abre este motor desde un proyecto del Centro de Operaciones para registrar el resultado.</p>
          )}
        </article>
      )}

      <article className="form-section">
        <h3>Visualizaciones del motor</h3>
        <p className="auth-hint">Haz clic en un gráfico para ampliarlo a tamaño completo.</p>
        <div className="probability-chart-grid">
          {CHARTS.map((chart) => (
            <article
              className={`card probability-chart-card ${expandedChart === chart.file ? 'expanded' : ''}`}
              key={chart.file}
            >
              <h4>{chart.label}</h4>
              <img
                src={`/probability/output/${selectedDataset}/${chart.file}`}
                alt={chart.label}
                loading="lazy"
                onClick={() => setExpandedChart((prev) => (prev === chart.file ? null : chart.file))}
              />
            </article>
          ))}
        </div>
      </article>

      <article className="form-section">
        <h3>Ejecuciones recientes conectadas al ecosistema</h3>
        <div className="card-grid">
          {analysisRuns.slice(0, 4).map((run) => (
            <article className="card" key={run.analysis_run_id}>
              <p className="eyebrow">Análisis #{run.analysis_run_id}</p>
              <h4>{run.project_name}</h4>
              <p>{run.recommendation_text || 'Sin recomendación registrada.'}</p>
              <button type="button" onClick={() => onNavigate('reports')}>Ver informe</button>
            </article>
          ))}
          {analysisRuns.length === 0 && <p className="auth-hint">Aún no hay ejecuciones para mostrar.</p>}
        </div>
      </article>
      {message && <p className="message">{message}</p>}
    </section>
  );
}

export default ProbabilityEngine;
