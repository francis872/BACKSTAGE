import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

const initialForm = {
  risk_id: '',
  component_type: '',
  component_score: '',
  notes: ''
};

function RiskComponents() {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  const loadComponents = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/risk-components');
      const data = await res.json();
      setComponents(data);
    } catch (error) {
      setComponents([]);
      setMessage('No se pudieron cargar los componentes de riesgo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComponents();
  }, []);

  const resetForm = () => {
    setForm(initialForm);
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
      risk_id: form.risk_id ? Number(form.risk_id) : null,
      component_type: form.component_type,
      component_score: form.component_score ? Number(form.component_score) : null,
      notes: form.notes
    };
    try {
      const path = editingId ? `/risk-components/${editingId}` : '/risk-components';
      const method = editingId ? 'PUT' : 'POST';
      const res = await apiRequest(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error en el servidor');
      setMessage(editingId ? 'Componente actualizado correctamente.' : 'Componente creado correctamente.');
      resetForm();
      loadComponents();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const handleEdit = (component) => {
    setEditingId(component.component_id);
    setForm({
      risk_id: component.risk_id ?? '',
      component_type: component.component_type || '',
      component_score: component.component_score ?? '',
      notes: component.notes || ''
    });
    setMessage('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este componente de riesgo?')) return;
    try {
      const res = await apiRequest(`/risk-components/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error en el servidor');
      setMessage('Componente de riesgo eliminado correctamente.');
      loadComponents();
      resetForm();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <div>
      <h2>Componentes de Riesgo</h2>
      <div className="form-section">
        <h3>{editingId ? 'Editar componente de riesgo' : 'Crear componente de riesgo'}</h3>
        <form onSubmit={handleSubmit} className="entity-form">
          <div className="field-row">
            <label>ID de riesgo</label>
            <input name="risk_id" type="number" value={form.risk_id} onChange={handleChange} required />
          </div>
          <div className="field-row">
            <label>Tipo de componente</label>
            <input name="component_type" value={form.component_type} onChange={handleChange} required />
          </div>
          <div className="field-row">
            <label>Puntaje</label>
            <input name="component_score" type="number" value={form.component_score} onChange={handleChange} required />
          </div>
          <div className="field-row">
            <label>Notas</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} rows="3" />
          </div>
          <div className="form-actions">
            <button type="submit">{editingId ? 'Actualizar' : 'Crear'}</button>
            {editingId && <button type="button" className="secondary" onClick={resetForm}>Cancelar</button>}
          </div>
        </form>
        {message && <p className="message">{message}</p>}
      </div>

      {loading ? (
        <p>Cargando componentes de riesgo...</p>
      ) : components.length === 0 ? (
        <p>No hay componentes de riesgo disponibles.</p>
      ) : (
        <div className="card-grid">
          {components.map((component) => (
            <div key={component.component_id} className="card">
              <h3>{component.component_type}</h3>
              <p>ID riesgo: {component.risk_id}</p>
              <p>Puntaje: {component.component_score}</p>
              <p>Notas: {component.notes}</p>
              <div className="card-actions">
                <button onClick={() => handleEdit(component)}>Editar</button>
                <button className="secondary" onClick={() => handleDelete(component.component_id)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RiskComponents;
