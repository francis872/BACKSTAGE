import SpatialAnalysisPanel from '../components/SpatialAnalysisPanel';
import { sourceLabel } from '../lib/sourceLabel.mjs';
import { contextFromProject } from '../lib/projectContext.mjs';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import { toCandidate, existingLocationCandidate } from '../lib/comparisonCandidates.mjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSessionUser } from '../lib/auth';
import { evaluateComparison } from '../../../shared/comparison.mjs';
import { apiRequest } from '../lib/api';
import LegacyAdvancedComparator from './LegacyAdvancedComparator';

function draftKey() {
  const user = getSessionUser();
  return `soi:comparison:${user?.organization_id || 'none'}:${user?.user_id || 'none'}`;
}
function readDraft() {
  try { return JSON.parse(window.sessionStorage.getItem(draftKey()) || 'null') || {}; } catch { return {}; }
}
function newCriterion() {
  return { id: `criterion:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`, name: '', definition: '', unit: '', source: '', weight: 1, direction: 'benefit', normalization: 'minmax', missing: 'block', min: '', max: '' };
}

function ConfigurableComparator({ operationalContext, onNavigate }) {
  const [draft] = useState(readDraft);
  const [locations, setLocations] = useState([]);
  const [selectedCandidates, setSelectedCandidates] = useState(operationalContext?.startComparison ? operationalContext.candidates || [] : draft.candidates || []);
  const [candidateQuery, setCandidateQuery] = useState(draft.candidateQuery || '');
  const [submittedCandidateQuery, setSubmittedCandidateQuery] = useState('');
  const [candidateSearchVersion, setCandidateSearchVersion] = useState(0);
  const [geocodeResults, setGeocodeResults] = useState([]);
  const [candidateSearchBusy, setCandidateSearchBusy] = useState(false);
  const [existingLocationId, setExistingLocationId] = useState('');
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [candidateDialogTab, setCandidateDialogTab] = useState('search');
  const [customCandidate, setCustomCandidate] = useState(draft.customCandidate || { name: '', address: '', lat: '', lng: '' });
  const [city, setCity] = useState(draft.city ?? operationalContext?.city ?? '');
  const [projectName, setProjectName] = useState(operationalContext?.startComparison ? operationalContext.project_name : draft.project_name || operationalContext?.project_name || 'Comparador de ubicaciones');
  const [criteria, setCriteria] = useState(operationalContext?.startComparison ? [newCriterion()] : draft.criteria || [newCriterion()]);
  const [observations, setObservations] = useState(operationalContext?.startComparison ? {} : draft.observations || {});
  const [saveBusy, setSaveBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const savedRef = useRef(saved); savedRef.current = saved;
  const [snapshots, setSnapshots] = useState([]);
  const [openingSnapshot, setOpeningSnapshot] = useState(false);
  const pendingSnapshot = useRef(null);
  const loadedSnapshot = useRef(null);
  const canWrite = ['admin', 'analyst'].includes(getSessionUser()?.role);
  const [projectBusy, setProjectBusy] = useState(false);
  const projectBusyRef = useRef(false);
  const latestInput = useRef(null);
  const savingRef = useRef(false);
  const comparisonInput = useMemo(() => ({ candidates: selectedCandidates, criteria, observations }), [selectedCandidates, criteria, observations]);
  latestInput.current = comparisonInput;
  const draftResult = useMemo(() => evaluateComparison(comparisonInput), [comparisonInput]);
  // Historical results retain their engine version until the user edits a copy.
  const result = saved?.result || draftResult;
  useEffect(() => { setVerification(null); }, [saved?.comparison_id]);
  const [calculatedAt, setCalculatedAt] = useState(null);
  useEffect(() => { setCalculatedAt(new Date().toISOString()); setSaved(pendingSnapshot.current); pendingSnapshot.current = null; }, [comparisonInput]);
  useEffect(() => {
    try { window.sessionStorage.setItem(draftKey(), JSON.stringify({ ...comparisonInput, project_name: projectName, city, customCandidate, candidateQuery })); }
    catch { setMessage('El navegador no permite conservar el borrador; manten esta vista abierta o descarga el resultado.'); }
  }, [comparisonInput, projectName, city, customCandidate, candidateQuery]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    apiRequest('/comparisons', { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudieron consultar las comparaciones guardadas.');
      if (!controller.signal.aborted) setSnapshots(body.data);
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [saved?.comparison_id]);

  const applySnapshot = row => {
    pendingSnapshot.current = row; loadedSnapshot.current = row.comparison_id;
    setProjectName(row.project_name); setSelectedCandidates(row.input.candidates.map(candidate=>({...row.candidate_context?.find(item=>item.id===candidate.id),...candidate})));
    setCriteria(row.input.criteria); setObservations(row.input.observations);
    setMessage(`Comparación #${row.comparison_id} recuperada. Evidencia guardada disponible. Guardar crea una nueva versión.`);
  };
  const openSnapshot = async id => {
    if (openingSnapshot) return;
    setOpeningSnapshot(true);
    try {
      const response = await apiRequest(`/comparisons/${id}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo recuperar la comparación.');
      applySnapshot(body.data);
      onNavigate?.('portfolio-comparator', { ...operationalContext, analysis_run_id: body.data.project_analysis_run_id || null, project: null, project_name: body.data.project_name, candidates: body.data.input.candidates, comparison_id: body.data.comparison_id, comparison_mode: 'configurable', startComparison: false });
    } catch (error) { setMessage(error.message); }
    finally { setOpeningSnapshot(false); }
  };
  useEffect(() => {
    const id = operationalContext?.comparison_id;
    if (!id || Number(loadedSnapshot.current) === Number(id)) return;
    const controller = new AbortController();
    setOpeningSnapshot(true);
    apiRequest(`/comparisons/${id}`, { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo recuperar la comparación.');
      if (!controller.signal.aborted) applySnapshot(body.data);
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); })
      .finally(() => { if (!controller.signal.aborted) setOpeningSnapshot(false); });
    return () => controller.abort();
  }, [operationalContext?.comparison_id]);
  const createProject = async () => {
    if (!saved || projectBusyRef.current) return;
    projectBusyRef.current = true; setProjectBusy(true); setMessage('');
    try {
      const response = await apiRequest(`/comparisons/${saved.comparison_id}/project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ territory: operationalContext?.projectTerritory || operationalContext?.territory, project_name: saved.project_name, ...(operationalContext?.analysis_run_id?{analysis_run_id:operationalContext.analysis_run_id}:{}) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo crear el proyecto.');
      onNavigate?.('portfolio-projects', { ...contextFromProject(body.data, getSessionUser().organization_id), startComparison: false });
    } catch (error) { setMessage(error.message); }
    finally { projectBusyRef.current = false; setProjectBusy(false); }
  };

  useEffect(() => {
    apiRequest('/assets?limit=500')
      .then((res) => res.json())
      .then((data) => {
        const rows = Array.isArray(data.data) ? data.data : [];
        setLocations(rows);
        if (!existingLocationId && rows.length) setExistingLocationId(String(rows[0].asset_id || rows[0].location_id));
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
      return merged.length === current.length ? current : merged.slice(0, 6);
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
    if (!operationalContext?.analysis_run_id || operationalContext?.comparison_id) return;
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
          return merged.length === current.length ? current : merged.slice(0, 6);
        });
      })
      .catch((error) => setMessage(`Error: ${error.message}`));
  }, [operationalContext?.analysis_run_id, locations]);

  const addCandidate = (candidate) => {
    const normalized = toCandidate(candidate, `candidate:${Date.now()}`);
    if (normalized.lat == null || normalized.lng == null || Math.abs(normalized.lat) > 90 || Math.abs(normalized.lng) > 180) {
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
    if (!customCandidate.lat.trim() || !customCandidate.lng.trim() || !customCandidate.name.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90
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

  const updateCriterion = (id, patch) => setCriteria((current) => current.map((criterion) => criterion.id === id ? { ...criterion, ...patch } : criterion));
  const updateObservation = (candidateId, criterionId, patch) => setObservations((current) => ({ ...current, [candidateId]: { ...current[candidateId], [criterionId]: { ...current[candidateId]?.[criterionId], ...patch } } }));
  const runComparison = async () => {
    if (result.status !== 'ready' || savingRef.current) return;
    savingRef.current = true;
    const submittedInput = comparisonInput;
    setSaveBusy(true);
    setMessage('');
    try {
      const response = await apiRequest('/comparisons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...comparisonInput, project_name: projectName, city }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la comparacion.');
      if (latestInput.current !== submittedInput) { setMessage('Se guardo la version enviada; los cambios posteriores aun no se han guardado.'); return; }
      const row = data.data || data;
      setSaved(row); loadedSnapshot.current = row.comparison_id;
      onNavigate?.('portfolio-comparator', { ...operationalContext, analysis_run_id: row.project_analysis_run_id || null, project: null, project_name: row.project_name, comparison_id: row.comparison_id, comparison_mode: 'configurable', candidates: selectedCandidates, startComparison: false });
      setMessage('Comparación guardada en la organización activa.');
    } catch (error) { setMessage(`Error: ${error.message}`); }
    finally { savingRef.current = false; setSaveBusy(false); }
  };
  const checkReproducibility = async () => {
    if (!saved || verifying) return;
    const id = saved.comparison_id; setVerifying(true);
    try {
      const response = await apiRequest(`/comparisons/${id}/reproducibility`);
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'No se pudo comprobar el análisis.');
      if (savedRef.current?.comparison_id === id) setVerification(body.data);
    } catch (error) { if (savedRef.current?.comparison_id === id) setVerification({ status: 'unavailable', verified: false, message: error.message }); }
    finally { setVerifying(false); }
  };
  const downloadComparison = async () => {
    let content = { format: 'backstage-comparison-draft-1', draft: true, ...comparisonInput, project_name: projectName, city, calculated_at: calculatedAt, result: draftResult };
    if (saved) {
      const id = saved.comparison_id;
      try {
        const response = await apiRequest(`/comparisons/${id}/export`);
        const body = await response.json(); if (!response.ok) throw new Error(body.error || 'No se pudo descargar el análisis guardado.');
        if (savedRef.current?.comparison_id !== id) return;
        content = body;
      } catch (error) { setMessage(error.message); return; }
    }
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'backstage-comparacion.json'; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <section>
      <h2>Comparador de ubicaciones</h2>
      <details><summary>Comparaciones guardadas</summary>
        {snapshots.length ? <ul>{snapshots.map(row => <li key={row.comparison_id}>{row.project_name} · #{row.comparison_id} <button type="button" className="secondary" disabled={openingSnapshot} onClick={() => openSnapshot(row.comparison_id)}>Cargar comparación #{row.comparison_id}</button></li>)}</ul> : <p>No hay comparaciones guardadas en la organización.</p>}
      </details>
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
                    <div className="field-row"><label>Descripcion</label><input value={candidate.description || ''} onChange={(event) => editCandidate(candidate.id, { description: event.target.value })} /></div>
                    <div className="field-row"><label>Latitud WGS84</label><input type="number" step="any" min="-90" max="90" value={candidate.lat ?? ''} onChange={(event) => editCandidate(candidate.id, { lat: event.target.value === '' ? null : Number(event.target.value) })} /></div>
                    <div className="field-row"><label>Longitud WGS84</label><input type="number" step="any" min="-180" max="180" value={candidate.lng ?? ''} onChange={(event) => editCandidate(candidate.id, { lng: event.target.value === '' ? null : Number(event.target.value) })} /></div>
                  </details>
                  <p className="auth-hint">{sourceLabel(candidate.source)} · {(candidate.lat == null ? null : Number(candidate.lat).toFixed(5))}, {(candidate.lng == null ? null : Number(candidate.lng).toFixed(5))}</p>
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
          <h3>3. Criterios y evidencia</h3>
          <p className="auth-hint">Define criterios y aporta mediciones verificables. Las coordenadas no generan puntuaciones. Los pesos se normalizan a 100%; los criterios con peso cero se omiten. Los resultados se recalculan al editar.</p>
          <p className="auth-hint">Conserva la misma unidad o moneda para cada criterio. Los importes se guardan como decimales exactos; no se convierten monedas automáticamente.</p>
          {criteria.map((criterion, index) => <article className="card" key={criterion.id}>
            <div className="score-row"><h4>Criterio {index + 1}</h4><button type="button" className="secondary" onClick={() => setCriteria((current) => current.filter((item) => item.id !== criterion.id))}>Quitar criterio</button></div>
            {[['name', 'Nombre'], ['definition', 'Definicion'], ['unit', 'Unidad'], ['source', 'Fuente identificable']].map(([field, label]) => <div className="field-row" key={field}><label htmlFor={`${criterion.id}-${field}`}>{label}</label><input id={`${criterion.id}-${field}`} value={criterion[field]} onChange={(event) => updateCriterion(criterion.id, { [field]: event.target.value })} /></div>)}
            <div className="field-row"><label htmlFor={`${criterion.id}-weight`}>Peso relativo</label><input id={`${criterion.id}-weight`} type="number" min="0" step="any" value={criterion.weight} onChange={(event) => updateCriterion(criterion.id, { weight: event.target.value })} /></div>
            <div className="field-row"><label htmlFor={`${criterion.id}-direction`}>Orientacion</label><select id={`${criterion.id}-direction`} value={criterion.direction} onChange={(event) => updateCriterion(criterion.id, { direction: event.target.value })}><option value="benefit">Maximizar</option><option value="cost">Minimizar</option></select></div>
            <p className="auth-hint">Normalizacion: minimo-maximo entre candidatos elegibles. Valores iguales reciben 0,5. Contribucion = valor normalizado * peso normalizado * 100.</p>
            {['min', 'max'].map((field) => <div className="field-row" key={field}><label htmlFor={`${criterion.id}-${field}`}>{field === 'min' ? 'Minimo permitido' : 'Maximo permitido'} (opcional)</label><input id={`${criterion.id}-${field}`} type="number" step="any" value={criterion[field]} onChange={(event) => updateCriterion(criterion.id, { [field]: event.target.value })} /></div>)}
            <div className="field-row"><label htmlFor={`${criterion.id}-missing`}>Datos faltantes</label><select id={`${criterion.id}-missing`} value={criterion.missing} onChange={(event) => updateCriterion(criterion.id, { missing: event.target.value })}><option value="block">Bloquear calculo</option><option value="exclude">Excluir candidato</option><option value="worst">Penalizar con contribucion cero (sin imputar medicion)</option></select></div>
            {selectedCandidates.map((candidate) => <fieldset key={candidate.id} disabled={saveBusy}><legend>{candidate.name}</legend>
              <div className="field-row"><label htmlFor={`${candidate.id}-${criterion.id}-value`}>Valor ({criterion.unit || 'unidad pendiente'})</label><input id={`${candidate.id}-${criterion.id}-value`} type="number" step="any" value={observations[candidate.id]?.[criterion.id]?.value ?? ''} onChange={(event) => updateObservation(candidate.id, criterion.id, { value: event.target.value })} /></div>
              <div className="field-row"><label htmlFor={`${candidate.id}-${criterion.id}-source`}>Fuente especifica (opcional)</label><input id={`${candidate.id}-${criterion.id}-source`} placeholder={criterion.source} value={observations[candidate.id]?.[criterion.id]?.source || ''} onChange={(event) => updateObservation(candidate.id, criterion.id, { source: event.target.value })} /></div>
              <div className="field-row"><label htmlFor={`${candidate.id}-${criterion.id}-date`}>Fecha de la medicion (opcional)</label><input id={`${candidate.id}-${criterion.id}-date`} type="datetime-local" value={observations[candidate.id]?.[criterion.id]?.observed_at || ''} onChange={(event) => updateObservation(candidate.id, criterion.id, { observed_at: event.target.value })} /></div>
              <div className="field-row"><label htmlFor={`${candidate.id}-${criterion.id}-data-type`}>Origen del dato</label><select id={`${candidate.id}-${criterion.id}-data-type`} value={observations[candidate.id]?.[criterion.id]?.data_type || 'UNKNOWN'} onChange={event => updateObservation(candidate.id, criterion.id, { data_type: event.target.value })}><option value="UNKNOWN">Sin clasificar</option><option value="ORGANIZATION_PROVIDED">Aportado por la organización</option><option value="IMPORTED">Importado</option><option value="EXTERNAL_API">API externa</option><option value="HISTORICAL">Histórico</option><option value="DEMO">Demostración</option><option value="SIMULATED">Simulado</option></select></div>
            </fieldset>)}
          </article>)}
          <button type="button" disabled={criteria.length >= 30} onClick={() => setCriteria((current) => [...current, newCriterion()])}>Anadir criterio</button>
        </section>
        <section className="form-section" aria-live="polite">
          <h3>4. Resultados</h3>
          {saved && <details className="form-section"><summary>Trazabilidad del análisis</summary>
            <p>Versión del motor: {saved.result.version}. Entradas, unidades y fuentes conservadas en el análisis #{saved.comparison_id}.</p>
            {saved.analysis ? <><p>Huella de entradas: <code style={{ overflowWrap: 'anywhere' }}>{saved.analysis.input_sha256}</code></p><p>Huella de resultado: <code style={{ overflowWrap: 'anywhere' }}>{saved.analysis.result_sha256}</code></p></> : <p>Registro anterior sin huellas de origen. Se puede repetir el cálculo, sin certificar su integridad histórica.</p>}
            <p>La comprobación compara el cálculo y sus datos guardados. No certifica las fuentes ni estima certeza estadística.</p>
            <Button variant="secondary" loading={verifying} onClick={checkReproducibility}>Comprobar reproducibilidad</Button>
            {verification && <p role="status">{verification.verified ? verification.historical_integrity ? 'Reproducción confirmada: entradas y resultado coinciden con las huellas guardadas.' : 'Cálculo anterior reproducido. No conserva huellas de origen.' : verification.message || 'El análisis no pudo verificarse. Conserva el resultado original y revisa su versión y sus datos.'}</p>}
          </details>}
          <p className="auth-hint">{saved ? 'Resultado guardado con su versión original. Editar los datos prepara una nueva versión.' : `Actualizacion reactiva local - ${calculatedAt ? new Date(calculatedAt).toLocaleString() : 'Pendiente'}.`} Las mediciones son aportadas; no existe suscripcion automatica a fuentes externas.</p>
          {result.errors.map((error, index) => <p key={index} role="status">{error}</p>)}
          {result.excluded.map((row) => <p key={row.id}>{row.name}: excluido - {row.reasons.join(' ')}</p>)}
          {result.status === 'ready' && <>
            <p>Metodo determinista: suma ponderada - Version {result.version}. {result.winner_ids.length > 1 ? 'Empate en la primera posicion.' : `Mayor puntuacion: ${result.ranking[0].name}.`}</p>
            {result.ranking.map((row) => <article key={row.id} className="card"><h4>#{row.rank} {row.name} - {row.score.toFixed(2)} / 100</h4>
              <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Criterio</th><th>Valor</th><th>Normalizado</th><th>Peso</th><th>Contribucion</th><th>Fuente / fecha</th></tr></thead><tbody>{row.breakdown.map((d) => <tr key={d.criterion_id}><td>{d.name}</td><td>{d.missing ? 'Ausente: penalizado' : `${d.value} ${d.unit}`}</td><td>{d.normalized.toFixed(4)}</td><td>{(d.weight * 100).toFixed(2)}%</td><td>{d.contribution.toFixed(4)}</td><td>{d.source} - {d.observed_at || 'Fecha no indicada'}</td></tr>)}</tbody></table></div>
            </article>)}
            <div className="form-actions"><button type="button" onClick={runComparison} disabled={saveBusy || !canWrite}>{saveBusy ? 'Guardando...' : 'Guardar resultado en BACKSTAGE'}</button><button type="button" className="secondary" onClick={downloadComparison}>Descargar evidencia JSON</button></div>
            {saved && <Button disabled={projectBusy || !canWrite} onClick={createProject}>{projectBusy ? 'Guardando vínculo…' : operationalContext?.analysis_run_id ? 'Vincular al proyecto activo' : 'Crear proyecto desde este análisis'}</Button>}
            {saved && <p role="status">Resultado guardado #{saved.comparison_id || saved.id || saved.entity_id || saved.comparison_snapshot_id || 'registrado'}.</p>}
          </>}
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
                  <div className="field-row"><label htmlFor="comparison-existing-location">Ubicación existente en BACKSTAGE</label><div className="form-actions"><select id="comparison-existing-location" value={existingLocationId} onChange={(event) => setExistingLocationId(event.target.value)}>{locations.filter((location) => location.latitude != null && location.longitude != null).map((location) => <option key={location.asset_id || location.location_id} value={location.asset_id || location.location_id}>{location.name} · {location.city}</option>)}</select><button type="button" className="secondary" disabled={!existingLocationId} onClick={() => { const location = locations.find((entry) => String(entry.asset_id || entry.location_id) === existingLocationId); if (location) { addCandidate(existingLocationCandidate(location)); setCandidateDialogOpen(false); } }}>Añadir ubicación</button></div></div>
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

    </section>
  );
}

export default function AdvancedComparator(props) {
  const [mode, setMode] = useState(props.operationalContext?.comparison_mode || 'existing');
  useEffect(() => { if (props.operationalContext?.comparison_mode) setMode(props.operationalContext.comparison_mode); }, [props.operationalContext?.comparison_mode]);
  return <><div className="form-actions"><Button variant={mode === 'configurable' ? 'primary' : 'secondary'} aria-pressed={mode === 'configurable'} onClick={() => setMode('configurable')}>Criterios configurables</Button><Button variant={mode === 'existing' ? 'primary' : 'secondary'} aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}>Análisis territorial</Button></div>{mode === 'existing' ? <LegacyAdvancedComparator {...props} /> : <ConfigurableComparator {...props} />}<SpatialAnalysisPanel key={props.operationalContext?.analysis_run_id||'organization'} projectId={props.operationalContext?.analysis_run_id}/></>;
}
