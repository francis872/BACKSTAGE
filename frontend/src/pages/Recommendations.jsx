import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

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

  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/recommendations'));
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
      const res = await fetch(apiUrl('/locations'));
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
      const url = editingId ? apiUrl(`/recommendations/${editingId}`) : apiUrl('/recommendations');
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
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
      const res = await fetch(apiUrl(`/recommendations/${id}`), { method: 'DELETE' });
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

  return (
    <div>
      <h2>Recomendaciones</h2>
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
