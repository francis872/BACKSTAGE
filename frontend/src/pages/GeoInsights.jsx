import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

const defaultSearch = {
  lat: '4.7110',
  lng: '-74.0721',
  radius: '2500'
};

function GeoInsights() {
  const [summary, setSummary] = useState(null);
  const [query, setQuery] = useState(defaultSearch);
  const [nearby, setNearby] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadSummary = async () => {
    try {
      const res = await fetch(apiUrl('/insights/summary'));
      const data = await res.json();
      setSummary(data);
    } catch {
      setSummary(null);
    }
  };

  const loadNearby = async (search) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${apiUrl('/locations/nearby')}?lat=${encodeURIComponent(search.lat)}&lng=${encodeURIComponent(
          search.lng
        )}&radius=${encodeURIComponent(search.radius)}`
      );
      const data = await res.json();
      setNearby(data);
      setMessage('');
    } catch (error) {
      setNearby([]);
      setMessage('No se pudieron cargar las ubicaciones cercanas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
    loadNearby(defaultSearch);
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setQuery((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearch = (event) => {
    event.preventDefault();
    loadNearby(query);
  };

  return (
    <div>
      <h2>Geo Insights</h2>
      <div className="form-section">
        <h3>Explorar ubicaciones cercanas</h3>
        <form onSubmit={handleSearch} className="entity-form">
          <div className="field-row">
            <label>Latitud</label>
            <input name="lat" value={query.lat} onChange={handleChange} required />
          </div>
          <div className="field-row">
            <label>Longitud</label>
            <input name="lng" value={query.lng} onChange={handleChange} required />
          </div>
          <div className="field-row">
            <label>Radio (metros)</label>
            <input name="radius" type="number" value={query.radius} onChange={handleChange} required />
          </div>
          <div className="form-actions">
            <button type="submit">Buscar</button>
          </div>
        </form>
      </div>

      {summary && (
        <div className="card-grid">
          <div className="card">
            <h3>Ubicaciones</h3>
            <p>{summary.locations}</p>
          </div>
          <div className="card">
            <h3>Riesgos evaluados</h3>
            <p>{summary.risk_assessments}</p>
          </div>
          <div className="card">
            <h3>Zonas retail</h3>
            <p>{summary.retail_zones}</p>
          </div>
          <div className="card">
            <h3>Recomendaciones</h3>
            <p>{summary.recommendations}</p>
          </div>
        </div>
      )}

      <div className="form-section">
        <h3>Resultados cercanos</h3>
        {loading ? (
          <p>Cargando ubicaciones...</p>
        ) : nearby.length === 0 ? (
          <p>No se encontraron ubicaciones dentro del radio seleccionado.</p>
        ) : (
          <div className="card-grid">
            {nearby.map((location) => (
              <div key={location.location_id} className="card">
                <h3>{location.name}</h3>
                <p>{location.city}, {location.region}</p>
                <p>Tipo: {location.type}</p>
                <p>Distancia: {Math.round(location.distance_m)} m</p>
                <p>Riesgo: {location.risk_score ?? 'sin evaluación'}</p>
              </div>
            ))}
          </div>
        )}
        {message && <p className="message">{message}</p>}
      </div>
    </div>
  );
}

export default GeoInsights;
