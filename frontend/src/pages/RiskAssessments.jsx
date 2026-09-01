import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

const initialForm = {
  location_id: '',
  flood_risk: '',
  landslide_risk: '',
  crime_risk: '',
  climate_exposure: '',
  score: '',
};

function RiskAssessments() {
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [assessmentsRes, locationsRes] = await Promise.all([
        apiRequest('/risk-assessments'),
        apiRequest('/locations'),
      ]);
      const [assessmentsData, locationsData] = await Promise.all([assessmentsRes.json(), locationsRes.json()]);
      setRows(assessmentsData);
      setLocations(locationsData);
      setMessage('');
    } catch {
      setRows([]);
      setMessage('No se pudieron cargar las evaluaciones de riesgo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const reset = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      location_id: Number(form.location_id),
      flood_risk: form.flood_risk ? Number(form.flood_risk) : null,
      landslide_risk: form.landslide_risk ? Number(form.landslide_risk) : null,
      crime_risk: form.crime_risk ? Number(form.crime_risk) : null,
      climate_exposure: form.climate_exposure ? Number(form.climate_exposure) : null,
      score: form.score ? Number(form.score) : null,
    };
    try {
      const path = editingId ? `/risk-assessments/${editingId}` : '/risk-assessments';
      const method = editingId ? 'PUT' : 'POST';
      const res = await apiRequest(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en el servidor');
      setMessage(editingId ? 'Evaluación actualizada correctamente.' : 'Evaluación creada correctamente.');
      reset();
      loadData();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const startEdit = (row) => {
    setEditingId(row.risk_id);
    setForm({
      location_id: row.location_id ?? '',
      flood_risk: row.flood_risk ?? '',
      landslide_risk: row.landslide_risk ?? '',
      crime_risk: row.crime_risk ?? '',
      climate_exposure: row.climate_exposure ?? '',
      score: row.score ?? '',
    });
  };

  const remove = async (id) => {
    if (!window.confirm('¿Eliminar esta evaluación de riesgo?')) return;
    try {
      const res = await apiRequest(`/risk-assessments/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en el servidor');
      setMessage('Evaluación eliminada correctamente.');
      loadData();
      reset();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <section>
      <h2>Evaluaciones de Riesgo</h2>
      <div className="form-section">
        <h3>{editingId ? 'Editar evaluación' : 'Crear evaluación'}</h3>
        <form onSubmit={submit} className="entity-form">
          <div className="field-row">
            <label>Ubicación</label>
            <select name="location_id" value={form.location_id} onChange={handleChange} required>
              <option value="">Seleccionar</option>
              {locations.map((location) => (
                <option key={location.location_id} value={location.location_id}>{location.name} — {location.city}</option>
              ))}
            </select>
          </div>
          <div className="field-row"><label>Riesgo inundación</label><input name="flood_risk" type="number" value={form.flood_risk} onChange={handleChange} /></div>
          <div className="field-row"><label>Riesgo deslizamiento</label><input name="landslide_risk" type="number" value={form.landslide_risk} onChange={handleChange} /></div>
          <div className="field-row"><label>Riesgo crimen</label><input name="crime_risk" type="number" value={form.crime_risk} onChange={handleChange} /></div>
          <div className="field-row"><label>Exposición climática</label><input name="climate_exposure" type="number" value={form.climate_exposure} onChange={handleChange} /></div>
          <div className="field-row"><label>Puntaje total</label><input name="score" type="number" value={form.score} onChange={handleChange} /></div>
          <div className="form-actions">
            <button type="submit">{editingId ? 'Actualizar' : 'Crear'}</button>
            {editingId && <button type="button" className="secondary" onClick={reset}>Cancelar</button>}
          </div>
        </form>
        {message && <p className="message">{message}</p>}
      </div>

      {loading ? <p>Cargando evaluaciones...</p> : (
        <div className="card-grid">
          {rows.map((row) => (
            <article className="card" key={row.risk_id}>
              <h3>{row.location_name || `Location #${row.location_id}`}</h3>
              <p>Score: {row.score ?? 's/d'} · Ciudad: {row.city || 's/d'}</p>
              <p>Inundación {row.flood_risk ?? 's/d'} · Deslizamiento {row.landslide_risk ?? 's/d'}</p>
              <p>Crimen {row.crime_risk ?? 's/d'} · Clima {row.climate_exposure ?? 's/d'}</p>
              <div className="card-actions">
                <button onClick={() => startEdit(row)}>Editar</button>
                <button className="secondary" onClick={() => remove(row.risk_id)}>Eliminar</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default RiskAssessments;
