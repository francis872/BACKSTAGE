import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

const dimensionLabels = {
  education: 'Educación',
  health: 'Salud',
  infrastructure: 'Infraestructura',
  economy: 'Economía',
  environment: 'Ambiente',
  security: 'Seguridad',
  connectivity: 'Conectividad',
  housing: 'Vivienda',
  services: 'Servicios'
};

const severityLabels = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja'
};

const baseAlternative = { name: 'Alternativa A', capacity: '', cost_per_seat: '', coverage_radius_km: '2' };

function EarthArt() {
  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [indexSnapshot, setIndexSnapshot] = useState(null);
  const [gaps, setGaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [scenarioType, setScenarioType] = useState('new_school');
  const [alternatives, setAlternatives] = useState([
    baseAlternative,
    { name: 'Alternativa B', capacity: '', cost_per_seat: '', coverage_radius_km: '2' }
  ]);
  const [simulation, setSimulation] = useState(null);

  const loadUnits = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/territorial/units'));
      const data = await res.json();
      setUnits(data);
      if (data.length > 0 && !selectedUnitId) {
        setSelectedUnitId(String(data[0].unit_id));
      }
    } catch {
      setUnits([]);
      setMessage('No se pudieron cargar las unidades territoriales.');
    } finally {
      setLoading(false);
    }
  };

  const loadUnitDetail = async (unitId) => {
    if (!unitId) return;
    try {
      const [indexRes, gapsRes] = await Promise.all([
        fetch(apiUrl(`/territorial/units/${unitId}/index`)),
        fetch(apiUrl(`/territorial/units/${unitId}/gaps`))
      ]);
      setIndexSnapshot(indexRes.ok ? await indexRes.json() : null);
      setGaps(gapsRes.ok ? await gapsRes.json() : []);
    } catch {
      setIndexSnapshot(null);
      setGaps([]);
    }
  };

  useEffect(() => {
    loadUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSimulation(null);
    loadUnitDetail(selectedUnitId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitId]);

  const handleDetectGaps = async () => {
    try {
      const res = await fetch(apiUrl(`/territorial/units/${selectedUnitId}/gaps/detect`), { method: 'POST' });
      const detected = await res.json();
      if (!res.ok) throw new Error(detected.error || 'Error en el servidor');
      setMessage(detected.length > 0 ? `Se detectaron ${detected.length} brecha(s) nueva(s).` : 'No se detectaron brechas nuevas.');
      loadUnitDetail(selectedUnitId);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const handleAlternativeChange = (index, field, value) => {
    setAlternatives((prev) => prev.map((alt, i) => (i === index ? { ...alt, [field]: value } : alt)));
  };

  const handleSimulate = async (event) => {
    event.preventDefault();
    const payload = {
      scenario_type: scenarioType,
      alternatives: alternatives.map((alt) => ({
        name: alt.name,
        capacity: Number(alt.capacity) || 0,
        cost_per_seat: Number(alt.cost_per_seat) || 0,
        coverage_radius_km: Number(alt.coverage_radius_km) || 2
      }))
    };

    try {
      const res = await fetch(apiUrl(`/territorial/units/${selectedUnitId}/simulate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error en el servidor');
      setSimulation(result);
      setMessage('');
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const selectedUnit = units.find((unit) => unit.unit_id === Number(selectedUnitId));

  return (
    <div>
      <h2>EarthArt — Inteligencia Territorial</h2>
      <p>Territorio completo: catastro, población, infraestructura, ambiente, economía y movilidad en un solo perfil por unidad territorial.</p>

      {loading ? (
        <p>Cargando unidades territoriales...</p>
      ) : units.length === 0 ? (
        <p>No hay unidades territoriales registradas.</p>
      ) : (
        <>
          <div className="form-section">
            <h3>Seleccionar unidad territorial</h3>
            <div className="field-row">
              <label>Municipio / Barrio / Vereda</label>
              <select value={selectedUnitId} onChange={(event) => setSelectedUnitId(event.target.value)}>
                {units.map((unit) => (
                  <option key={unit.unit_id} value={unit.unit_id}>
                    {unit.name} ({unit.unit_type}) — {unit.city}
                  </option>
                ))}
              </select>
            </div>
            {selectedUnit && (
              <p>
                Población: {Number(selectedUnit.population || 0).toLocaleString('es-CO')} · Crecimiento: {selectedUnit.population_growth_pct}% ·
                {' '}Área: {selectedUnit.area_km2} km²
              </p>
            )}
          </div>

          <div className="form-section">
            <h3>Índice Territorial</h3>
            {indexSnapshot ? (
              <>
                <p className="score">Índice Territorial: {indexSnapshot.composite_score ?? 'sin datos'}/100</p>
                <div className="metric-grid">
                  {Object.entries(indexSnapshot.breakdown || {}).map(([dimension, value]) => (
                    <div className="metric-card" key={dimension}>
                      <span>{dimensionLabels[dimension] || dimension}</span>
                      <strong>{value ?? 's/d'}{value != null ? '/100' : ''}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p>Sin índice calculado todavía.</p>
            )}
          </div>

          <div className="form-section">
            <div className="score-row">
              <h3>Detector de brechas</h3>
              <button type="button" onClick={handleDetectGaps}>Detectar brechas</button>
            </div>
            {gaps.length === 0 ? (
              <p>No hay brechas detectadas para esta unidad territorial.</p>
            ) : (
              <div className="card-grid">
                {gaps.map((gap) => (
                  <div className="card" key={gap.gap_id}>
                    <h3>{severityLabels[gap.severity] || gap.severity}</h3>
                    <p>{gap.message}</p>
                  </div>
                ))}
              </div>
            )}
            {message && <p className="message">{message}</p>}
          </div>

          <div className="form-section">
            <h3>Motor predictivo: ¿qué pasaría si...?</h3>
            <form onSubmit={handleSimulate} className="entity-form">
              <div className="field-row">
                <label>Tipo de escenario</label>
                <select value={scenarioType} onChange={(event) => setScenarioType(event.target.value)}>
                  <option value="new_school">Nuevo colegio</option>
                  <option value="new_hospital">Nuevo centro de salud</option>
                  <option value="new_transport_line">Nueva línea de transporte</option>
                </select>
              </div>
              {alternatives.map((alt, index) => (
                <fieldset className="entity-form" key={alt.name} style={{ border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1rem' }}>
                  <legend>{alt.name}</legend>
                  <div className="field-row">
                    <label>Capacidad (cupos)</label>
                    <input
                      type="number"
                      value={alt.capacity}
                      onChange={(event) => handleAlternativeChange(index, 'capacity', event.target.value)}
                      required
                    />
                  </div>
                  <div className="field-row">
                    <label>Costo por cupo</label>
                    <input
                      type="number"
                      value={alt.cost_per_seat}
                      onChange={(event) => handleAlternativeChange(index, 'cost_per_seat', event.target.value)}
                      required
                    />
                  </div>
                  <div className="field-row">
                    <label>Radio de cobertura (km)</label>
                    <input
                      type="number"
                      value={alt.coverage_radius_km}
                      onChange={(event) => handleAlternativeChange(index, 'coverage_radius_km', event.target.value)}
                      required
                    />
                  </div>
                </fieldset>
              ))}
              <div className="form-actions">
                <button type="submit">Simular</button>
              </div>
            </form>

            {simulation && (
              <div className="form-section">
                <p><strong>{simulation.recommendation}</strong></p>
                <div className="card-grid">
                  {simulation.result.alternatives.map((alt, index) => (
                    <div className="card" key={alt.name || index}>
                      <h3>{alt.name || `Opción ${index + 1}`}</h3>
                      <p>Población beneficiada: {alt.population_benefited.toLocaleString('es-CO')}</p>
                      <p>Cobertura: {alt.coverage_ratio_pct}%</p>
                      <p>Costo estimado: {alt.estimated_cost.toLocaleString('es-CO')}</p>
                      <p>Costo por persona beneficiada: {alt.cost_per_person_benefited ?? 's/d'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default EarthArt;
