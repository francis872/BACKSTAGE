import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

const currency = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
});

const initialForm = {
  location_id: '',
  flood_risk: '',
  landslide_risk: '',
  crime_risk: '',
  climate_exposure: '',
  score: '',
};

function RiskSimulationPanel({ row, onClose }) {
  const [impactCost, setImpactCost] = useState('');
  const [iterations, setIterations] = useState('5000');
  const [seed, setSeed] = useState('42');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const components = {
    flood_risk: Number(row.flood_risk) || 0,
    landslide_risk: Number(row.landslide_risk) || 0,
    crime_risk: Number(row.crime_risk) || 0,
    climate_exposure: Number(row.climate_exposure) || 0,
  };

  const runSimulation = async (event) => {
    event.preventDefault();
    setError('');
    setResult(null);
    const cost = Number(impactCost);
    if (!cost || cost <= 0) {
      setError('Indica un costo de impacto estimado mayor a 0.');
      return;
    }
    setLoading(true);
    try {
      // Each documented risk indicator (0-1) is treated as an independent
      // factor with a standard deviation of 15% of its value (assumption,
      // shown to the user), and the simulated outcome is the average of
      // the four sampled indicators times the user-provided impact cost.
      const factors = Object.fromEntries(
        Object.entries(components).map(([key, mean]) => [key, { mean, stdDev: Math.max(mean * 0.15, 0.01) }])
      );
      const res = await apiRequest('/analytics/risk-simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          algorithm: 'monte_carlo',
          factors,
          factorWeights: { flood_risk: 0.25, landslide_risk: 0.25, crime_risk: 0.25, climate_exposure: 0.25 },
          iterations: Number(iterations),
          seed: Number(seed),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo ejecutar la simulación.');
      // The engine returns a fraction-in-[0,1]-like combined indicator;
      // scale by impact cost client-side for the currency display.
      const scaled = {
        ...data.result,
        p5: data.result.p5 * cost,
        p50: data.result.p50 * cost,
        p95: data.result.p95 * cost,
        mean: data.result.mean * cost,
      };
      setResult({ ...data, result: scaled });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="financial-panel">
      <div className="score-row">
        <h4>Simulación Monte Carlo de pérdida esperada</h4>
        <button type="button" className="secondary" onClick={onClose}>Cerrar</button>
      </div>
      <p className="auth-hint">
        Indicadores base: inundación {components.flood_risk}, deslizamiento {components.landslide_risk},
        crimen {components.crime_risk}, clima {components.climate_exposure} (cada uno simulado con
        desviación estándar del 15% de su valor, semilla reproducible).
      </p>
      <form className="entity-form" onSubmit={runSimulation}>
        <div className="field-row">
          <label>Costo de impacto estimado (COP)</label>
          <input type="number" value={impactCost} onChange={(e) => setImpactCost(e.target.value)} required />
        </div>
        <div className="field-row">
          <label>Iteraciones</label>
          <input type="number" min="100" max="200000" value={iterations} onChange={(e) => setIterations(e.target.value)} />
        </div>
        <div className="field-row">
          <label>Semilla (reproducibilidad)</label>
          <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="submit" disabled={loading}>{loading ? 'Simulando...' : 'Simular'}</button>
        </div>
      </form>
      {error && <p className="message">{error}</p>}
      {result && (
        <div className="metric-grid">
          <article className="metric-card"><span>P5 (optimista)</span><strong>{currency.format(result.result.p5)}</strong></article>
          <article className="metric-card"><span>P50 (mediana)</span><strong>{currency.format(result.result.p50)}</strong></article>
          <article className="metric-card"><span>P95 (adverso)</span><strong>{currency.format(result.result.p95)}</strong></article>
          <article className="metric-card"><span>Pérdida esperada (media)</span><strong>{currency.format(result.result.mean)}</strong></article>
          <article className="metric-card"><span>Ejecución registrada</span><strong>#{result.analytics_job_id}</strong></article>
        </div>
      )}
    </div>
  );
}

function RiskAssessments() {
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [simulatingId, setSimulatingId] = useState(null);

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
                <button
                  type="button"
                  onClick={() => setSimulatingId(simulatingId === row.risk_id ? null : row.risk_id)}
                >
                  {simulatingId === row.risk_id ? 'Ocultar simulación' : 'Simular riesgo'}
                </button>
              </div>
              {simulatingId === row.risk_id && (
                <RiskSimulationPanel row={row} onClose={() => setSimulatingId(null)} />
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default RiskAssessments;
