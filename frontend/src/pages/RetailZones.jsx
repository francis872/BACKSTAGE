import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

const emptyForm = {
  name: '',
  city: '',
  region: '',
  country: 'Colombia',
  population_density: '',
  pedestrian_traffic_score: '',
  vehicle_traffic_score: '',
  purchasing_power_index: ''
};

function RetailZones() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  const loadZones = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/retail-zones');
      const data = await res.json();
      setZones(data);
    } catch (error) {
      setZones([]);
      setMessage('No se pudo cargar las zonas retail.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadZones();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setMessage('');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      population_density: form.population_density ? Number(form.population_density) : null,
      pedestrian_traffic_score: form.pedestrian_traffic_score ? Number(form.pedestrian_traffic_score) : null,
      vehicle_traffic_score: form.vehicle_traffic_score ? Number(form.vehicle_traffic_score) : null,
      purchasing_power_index: form.purchasing_power_index ? Number(form.purchasing_power_index) : null
    };

    try {
      const path = editingId ? `/retail-zones/${editingId}` : '/retail-zones';
      const method = editingId ? 'PUT' : 'POST';
      const res = await apiRequest(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error en el servidor');
      setMessage(editingId ? 'Zona actualizada correctamente.' : 'Zona creada correctamente.');
      resetForm();
      loadZones();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const handleEdit = (zone) => {
    setEditingId(zone.retail_zone_id);
    setForm({
      name: zone.name || '',
      city: zone.city || '',
      region: zone.region || '',
      country: zone.country || 'Colombia',
      population_density: zone.population_density ?? '',
      pedestrian_traffic_score: zone.pedestrian_traffic_score ?? '',
      vehicle_traffic_score: zone.vehicle_traffic_score ?? '',
      purchasing_power_index: zone.purchasing_power_index ?? ''
    });
    setMessage('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta zona retail?')) return;
    try {
      const res = await apiRequest(`/retail-zones/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error en el servidor');
      setMessage('Zona retail eliminada correctamente.');
      loadZones();
      resetForm();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <div>
      <h2>Zonas Retail</h2>
      <div className="form-section">
        <h3>{editingId ? 'Editar zona retail' : 'Crear nueva zona retail'}</h3>
        <form onSubmit={handleSubmit} className="entity-form">
          <div className="field-row">
            <label>Nombre</label>
            <input name="name" value={form.name} onChange={handleChange} required />
          </div>
          <div className="field-row">
            <label>Ciudad</label>
            <input name="city" value={form.city} onChange={handleChange} required />
          </div>
          <div className="field-row">
            <label>Región</label>
            <input name="region" value={form.region} onChange={handleChange} />
          </div>
          <div className="field-row">
            <label>País</label>
            <input name="country" value={form.country} onChange={handleChange} />
          </div>
          <div className="field-row">
            <label>Densidad poblacional</label>
            <input name="population_density" type="number" value={form.population_density} onChange={handleChange} />
          </div>
          <div className="field-row">
            <label>Puntaje peatones</label>
            <input name="pedestrian_traffic_score" type="number" value={form.pedestrian_traffic_score} onChange={handleChange} />
          </div>
          <div className="field-row">
            <label>Puntaje vehicular</label>
            <input name="vehicle_traffic_score" type="number" value={form.vehicle_traffic_score} onChange={handleChange} />
          </div>
          <div className="field-row">
            <label>Poder adquisitivo</label>
            <input name="purchasing_power_index" type="number" value={form.purchasing_power_index} onChange={handleChange} />
          </div>
          <div className="form-actions">
            <button type="submit">{editingId ? 'Actualizar' : 'Crear'}</button>
            {editingId && <button type="button" className="secondary" onClick={resetForm}>Cancelar</button>}
          </div>
        </form>
        {message && <p className="message">{message}</p>}
      </div>

      {loading ? (
        <p>Cargando zonas retail...</p>
      ) : zones.length === 0 ? (
        <p>No hay zonas retail disponibles.</p>
      ) : (
        <div className="card-grid">
          {zones.map((zone) => (
            <div key={zone.retail_zone_id} className="card">
              <h3>{zone.name}</h3>
              <p>{zone.city}, {zone.region}</p>
              <p>Puntaje de peatones: {zone.pedestrian_traffic_score}</p>
              <p>Puntaje de compra: {zone.purchasing_power_index}</p>
              <div className="card-actions">
                <button onClick={() => handleEdit(zone)}>Editar</button>
                <button className="secondary" onClick={() => handleDelete(zone.retail_zone_id)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RetailZones;
