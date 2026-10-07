import { useState } from 'react';
import { apiRequest } from '../lib/api';
import './AnalysisCommandBar.css';

const EXAMPLES = [
  'Analizar Medellín',
  'Evaluar Valle de Aburrá para un centro logístico',
  'Comparar Medellín, Bogotá y Cali',
  'Analizar riesgo territorial de Quibdó',
  'Buscar oportunidades inmobiliarias en Antioquia',
];

function candidateCenter(candidate) {
  if (candidate.geometry?.type === 'Point') return candidate.geometry.coordinates;
  if (candidate.bounds?.length === 4) {
    return [(candidate.bounds[0] + candidate.bounds[2]) / 2, (candidate.bounds[1] + candidate.bounds[3]) / 2];
  }
  return null;
}

function AnalysisCommandBar({ onOpenTerritory }) {
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const createPlan = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setPlan(null);
    try {
      const response = await apiRequest('/analysis/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo preparar el análisis.');
      setPlan(data);
    } catch (requestError) {
      setError(requestError.message || 'No se pudo preparar el análisis.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="analysis-command" aria-labelledby="analysis-command-title">
      <p className="section-kicker">INTELIGENCIA TERRITORIAL</p>
      <h2 id="analysis-command-title">¿Qué quieres analizar?</h2>
      <form onSubmit={createPlan}>
        <label className="sr-only" htmlFor="analysis-command-input">Describe tu objetivo territorial</label>
        <input
          id="analysis-command-input"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe tu objetivo territorial o de inversión"
          minLength={3}
          maxLength={500}
          required
        />
        <button type="submit" disabled={busy || prompt.trim().length < 3}>
          {busy ? 'Buscando territorio…' : 'Preparar análisis'}
        </button>
      </form>
      <div className="analysis-command-examples" aria-label="Ejemplos de análisis">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" onClick={() => { setPrompt(example); setPlan(null); setError(''); }}>
            {example}
          </button>
        ))}
      </div>
      {error && <p className="analysis-command-message error" role="alert">{error}</p>}
      {plan && (
        <div className="analysis-plan" aria-live="polite">
          <p className="analysis-command-message">{plan.message}</p>
          {plan.data_status && <p className="analysis-command-message">Cobertura analítica: {plan.data_status}</p>}
          {plan.territoryCandidates.length > 0 && (
            <ul>
              {plan.territoryCandidates.map((candidate) => {
                const name = candidate.properties?.name || candidate.properties?.nombre || candidate.matchedQuery;
                const center = candidateCenter(candidate);
                const data = candidate.data;
                const missingInputs = data?.data_quality?.missing_inputs || [];
                return (
                  <li key={candidate.id}>
                    <span>
                      <strong>{name}</strong>
                      <small>{candidate.objectType} · {candidate.matchedQuery} · {data?.status || 'datos no consultados'}</small>
                      {data?.data_quality && (
                        <small>{data.data_quality.source_count} fuentes · Confianza no calculada</small>
                      )}
                      {missingInputs.length > 0 && <small>Falta: {missingInputs.join(', ')}</small>}
                      {data?.risk?.status === 'insufficient_data' && <small>Riesgo: datos insuficientes</small>}
                    </span>
                    <button
                      type="button"
                      disabled={!center}
                      onClick={() => onOpenTerritory(candidate, center)}
                    >
                      Abrir en mapa
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default AnalysisCommandBar;