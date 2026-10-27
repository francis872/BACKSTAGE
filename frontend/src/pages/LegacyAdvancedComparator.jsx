import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import { toCandidate, existingLocationCandidate } from '../lib/comparisonCandidates.mjs';
import { useEffect, useState } from 'react';
import { sourceLabel } from '../lib/sourceLabel.mjs';
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

function AdvancedComparator({ operationalContext, onNavigate }) {
  const [locations, setLocations] = useState([]);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [candidateQuery, setCandidateQuery] = useState('');
  const [submittedCandidateQuery, setSubmittedCandidateQuery] = useState('');
  const [candidateSearchVersion, setCandidateSearchVersion] = useState(0);
  const [geocodeResults, setGeocodeResults] = useState([]);
  const [candidateSearchBusy, setCandidateSearchBusy] = useState(false);
  const [existingLocationId, setExistingLocationId] = useState('');
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [candidateDialogTab, setCandidateDialogTab] = useState('search');
  const [customCandidate, setCustomCandidate] = useState({ name: '', address: '', lat: '', lng: '' });
  const [city, setCity] = useState(operationalContext?.city || '');
  const [projectName, setProjectName] = useState(operationalContext?.project_name || 'Comparador de ubicaciones');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiRequest('/assets?limit=500')
      .then((res) => res.json())
      .then((data) => {
        const rows = Array.isArray(data.data) ? data.data : [];
        setLocations(rows);
        if (!existingLocationId && rows.length) setExistingLocationId(String(rows[0].asset_id));
      })
      .catch(() => setLocations([]));
  }, []);

  useEffect(() => {
    const contextCandidates = Array.isArray(operationalContext?.candidates) ? operationalContext.candidates : [];
    const territory = operationalContext?.territory || operationalContext?.activeTerritory;
    const initial = contextCandidates.length ? contextCandidates : territory ? [territory] : [];
    if (initial.length) setSelectedCandidates((current) => {
      const merged = [...current];
      initial.map((row, index) => toCandidate(row, `context:${index}`)).forEach((candidate) => {
        if (!merged.some((item) => item.id === candidate.id)) merged.push(candidate);
      });
      return merged.slice(0, 6);
    });
  }, [operationalContext?.territory?.id, operationalContext?.territory?.name, operationalContext?.candidates]);

  useEffect(() => {
    const query = submittedCandidateQuery;
    if (query.length < 2) {
      setGeocodeResults([]);
      setCandidateSearchBusy(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCandidateSearchBusy(true);
      const params = new URLSearchParams({ q: query, limit: '5' });
      try {
        const response = await apiRequest(`/spatial/geocode?${params}`, { signal: controller.signal });
        const rows = await response.json();
        if (!response.ok) throw new Error(rows.error || 'No se pudieron resolver candidatos.');
        setGeocodeResults(Array.isArray(rows) ? rows.map((row) => toCandidate(row, `geocode:${row.id}`)) : []);
      } catch (error) {
        if (!controller.signal.aborted) setMessage(`Geocodificación: ${error.message}`);
      } finally {
        if (!controller.signal.aborted) setCandidateSearchBusy(false);
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [submittedCandidateQuery, candidateSearchVersion]);


  useEffect(() => {
    if (!operationalContext?.analysis_run_id) return;
    apiRequest(`/analysis/${operationalContext.analysis_run_id}/candidates`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'No se pudieron cargar candidatos del proyecto.');
        const projectCandidates = (Array.isArray(data) ? data : []).map((row) => {
          const location = row.location_id != null ? locations.find((entry) => entry.location_id != null && Number(entry.location_id) === Number(row.location_id)) : null;
          return location ? existingLocationCandidate(location) : toCandidate(row, `analysis:${row.candidate_id || row.id}`);
        });
        setSelectedCandidates((current) => {
          const merged = [...current];
          projectCandidates.forEach((candidate) => {
            if (!merged.some((item) => item.id === candidate.id)) merged.push(candidate);
          });
          return merged.slice(0, 6);
        });
      })
      .catch((error) => setMessage(`Error: ${error.message}`));
  }, [operationalContext?.analysis_run_id, locations]);

  const addCandidate = (candidate) => {
    const normalized = toCandidate(candidate, `candidate:${Date.now()}`);
    if (normalized.lat == null || normalized.lng == null) {
      setMessage('El candidato no tiene coordenadas utilizables.');
      return;
    }
    if (selectedCandidates.some((item) => item.id === normalized.id)) return;
    if (selectedCandidates.length >= 6) return setMessage('El comparador admite hasta 6 candidatos.');
    const next = [...selectedCandidates, normalized];
    setSelectedCandidates(next);
    onNavigate?.('portfolio-comparator', { ...operationalContext, candidates: next });
    setMessage('');
  };

  const editCandidate = (id, patch) => {
    setSelectedCandidates((current) => current.map((candidate) => candidate.id === id ? { ...candidate, ...patch } : candidate));
  };

  const removeCandidate = (id) => {
    const next = selectedCandidates.filter((candidate) => candidate.id !== id);
    setSelectedCandidates(next);
    onNavigate?.('portfolio-comparator', { ...operationalContext, candidates: next });
  };

  const persistCandidates = () => onNavigate?.('portfolio-comparator', { ...operationalContext, candidates: selectedCandidates });

  const addCustomCandidate = (event) => {
    event.preventDefault();
    const lat = Number(customCandidate.lat);
    const lng = Number(customCandidate.lng);
    if (!customCandidate.name.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90
      || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setMessage('Indica un nombre y, en Ubicación avanzada, coordenadas WGS84 válidas; también puedes seleccionar el punto en el mapa.');
      return;
    }
    addCandidate({
      id: `custom:${Date.now()}`,
      name: customCandidate.name.trim(),
      address: customCandidate.address.trim() || null,
      city: city || null,
      type: 'custom_coordinate',
      lat,
      lng,
      source: 'Coordenada indicada por el usuario',
    });
    setCustomCandidate({ name: '', address: '', lat: '', lng: '' });
    setCandidateDialogOpen(false);
  };

  const resolveCustomAddress = () => {
    const address = customCandidate.address.trim();
    if (address.length < 2) return setMessage('Escribe una dirección o lugar para buscarlo.');
    setCandidateQuery(address);
    setSubmittedCandidateQuery(address);
    setCandidateSearchVersion((v) => v + 1);
    setCandidateDialogTab('search');
  };

  const runComparison = async (event) => {
    event.preventDefault();
    setResult(null);
    setMessage('');
    if (selectedCandidates.length < 2) {
      setMessage('Añade al menos 2 candidatos para ejecutar la comparación.');
      return;
    }

    try {
      const payload = {
        analysis_run_id: operationalContext?.analysis_run_id || undefined,
        project_name: projectName,
        city,
        candidates: selectedCandidates.map((candidate) => ({
          id: candidate.id,
          ...(candidate.location_id ? { location_id: candidate.location_id } : {}),
          name: candidate.name,
          city: candidate.city || candidate.region || city || null,
          region: candidate.region,
          country: candidate.country,
          lat: candidate.lat,
          lng: candidate.lng,
          bbox: candidate.bbox,
          geometry: candidate.geometry,
          type: candidate.type,
          source: candidate.source,
        })),
      };

      const res = await apiRequest('/analysis/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo ejecutar la comparación.');
      const rankedCandidates = selectedCandidates.map((candidate) => ({
        ...candidate,
        rank: data.ranking?.find((row) => row.candidate_name === candidate.name)?.rank_position || null,
      }));
      setSelectedCandidates(rankedCandidates);
      setResult(data);
      onNavigate?.('portfolio-comparator', {
        analysis_run_id: data.analysis_run_id,
        project_name: data.project_name || projectName,
        city: data.city || city || null,
        territory: operationalContext?.territory || null,
        candidates: rankedCandidates,
      });
      if (data.analysis_run_id) {
        setMessage(`Comparación persistida como proyecto operativo #${data.analysis_run_id}.`);
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <section>
      <h2>Comparador de ubicaciones</h2>
      <div className="comparator-sections">
        <section className="form-section">
          <h3>1. Análisis</h3>
          <div className="field-row"><label>Nombre</label><input value={projectName} onChange={(event) => setProjectName(event.target.value)} required /></div>
          <div className="field-row"><label>Contexto (opcional)</label><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ciudad o región" /></div>
        </section>

        <section className="form-section">
          <div className="score-row"><div><h3>2. Candidatos</h3><span className="auth-hint">Mínimo 3 recomendado · máximo 6</span></div><button type="button" onClick={() => { setCandidateDialogTab('search'); setCandidateDialogOpen(true); }}>+ Añadir candidato</button></div>
          {selectedCandidates.length === 0 ? <p className="auth-hint">Añade un lugar, activo, proyecto o coordenada para comenzar.</p> : (
            <div className="card-grid">
              {selectedCandidates.map((candidate) => (
                <article className="card" key={candidate.id}>
                  <div className="score-row"><div><strong>{candidate.rank ? `#${candidate.rank} ` : ''}{candidate.displayName || candidate.name}</strong><p className="auth-hint">{candidate.region || ''}{candidate.country ? ` · ${candidate.country}` : ''}</p></div><button type="button" className="secondary" onClick={() => removeCandidate(candidate.id)}>Quitar</button></div>
                  <details>
                    <summary>Editar candidato</summary>
                    <div className="field-row"><label>Nombre visible</label><input value={candidate.name} onChange={(event) => editCandidate(candidate.id, { name: event.target.value, displayName: event.target.value })} onBlur={persistCandidates} /></div>
                    <div className="field-row"><label>Categoría</label><select value={candidate.type} onChange={(event) => editCandidate(candidate.id, { type: event.target.value })} onBlur={persistCandidates}><option value="city">Ciudad</option><option value="municipality">Municipio</option><option value="neighborhood">Barrio</option><option value="existing_location">Ubicación BACKSTAGE</option><option value="asset">Activo</option><option value="project">Proyecto</option><option value="custom_coordinate">Coordenada propia</option>{!['city', 'municipality', 'neighborhood', 'existing_location', 'asset', 'project', 'custom_coordinate'].includes(candidate.type) && <option value={candidate.type}>{candidate.type}</option>}</select></div>
                    <div className="field-row"><label>Ciudad / municipio</label><input value={candidate.city || ''} onChange={(event) => editCandidate(candidate.id, { city: event.target.value })} onBlur={persistCandidates} /></div>
                    <div className="field-row"><label>Región</label><input value={candidate.region || ''} onChange={(event) => editCandidate(candidate.id, { region: event.target.value })} onBlur={persistCandidates} /></div>
                    <div className="field-row"><label>País</label><input value={candidate.country || ''} onChange={(event) => editCandidate(candidate.id, { country: event.target.value })} onBlur={persistCandidates} /></div>
                  </details>
                  <p className="auth-hint">{sourceLabel(candidate.source)} · {candidate.lat?.toFixed(5)}, {candidate.lng?.toFixed(5)}</p>
                  <div className="form-actions">
                    <button type="button" className="secondary" onClick={() => onNavigate?.('territorial-explorer', { ...operationalContext, territory: candidate, candidates: selectedCandidates, city: candidate.city || candidate.name, longitude: candidate.lng, latitude: candidate.lat })}>Ver en mapa</button>
                    <button type="button" className="secondary" onClick={() => onNavigate?.('earthart', { ...operationalContext, territory: candidate, candidates: selectedCandidates, city: candidate.city || candidate.name, longitude: candidate.lng, latitude: candidate.lat })}>AirHeart</button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="form-actions"><button type="button" className="secondary" onClick={() => { setCandidateDialogTab('search'); setCandidateDialogOpen(true); }}>+ Añadir otro candidato</button></div>
        </section>

        <section className="form-section">
          <h3>3. Resultados</h3>
          <p className="auth-hint">El motor requiere al menos dos candidatos válidos; se recomiendan tres para una comparación útil.</p>
          <button type="button" onClick={runComparison} disabled={selectedCandidates.length < 2}>Ejecutar comparación ({selectedCandidates.length}/3 recomendado)</button>
        </section>
      </div>

      <Modal isOpen={candidateDialogOpen} onClose={() => setCandidateDialogOpen(false)} title="Añadir candidato" size="lg">

              <div className="form-actions" role="group" aria-label="Método de selección">
                {[["search", 'Buscar lugar'], ['map', 'Elegir en mapa'], ['custom', 'Ubicación propia']].map(([key, label]) => <Button key={key} aria-pressed={candidateDialogTab === key} variant={candidateDialogTab === key ? 'primary' : 'secondary'} onClick={() => setCandidateDialogTab(key)}>{label}</Button>)}
              </div>
              {candidateDialogTab === 'search' && (
                <div>
                  <Input id="comparison-geocoder" label="Ciudad, municipio, dirección o lugar" autoFocus value={candidateQuery} onChange={(event) => setCandidateQuery(event.target.value)} placeholder="Ciudad, municipio, dirección…" />
                  <button type="button" disabled={candidateSearchBusy || candidateQuery.trim().length < 2} onClick={() => { setSubmittedCandidateQuery(candidateQuery.trim()); setCandidateSearchVersion((v) => v + 1); }}>Buscar candidatos</button>
                  {candidateSearchBusy && <p className="auth-hint" role="status">Buscando…</p>}
                  {geocodeResults.length > 0 && <div className="candidate-list">{geocodeResults.map((candidate) => <div className="candidate-item" key={candidate.id}><span><strong>{candidate.displayName}</strong><small>{candidate.type} · {candidate.region || 'Región no indicada'} · {candidate.country || 'País no indicado'}</small></span><button type="button" onClick={() => { addCandidate(candidate); setCandidateQuery(''); setGeocodeResults([]); setCandidateDialogOpen(false); }}>Añadir</button></div>)}</div>}
                  <div className="field-row"><label htmlFor="comparison-existing-location">Ubicación existente en BACKSTAGE</label><div className="form-actions"><select id="comparison-existing-location" value={existingLocationId} onChange={(event) => setExistingLocationId(event.target.value)}>{locations.filter((location) => location.latitude != null && location.longitude != null).map((location) => <option key={location.asset_id} value={location.asset_id}>{location.name} · {location.city}</option>)}</select><button type="button" className="secondary" disabled={!existingLocationId} onClick={() => { const location = locations.find((entry) => String(entry.asset_id) === existingLocationId); if (location) { addCandidate(existingLocationCandidate(location)); setCandidateDialogOpen(false); } }}>Añadir ubicación</button></div></div>
                </div>
              )}
              {candidateDialogTab === 'map' && <div className="form-section"><p>Selecciona un punto en el mapa para añadir una ubicación propia.</p><button type="button" onClick={() => { setCandidateDialogOpen(false); onNavigate?.('territorial-explorer', { ...operationalContext, candidatePicker: true, candidateDraftName: customCandidate.name || 'Ubicación personalizada', candidateDraftAddress: customCandidate.address || null, candidates: selectedCandidates }); }}>Abrir mapa</button></div>}
              {candidateDialogTab === 'custom' && <div>
                <Input label="Nombre del sitio" value={customCandidate.name} onChange={(event) => setCustomCandidate((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre del sitio" />
                <Input label="Dirección o descripción" value={customCandidate.address} onChange={(event) => setCustomCandidate((current) => ({ ...current, address: event.target.value }))} placeholder="Dirección, barrio o descripción" />
                <div className="form-actions"><button type="button" className="secondary" onClick={resolveCustomAddress}>Resolver dirección</button><button type="button" onClick={() => { setCandidateDialogOpen(false); onNavigate?.('territorial-explorer', { ...operationalContext, candidatePicker: true, candidateDraftName: customCandidate.name || 'Ubicación personalizada', candidateDraftAddress: customCandidate.address || null, candidates: selectedCandidates }); }}>Elegir en mapa</button></div>
                <details><summary>Coordenadas avanzadas</summary><form className="form-actions" onSubmit={addCustomCandidate}><input aria-label="Latitud" type="number" min="-90" max="90" step="any" placeholder="Latitud" value={customCandidate.lat} onChange={(event) => setCustomCandidate((current) => ({ ...current, lat: event.target.value }))} /><input aria-label="Longitud" type="number" min="-180" max="180" step="any" placeholder="Longitud" value={customCandidate.lng} onChange={(event) => setCustomCandidate((current) => ({ ...current, lng: event.target.value }))} /><button type="submit">Añadir coordenada</button></form></details>
              </div>}
      </Modal>
      {message && <p className="message">{message}</p>}

      {result && (
        <div className="stacked-sections">
          <article className="form-section">
            <p className="eyebrow">Proyecto operativo</p>
            <h3>Análisis # {result.analysis_run_id}</h3>
            <p className="auth-hint">
              Esta comparación ya está persistida y puede continuar por el flujo operacional.
            </p>
            {onNavigate && result.analysis_run_id && (
              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => onNavigate('probability-engine', {
                    analysis_run_id: result.analysis_run_id,
                    project_name: result.project_name,
                    city: result.city,
                  })}
                >
                  Continuar al Motor Probabilístico
                </button>
              </div>
            )}
          </article>

          <article className="form-section">
            <h3>Ranking</h3>
            <p className="auth-hint">
              Método: <strong>{(result.ranking_method || 'topsis').toUpperCase()}</strong>
              {result.analytics_job_id && <> · Ejecución registrada #{result.analytics_job_id}</>}
            </p>
            <p><strong>Recomendación:</strong> {result.recommendation}</p>
            <div className="card-grid">
              {(result.ranking || []).map((row) => (
                <article className="card" key={`${row.rank_position}-${row.candidate_name}`}>
                  <div className="score-row">
                    <h3>#{row.rank_position} {row.candidate_name}</h3>
                    <span className="score">{row.score_total}</span>
                  </div>
                  <DimensionBreakdown scores={row.score_by_dimension} />
                  <button type="button" className="secondary" onClick={() => {
                    const candidate = selectedCandidates.find((item) => item.name === row.candidate_name);
                    if (candidate) onNavigate?.('territorial-explorer', { ...operationalContext, territory: candidate, city: candidate.city || candidate.name, longitude: candidate.lng, latitude: candidate.lat, candidates: selectedCandidates });
                  }}>Ver en mapa</button>
                </article>
              ))}
            </div>
          </article>

          <article className="form-section">
            <h3>Matriz comparativa</h3>
            {(result.pairwise || []).map((row) => (
              <div key={`${row.left_candidate}-${row.right_candidate}`} className="pairwise-card">
                <h4>{row.left_candidate} vs {row.right_candidate}</h4>
                <p>Ganador: <strong>{row.winner}</strong> · Delta total: {row.score_delta_total}</p>
                <ul>
                  {row.dimensions.map((dimension) => (
                    <li key={`${row.left_candidate}-${row.right_candidate}-${dimension.dimension}`}>
                      {dimension.dimension}: {dimension.left_score} vs {dimension.right_score} (Δ {dimension.delta}, ganador: {dimension.winner})
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </article>

          {result.sensitivity && (
            <article className="form-section">
              <h3>Análisis de sensibilidad</h3>
              <p className="auth-hint">
                Qué tan estable es la recomendación si los pesos de los criterios cambiaran ±
                {Math.round((result.sensitivity.perturbationPct || 0) * 100)}%. Ganador base:{' '}
                <strong>{result.sensitivity.baseWinner}</strong> ·{' '}
                {result.sensitivity.stability.stable
                  ? 'el resultado es estable ante estas variaciones.'
                  : `el ganador cambia en ${result.sensitivity.stability.changedScenarios} de ${result.sensitivity.stability.totalScenarios} escenarios.`}
              </p>
              <div className="card-grid">
                {result.sensitivity.scenarios.map((scenario) => (
                  <article
                    className={`card ${scenario.winnerChanged ? 'sensitivity-changed' : ''}`}
                    key={`${scenario.criterion}-${scenario.weightChange}`}
                  >
                    <p className="eyebrow">{formatDimensionLabel(scenario.criterion)} {scenario.weightChange}</p>
                    <p>Ganador: <strong>{scenario.winner}</strong> ({scenario.winnerScore})</p>
                    <p className="auth-hint">
                      {scenario.winnerChanged ? 'El ganador cambia respecto al escenario base.' : 'Sin cambio respecto al escenario base.'}
                    </p>
                  </article>
                ))}
              </div>
            </article>
          )}
        </div>
      )}
    </section>
  );
}

export default AdvancedComparator;
