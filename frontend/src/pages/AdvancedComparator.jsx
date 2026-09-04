import { useEffect, useState } from 'react';
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

function AdvancedComparator() {
  const [locations, setLocations] = useState([]);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [city, setCity] = useState('Bogotá');
  const [projectName, setProjectName] = useState('Comparador de ubicaciones');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiRequest('/locations')
      .then((res) => res.json())
      .then((data) => setLocations(Array.isArray(data) ? data : []))
      .catch(() => setLocations([]));
  }, []);

  const toggleCandidate = (locationId) => {
    setSelectedCandidates((prev) => {
      const exists = prev.includes(locationId);
      if (exists) return prev.filter((item) => item !== locationId);
      return [...prev, locationId].slice(0, 6);
    });
  };

  const runComparison = async (event) => {
    event.preventDefault();
    setResult(null);
    setMessage('');
    if (selectedCandidates.length < 2) {
      setMessage('Selecciona al menos 2 ubicaciones para comparar.');
      return;
    }

    try {
      const payload = {
        project_name: projectName,
        city,
        candidates: selectedCandidates.map((locationId) => {
          const location = locations.find((entry) => entry.location_id === locationId);
          return {
            location_id: locationId,
            name: location?.name || `Ubicación ${locationId}`,
            city: location?.city || city,
          };
        }),
      };

      const res = await apiRequest('/analysis/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo ejecutar la comparación.');
      setResult(data);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <section>
      <h2>Comparador avanzado de ubicaciones</h2>
      <p>Compara alternativas con desglose multicriterio y diferencias por dimensión.</p>
      <form className="entity-form form-section" onSubmit={runComparison}>
        <div className="field-row">
          <label>Nombre del análisis</label>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} required />
        </div>
        <div className="field-row">
          <label>Ciudad</label>
          <input value={city} onChange={(event) => setCity(event.target.value)} required />
        </div>
        <div className="field-row">
          <label>Candidatos (2-6)</label>
          <div className="candidate-list">
            {locations.map((location) => (
              <label key={location.location_id} className="candidate-item">
                <input
                  type="checkbox"
                  checked={selectedCandidates.includes(location.location_id)}
                  onChange={() => toggleCandidate(location.location_id)}
                />
                <span>{location.name} — {location.city}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="form-actions">
          <button type="submit">Ejecutar comparación</button>
        </div>
      </form>
      {message && <p className="message">{message}</p>}

      {result && (
        <div className="stacked-sections">
          <article className="form-section">
            <h3>Ranking</h3>
            <p><strong>Recomendación:</strong> {result.recommendation}</p>
            <div className="card-grid">
              {(result.ranking || []).map((row) => (
                <article className="card" key={`${row.rank_position}-${row.candidate_name}`}>
                  <div className="score-row">
                    <h3>#{row.rank_position} {row.candidate_name}</h3>
                    <span className="score">{row.score_total}</span>
                  </div>
                  <DimensionBreakdown scores={row.score_by_dimension} />
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
        </div>
      )}
    </section>
  );
}

export default AdvancedComparator;

