import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

const baseForm = {
  location_id: '',
  query_type: '',
  parameters: '{}',
  result: '{}',
  score: ''
};

function Recommendations() {
  const [recommendations, setRecommendations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(baseForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [analysisForm, setAnalysisForm] = useState({
    project_name: 'Expansión McDonald’s Bogotá',
    city: 'Bogotá',
    objective: 'Identificar la mejor ubicación para expansión considerando demanda, accesibilidad, competencia y riesgo.',
    selectedCandidates: [],
  });

  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/recommendations');
      const data = await res.json();
      setRecommendations(data);
    } catch (error) {
      setRecommendations([]);
      setMessage('No se pudieron cargar las recomendaciones.');
    } finally {
      setLoading(false);
    }
  };

  const loadLocations = async () => {
    try {
      const res = await apiRequest('/locations');
      const data = await res.json();
      setLocations(data);
    } catch (error) {
      setLocations([]);
    }
  };

  useEffect(() => {
    loadRecommendations();
    loadLocations();
  }, []);

  const resetForm = () => {
    setForm(baseForm);
    setEditingId(null);
    setMessage('');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const parseJson = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const parametersJson = parseJson(form.parameters);
    const resultJson = parseJson(form.result);

    if (parametersJson === null || resultJson === null) {
      setMessage('Parámetros y resultado deben ser JSON válido.');
      return;
    }

    const payload = {
      location_id: Number(form.location_id),
      query_type: form.query_type,
      parameters: parametersJson,
      result: resultJson,
      score: form.score ? Number(form.score) : null
    };

    try {
      const path = editingId ? `/recommendations/${editingId}` : '/recommendations';
      const method = editingId ? 'PUT' : 'POST';
      const res = await apiRequest(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error en el servidor');
      setMessage(editingId ? 'Recomendación actualizada correctamente.' : 'Recomendación creada correctamente.');
      resetForm();
      loadRecommendations();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const handleEdit = (recommendation) => {
    setEditingId(recommendation.recommendation_id);
    setForm({
      location_id: recommendation.location_id ?? '',
      query_type: recommendation.query_type || '',
      parameters: JSON.stringify(recommendation.parameters || {}, null, 2),
      result: JSON.stringify(recommendation.result || {}, null, 2),
      score: recommendation.score ?? ''
    });
    setMessage('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta recomendación?')) return;
    try {
      const res = await apiRequest(`/recommendations/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error en el servidor');
      setMessage('Recomendación eliminada correctamente.');
      loadRecommendations();
      resetForm();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const getLocationName = (locationId) => {
    const location = locations.find((loc) => loc.location_id === Number(locationId));
    return location ? `${location.name} — ${location.city}` : null;
  };

  const toggleCandidate = (locationId) => {
    setAnalysisForm((prev) => {
      const exists = prev.selectedCandidates.includes(locationId);
      if (exists) {
        return {
          ...prev,
          selectedCandidates: prev.selectedCandidates.filter((id) => id !== locationId),
        };
      }
      return {
        ...prev,
        selectedCandidates: [...prev.selectedCandidates, locationId].slice(0, 4),
      };
    });
  };

  const runMcDonaldsAnalysis = async (event) => {
    event.preventDefault();
    setAnalysisMessage('');
    setAnalysisResult(null);
    if (analysisForm.selectedCandidates.length === 0) {
      setAnalysisMessage('Selecciona al menos una ubicación candidata.');
      return;
    }
    try {
      const payload = {
        project_name: analysisForm.project_name,
        city: analysisForm.city,
        objective: analysisForm.objective,
        own_brand_name: 'McDonald%',
        candidates: analysisForm.selectedCandidates.map((locationId) => {
          const location = locations.find((item) => item.location_id === locationId);
          return {
            location_id: locationId,
            name: location ? location.name : `Ubicación ${locationId}`,
            city: location?.city || analysisForm.city,
          };
        }),
      };
      const res = await apiRequest('/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo ejecutar el análisis.');
      setAnalysisResult(data);
    } catch (error) {
      setAnalysisMessage(`Error: ${error.message}`);
    }
  };

  return (
    <div>
      <h2>Recomendaciones</h2>
      <div className="form-section">
        <h3>Caso demo: Expansión McDonald’s Bogotá</h3>
        <form onSubmit={runMcDonaldsAnalysis} className="entity-form">
          <div className="field-row">
            <label>Proyecto</label>
            <input
              value={analysisForm.project_name}
              onChange={(event) => setAnalysisForm((prev) => ({ ...prev, project_name: event.target.value }))}
              required
            />
          </div>
          <div className="field-row">
            <label>Ciudad</label>
            <input
              value={analysisForm.city}
              onChange={(event) => setAnalysisForm((prev) => ({ ...prev, city: event.target.value }))}
              required
            />
          </div>
          <div className="field-row">
            <label>Objetivo</label>
            <textarea
              rows="3"
              value={analysisForm.objective}
              onChange={(event) => setAnalysisForm((prev) => ({ ...prev, objective: event.target.value }))}
              required
            />
          </div>
          <div className="field-row">
            <label>Ubicaciones candidatas (máximo 4)</label>
            <div className="candidate-list">
              {locations.map((location) => (
                <label key={location.location_id} className="candidate-item">
                  <input
                    type="checkbox"
                    checked={analysisForm.selectedCandidates.includes(location.location_id)}
                    onChange={() => toggleCandidate(location.location_id)}
                  />
                  <span>{location.name} — {location.city}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-actions">
            <button type="submit">Ejecutar análisis geoestratégico</button>
          </div>
        </form>
        {analysisMessage && <p className="message">{analysisMessage}</p>}
        {analysisResult && (
          <article className="form-section">
            <p><strong>Recomendación:</strong> {analysisResult.recommendation}</p>
            <p>ID de ejecución: {analysisResult.analysis_run_id}</p>
            <div className="card-grid">
              {analysisResult.ranking.map((row) => (
                <div className="card" key={`${row.rank_position}-${row.candidate_name}`}>
                  <h3>#{row.rank_position} {row.candidate_name}</h3>
                  <p>Puntaje total: {row.score_total}</p>
                  <pre>{JSON.stringify(row.score_by_dimension, null, 2)}</pre>
                </div>
              ))}
            </div>
          </article>
        )}
      </div>

      <div className="form-section">
        <h3>{editingId ? 'Editar recomendación' : 'Crear recomendación'}</h3>
        <form onSubmit={handleSubmit} className="entity-form">
          <div className="field-row">
            <label>Ubicación</label>
            <select name="location_id" value={form.location_id} onChange={handleChange} required>
              <option value="">Selecciona una ubicación</option>
              {locations.map((location) => (
                <option key={location.location_id} value={location.location_id}>
                  {location.name} — {location.city}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <label>Tipo de consulta</label>
            <input name="query_type" value={form.query_type} onChange={handleChange} required />
          </div>
          <div className="field-row">
            <label>Parámetros (JSON)</label>
            <textarea name="parameters" value={form.parameters} onChange={handleChange} rows="4" required />
          </div>
          <div className="field-row">
            <label>Resultado (JSON)</label>
            <textarea name="result" value={form.result} onChange={handleChange} rows="4" required />
          </div>
          <div className="field-row">
            <label>Puntaje</label>
            <input name="score" type="number" value={form.score} onChange={handleChange} />
          </div>
          <div className="form-actions">
            <button type="submit">{editingId ? 'Actualizar' : 'Crear'}</button>
            {editingId && <button type="button" className="secondary" onClick={resetForm}>Cancelar</button>}
          </div>
        </form>
        {message && <p className="message">{message}</p>}
      </div>

      {loading ? (
        <p>Cargando recomendaciones...</p>
      ) : recommendations.length === 0 ? (
        <p>No hay recomendaciones disponibles.</p>
      ) : (
        <div className="card-grid">
          {recommendations.map((recommendation) => (
            <div key={recommendation.recommendation_id} className="card">
              <h3>{recommendation.query_type}</h3>
              <p>
                Ubicación:{' '}
                {getLocationName(recommendation.location_id) ? (
                  getLocationName(recommendation.location_id)
                ) : (
                  <span className="missing-location">Ubicación desconocida</span>
                )}
              </p>
              <p>Puntaje: {recommendation.score}</p>
              <pre>{JSON.stringify(recommendation.result, null, 2)}</pre>
              <div className="card-actions">
                <button onClick={() => handleEdit(recommendation)}>Editar</button>
                <button className="secondary" onClick={() => handleDelete(recommendation.recommendation_id)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Recommendations;
