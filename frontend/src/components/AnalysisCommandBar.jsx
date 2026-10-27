import { useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import './AnalysisCommandBar.css';
import { coordinatesOf, territoryType } from '../lib/territory';

const EXAMPLES = [
  'Analizar Medellín',
  'Evaluar Valle de Aburrá para un centro logístico',
  'Comparar Medellín, Bogotá y Cali',
  'Analizar riesgo territorial de Quibdó',
  'Buscar oportunidades inmobiliarias en Antioquia',
];

function candidateCenter(candidate) {
  const pair = coordinatesOf(candidate);
  if (pair) return pair;
  const bounds = candidate.bounds || candidate.bbox;
  if (bounds?.length === 4) {
    return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  }
  return null;
}

function comparisonCandidates(plan) {
  const candidatesByTerritory = new Map();
  for (const candidate of plan.territoryCandidates || []) {
    const territoryName = candidate.matchedQuery || candidate.properties?.name || candidate.name;
    if (!territoryName || candidatesByTerritory.has(territoryName)) continue;
    const center = candidateCenter(candidate);
    if (!center || !Number.isFinite(Number(center[0])) || !Number.isFinite(Number(center[1]))) continue;
    candidatesByTerritory.set(territoryName, {
      ...candidate,
      id: String(candidate.id || `territory:${territoryName}`),
      name: candidate.name || candidate.properties?.name || territoryName,
      displayName: candidate.displayName || candidate.properties?.displayName || candidate.properties?.name || territoryName,
      city: candidate.city || candidate.municipality || candidate.properties?.city || territoryName,
      region: candidate.region || candidate.properties?.region || null,
      country: candidate.country || candidate.properties?.country || null,
      lat: Number(center[1]),
      lng: Number(center[0]),
      coordinates: [Number(center[0]), Number(center[1])],
      bbox: candidate.bbox || candidate.bounds || null,
      source: candidate.source || candidate.provider || candidate.provenance?.source || null,
      matchedQuery: territoryName,
    });
  }

  const unique = [];
  const keys = new Set();
  for (const candidate of candidatesByTerritory.values()) {
    const normalizedName = candidate.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const key = `${normalizedName}:${candidate.lat.toFixed(5)}:${candidate.lng.toFixed(5)}`;
    if (!keys.has(key)) {
      keys.add(key);
      unique.push(candidate);
    }
  }
  return unique;
}

function AnalysisCommandBar({ onOpenTerritory, onOpenComparison }) {
  const requestActive = useRef(false);
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const createPlan = async (event, override) => {
    event?.preventDefault();
    if (requestActive.current) return;
    requestActive.current = true;
    setBusy(true);
    setError('');
    setPlan(null);
    const requestId = globalThis.crypto?.randomUUID?.() || `analysis-${Date.now()}`;
    let response = null;
    let data = null;
    try {
      const objective = override || prompt;
      response = await apiRequest(`/spatial/intent?${new URLSearchParams({ q: objective })}`);
      data = await response.json();
      if (!response.ok) {
        if (response.status === 401) throw new Error('Tu sesión venció. Inicia sesión de nuevo.');
        if (response.status === 403) throw new Error('No tienes permisos para preparar este análisis.');
        if (response.status === 404) throw new Error('El servicio de análisis solicitado no está disponible.');
        if (response.status === 429) {
          const retryAfter = Math.max(1, Number(response.headers.get('Retry-After') || 60));
          throw new Error(`Has realizado demasiadas solicitudes. Puedes volver a intentarlo en ${Math.ceil(retryAfter / 60)} minutos.`);
        }
        if (response.status === 503) throw new Error(data.error || 'El servicio territorial no está disponible temporalmente.');
        if (response.status >= 500) throw new Error('El servicio de análisis no pudo completar la solicitud.');
        throw new Error(data.error || 'No se pudo preparar el análisis.');
      }
      setPlan(data);
    } catch (requestError) {
      console.error('Analysis plan request failed', {
        endpoint: '/api/analysis/plan',
        method: 'POST',
        timestamp: new Date().toISOString(),
        requestId,
        status: response?.status || null,
        errorName: requestError?.name || 'Error',
      });
      setError(requestError instanceof TypeError
        ? 'No fue posible conectar con el servicio de análisis.'
        : requestError.message || 'No se pudo preparar el análisis.');
    } finally {
      requestActive.current = false;
      setBusy(false);
    }
  };

  const resolvedComparisonCandidates = plan?.intentType === 'comparison' ? comparisonCandidates(plan) : [];
  const displayedTerritoryCandidates = plan?.intentType === 'comparison'
    ? resolvedComparisonCandidates
    : plan?.territoryCandidates || [];

  return (
    <section className="analysis-command" aria-labelledby="analysis-command-title">
      <p className="section-kicker">INTELIGENCIA TERRITORIAL</p>
      <h2 id="analysis-command-title">¿Qué quieres analizar?</h2>
      <p id="analysis-command-help" className="auth-hint">Escribe un lugar o un objetivo, por ejemplo: «Analizar Bello».</p>
      <form onSubmit={createPlan}>
        <label className="sr-only" htmlFor="analysis-command-input">Describe tu objetivo territorial</label>
        <input
          id="analysis-command-input"
          type="text"
          aria-describedby="analysis-command-help"
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
          <button key={example} type="button" disabled={busy} onClick={() => { setPrompt(example); createPlan(null, example); }}>
            {example}
          </button>
        ))}
      </div>
      {error && <p className="analysis-command-message error" role="alert">{error}</p>}
      {plan && (
        <div className="analysis-plan" aria-live="polite">
          <p className="analysis-command-message">{plan.message}</p>
          {plan.data_status && <p className="analysis-command-message">Cobertura analítica: {plan.data_status}</p>}
          {displayedTerritoryCandidates.length > 0 && (
            <ul>
              {displayedTerritoryCandidates.map((candidate) => {
                const name = candidate.name || candidate.properties?.name || candidate.properties?.nombre || candidate.matchedQuery;
                const center = candidateCenter(candidate);
                const data = candidate.data;
                const missingInputs = data?.data_quality?.missing_inputs || [];
                return (
                  <li key={candidate.id}>
                    <span>
                      <strong>{name}</strong>
                      <small>{territoryType(candidate.type || candidate.objectType)} · {candidate.displayName || candidate.matchedQuery}</small>
                      {data?.data_quality && (
                        <small>{data.data_quality.source_count} fuentes · Confianza no calculada</small>
                      )}
                      {missingInputs.length > 0 && <small>Falta: {missingInputs.join(', ')}</small>}
                      {data?.risk?.status === 'insufficient_data' && <small>Riesgo: datos insuficientes</small>}
                    </span>
                    <button
                      type="button"
                      disabled={!center}
                      onClick={() => onOpenTerritory(candidate, center, plan)}
                    >
                      Abrir en mapa
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {plan.intentType === 'comparison' && (
            <div className="analysis-comparison-ready">
              <p><strong>Comparación preparada</strong> · {resolvedComparisonCandidates.length} de {(plan.territories || plan.territoryQueries || []).length} territorios resueltos.</p>
              {(resolvedComparisonCandidates.length < 2 || resolvedComparisonCandidates.length !== plan.territoryQueries.length) && <p>No se puede abrir la comparación hasta resolver todos los territorios solicitados (entre dos y seis).</p>}
              <button
                type="button"
                disabled={(resolvedComparisonCandidates.length < 2 || resolvedComparisonCandidates.length !== plan.territoryQueries.length)}
                onClick={() => onOpenComparison?.(plan, resolvedComparisonCandidates)}
              >
                Revisar candidatos en Comparator
              </button>
            </div>
          )}
        </div>
      )}
      {error && <button type="button" className="secondary" disabled={busy} onClick={() => createPlan()}>Reintentar</button>}
    </section>
  );
}

export default AnalysisCommandBar;
