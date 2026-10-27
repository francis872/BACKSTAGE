import { territoryType } from '../lib/territory';
import { sourceLabel } from '../lib/sourceLabel.mjs';
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';

async function read(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'La consulta territorial falló.');
  return data;
}

function coordinateOf(item) {
  if (Array.isArray(item.coordinates) && item.coordinates.length === 2 && item.coordinates.every((value) => Number.isFinite(Number(value)))) {
    return item.coordinates.map(Number);
  }
  if (item.geometry?.type === 'Point') return item.geometry.coordinates;
  if (item.bounds) return [(item.bounds[0] + item.bounds[2]) / 2, (item.bounds[1] + item.bounds[3]) / 2];
  return null;
}

function SpatialSearch({ center, onNavigate, onRoute, geocodingContext = {} }) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState([]);
  const [spatialObjects, setSpatialObjects] = useState([]);
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [message, setMessage] = useState('');
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchVersion, setSearchVersion] = useState(0);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [predictive, setPredictive] = useState(false);
  const searchAbortRef = useRef(null);
  const searchGenerationRef = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest('/soi/geo/capabilities', { signal: controller.signal }).then(read).then((value) => setPredictive(value.autocomplete === true)).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!predictive || query.trim().length < 3 || query.trim() === submittedQuery) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiRequest(`/soi/geo/autocomplete?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).then(read).then((value) => {
        if (!controller.signal.aborted) setPlaces(value.results || []);
      }).catch(() => {});
    }, 600);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, submittedQuery, predictive]);

  const search = async (event) => {
    event?.preventDefault();
    if (query.trim().length < 2) return setMessage('Escribe al menos dos caracteres para buscar.');
    setSubmittedQuery(query.trim());
    setSearchVersion((version) => version + 1);
  };

  useEffect(() => {
    const term = submittedQuery;
    if (term.length < 2) {
      setPlaces([]);
      setSpatialObjects([]);
      setSearching(false);
      setHasSearched(false);
      return undefined;
    }

    setHasSearched(false);
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const generation = ++searchGenerationRef.current;
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setMessage('');
      const geocodeParams = new URLSearchParams({ q: term, limit: '5' });
      const [placesResult, spatialResult] = await Promise.allSettled([
        apiRequest(`/soi/geo/geocode?${geocodeParams}`, { signal: controller.signal }).then(read),
        apiRequest(`/spatial/search?q=${encodeURIComponent(term)}&worldId=earth`, { signal: controller.signal }).then(read),
      ]);
      if (!active || generation !== searchGenerationRef.current) return;
      const placeRows = placesResult.status === 'fulfilled' && Array.isArray(placesResult.value.results) ? placesResult.value.results : [];
      const spatialRows = spatialResult.status === 'fulfilled' && Array.isArray(spatialResult.value) ? spatialResult.value : [];
      setPlaces(placeRows);
      setSpatialObjects(spatialRows);
      setHasSearched(true);
      if (placesResult.status === 'rejected' && spatialResult.status === 'rejected') {
        setMessage('No fue posible consultar los geocodificadores ni los datos BACKSTAGE.');
      } else if (placesResult.status === 'rejected') {
        setMessage('El geocodificador público no está disponible; se muestran solo los datos BACKSTAGE.');
      } else if (spatialResult.status === 'rejected') {
        setMessage('Los datos espaciales BACKSTAGE no están disponibles; se muestran solo lugares públicos.');
      } else if (!placeRows.length && !spatialRows.length) {
        setMessage('No encontramos lugares ni objetos BACKSTAGE para esta búsqueda.');
      }
      setSearching(false);
    }, 400);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
    };
  }, [submittedQuery, searchVersion]);

  const viewOnMap = async (item) => {
    let selectedPlace = item;
    if (item.objectType === 'geocoded_place' && /administrative|boundary/i.test(item.type || '') && item.geometry?.type === 'Point') {
      setMessage('Cargando el límite disponible del territorio…');
      const params = new URLSearchParams({ q: item.name || item.displayName, limit: '5', includeGeometry: 'true' });
      const countryBias = item.countryCode || geocodingContext.countryBias;
      const regionBias = item.region || geocodingContext.regionBias;
      if (countryBias) params.set('countryBias', countryBias);
      if (regionBias) params.set('regionBias', regionBias);
      try {
        const response = await apiRequest(`/spatial/geocode?${params}`);
        const data = await response.json();
        if (response.ok && Array.isArray(data)) {
          selectedPlace = data.find((candidate) => candidate.id === item.id)
            || data.find((candidate) => candidate.countryCode === item.countryCode && candidate.region === item.region)
            || item;
        }
      } catch {
        selectedPlace = item;
      }
    }
    onNavigate(coordinateOf(selectedPlace), selectedPlace);
    setMessage('Lugar elegido. Puedes verlo en el mapa y abrir su análisis en la ficha del lugar.');
  };

  const nearby = async () => {
    searchGenerationRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearching(false);
    setHasSearched(false);
    setMessage('Consultando objetos BACKSTAGE cercanos…');
    try {
      const data = await apiRequest(`/spatial/nearby?lng=${center[0]}&lat=${center[1]}&radiusM=5000&worldId=earth`).then(read);
      setPlaces([]);
      setSpatialObjects(data);
      setMessage(`${data.length} objetos BACKSTAGE encontrados en 5 km.`);
    } catch (error) {
      setSpatialObjects([]);
      setMessage(error.message);
    }
  };
  const route = async () => {
    if (!start || !end) return setMessage('Selecciona un origen y un destino.');
    try {
      const data = await apiRequest('/spatial/routes/compute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: coordinateOf(start), end: coordinateOf(end), algorithm: 'astar', worldId: 'earth' }),
      }).then(read);
      onRoute(data);
      const duration = Number.isFinite(data.durationSeconds) ? ` · ${Math.round(data.durationSeconds / 60)} min estimados por velocidad declarada` : ' · tiempo no disponible: la red no declara velocidades';
      setMessage(`${(data.distanceM / 1000).toFixed(2)} km${duration} · ${data.algorithm.toUpperCase()}`);
    } catch (error) { setMessage(error.message); }
  };
  const roadRoute = async () => {
    if (!start || !end) return;
    try {
      const data = await apiRequest('/soi/geo/routes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: [coordinateOf(start), coordinateOf(end)], profile: 'driving', alternatives: true }) }).then(read);
      onRoute(data.routes[0]);
      setMessage(`${(data.routes[0].distanceM / 1000).toFixed(2)} km · ${(data.routes[0].durationS / 3600).toFixed(1)} h estimadas · ${data.source.name} · sin tráfico en vivo`);
    } catch (error) { setMessage(error.message); }
  };

  return (
    <div className="card territorial-search">
      <form className="form-actions" onSubmit={search}>
        <label className="explorer-query-field" htmlFor="explorer-place-query">Busca un lugar para verlo en el mapa<input id="explorer-place-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Por ejemplo: Bello, Colombia" minLength={2} required /></label>
        <button type="submit" disabled={searching || query.trim().length < 2}>{searching ? 'Buscando…' : 'Buscar'}</button>
        <button type="button" className="secondary" onClick={nearby}>Cerca de aquí</button>
      </form>
      {(places.length > 0 || hasSearched) && (
        <div className="territorial-result-group">
          <h3>Lugares encontrados</h3>
          {places.length ? places.map((item) => (
            <div key={item.id} className="score-row territorial-search-result">
              <div><strong>{item.name || item.properties?.name}</strong><p className="auth-hint">{item.displayName || item.properties?.displayName}</p><details><summary>Fuente y opciones de ruta</summary><p className="auth-hint">{territoryType(item.type || item.objectType)} · {sourceLabel(item.source || item.provider || item.provenance?.source)} · {item.provenance?.license || 'ODbL-1.0'}</p><div className="form-actions"><button type="button" className="secondary" onClick={() => setStart(item)}>Usar como origen</button><button type="button" className="secondary" onClick={() => setEnd(item)}>Usar como destino</button></div></details></div>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => viewOnMap(item)}>Ver en mapa</button>
              </div>
            </div>
          )) : <p className="auth-hint">Sin coincidencias del geocodificador público.</p>}
        </div>
      )}
      {(spatialObjects.length > 0 || hasSearched) && (
        <details className="territorial-result-group">
          <summary>Datos guardados en tus proyectos ({spatialObjects.length})</summary>
          {spatialObjects.length ? spatialObjects.map((item) => (
            <div key={item.id} className="score-row territorial-search-result">
              <div><strong>{item.properties?.name || item.properties?.nombre || item.objectType}</strong><p className="auth-hint">{item.objectType}{item.distanceM != null ? ` · ${Math.round(item.distanceM)} m` : ''}</p></div>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => onNavigate(coordinateOf(item), item)}>Ver en mapa</button>
                <button type="button" className="secondary" onClick={() => setStart(item)}>Origen</button>
                <button type="button" className="secondary" onClick={() => setEnd(item)}>Destino</button>
              </div>
            </div>
          )) : <p className="auth-hint">Todavía no hay datos de tus proyectos para esta búsqueda. Puedes explorar los lugares encontrados en el mapa.</p>}
        </details>
      )}
      <details><summary>Planificar una ruta</summary><p className="auth-hint">Abre las opciones de un lugar para elegir el origen y el destino.</p><div className="form-actions" style={{ marginTop: 12 }}>
        <button type="button" onClick={roadRoute} disabled={!start || !end}>Calcular ruta vial global</button>
        <button type="button" className="secondary" onClick={route} disabled={!start || !end}>Calcular sobre red importada</button>
        <span className="auth-hint">{start ? 'Origen ✓' : 'Sin origen'} · {end ? 'Destino ✓' : 'Sin destino'}</span>
      </div></details>
      {message && <p className="message" role="status">{message}</p>}
    </div>
  );
}

export default SpatialSearch;
