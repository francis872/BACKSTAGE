import { useState } from 'react';
import { apiRequest } from '../lib/api';

async function read(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'La consulta territorial falló.');
  return data;
}

function coordinateOf(item) {
  if (item.geometry?.type === 'Point') return item.geometry.coordinates;
  if (item.bounds) return [(item.bounds[0] + item.bounds[2]) / 2, (item.bounds[1] + item.bounds[3]) / 2];
  return null;
}

function SpatialSearch({ center, onNavigate, onRoute }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [algorithm, setAlgorithm] = useState('astar');
  const [message, setMessage] = useState('');

  const search = async (event) => {
    event?.preventDefault();
    try { setResults(await apiRequest(`/spatial/search?q=${encodeURIComponent(query)}&worldId=earth`).then(read)); setMessage(''); }
    catch (error) { setMessage(error.message); }
  };
  const nearby = async () => {
    try {
      const data = await apiRequest(`/spatial/nearby?lng=${center[0]}&lat=${center[1]}&radiusM=5000&worldId=earth`).then(read);
      setResults(data); setMessage(`${data.length} objetos encontrados en 5 km.`);
    } catch (error) { setMessage(error.message); }
  };
  const route = async () => {
    if (!start || !end) return setMessage('Selecciona un origen y un destino.');
    try {
      const data = await apiRequest('/spatial/routes/compute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: coordinateOf(start), end: coordinateOf(end), algorithm, worldId: 'earth' }),
      }).then(read);
      onRoute(data);
      setMessage(`${(data.distanceM / 1000).toFixed(2)} km · ${(data.durationSeconds / 60).toFixed(1)} min · ${data.algorithm.toUpperCase()}`);
    } catch (error) { setMessage(error.message); }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <form className="form-actions" onSubmit={search}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar vía, zona, edificio o lugar" minLength={2} required />
        <button type="submit">Buscar</button>
        <button type="button" className="secondary" onClick={nearby}>Cerca de aquí</button>
      </form>
      {results.length > 0 && (
        <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 12 }}>
          {results.map((item) => (
            <div key={item.id} className="score-row">
              <div><strong>{item.properties?.name || item.properties?.nombre || item.objectType}</strong><p className="auth-hint">{item.objectType}{item.distanceM != null ? ` · ${Math.round(item.distanceM)} m` : ''}</p></div>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => onNavigate(coordinateOf(item))}>Ir</button>
                <button type="button" className="secondary" onClick={() => setStart(item)}>Origen</button>
                <button type="button" className="secondary" onClick={() => setEnd(item)}>Destino</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="form-actions" style={{ marginTop: 12 }}>
        <select value={algorithm} onChange={(event) => setAlgorithm(event.target.value)}><option value="astar">A*</option><option value="dijkstra">Dijkstra</option></select>
        <button type="button" onClick={route} disabled={!start || !end}>Calcular ruta</button>
        <span className="auth-hint">{start ? 'Origen ✓' : 'Sin origen'} · {end ? 'Destino ✓' : 'Sin destino'}</span>
      </div>
      {message && <p className="message">{message}</p>}
    </div>
  );
}

export default SpatialSearch;
