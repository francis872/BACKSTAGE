import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

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

function EarthArt({ operationalContext, onNavigate }) {
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
  const [simulationHistory, setSimulationHistory] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [risks, setRisks] = useState([]);
  const [creatingGapId, setCreatingGapId] = useState(null);

  const loadUnits = async () => {
    setLoading(true);
    try {
      const [res, opportunitiesRes, risksRes] = await Promise.all([apiRequest('/territorial/units'), apiRequest('/insights/opportunities'), apiRequest('/risk-assessments')]);
      const [data, opportunitiesData, risksData] = await Promise.all([res.json(), opportunitiesRes.json(), risksRes.json()]);
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar las unidades.');
      setUnits(data);
      setOpportunities(opportunitiesRes.ok && Array.isArray(opportunitiesData) ? opportunitiesData : []);
      setRisks(risksRes.ok && Array.isArray(risksData) ? risksData : []);
      if (data.length > 0) {
        const activeTerritory = operationalContext?.territory;
        const match = data.find((unit) =>
          (activeTerritory?.name && unit.name?.toLocaleLowerCase() === activeTerritory.name.toLocaleLowerCase())
          || (activeTerritory?.city && unit.city?.toLocaleLowerCase() === activeTerritory.city.toLocaleLowerCase())
          || (operationalContext?.city && unit.city?.toLocaleLowerCase() === operationalContext.city.toLocaleLowerCase())
        );
        setSelectedUnitId((current) => current || String(match?.unit_id || data[0].unit_id));
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
      const [indexRes, gapsRes, simulationsRes] = await Promise.all([
        apiRequest(`/territorial/units/${unitId}/index`),
        apiRequest(`/territorial/units/${unitId}/gaps`),
        apiRequest(`/territorial/units/${unitId}/simulations`)
      ]);
      setIndexSnapshot(indexRes.ok ? await indexRes.json() : null);
      setGaps(gapsRes.ok ? await gapsRes.json() : []);
      setSimulationHistory(simulationsRes.ok ? await simulationsRes.json() : []);
    } catch {
      setIndexSnapshot(null);
      setGaps([]);
      setSimulationHistory([]);
    }
  };

  useEffect(() => {
    loadUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationalContext?.territory?.name, operationalContext?.territory?.city, operationalContext?.city]);

  useEffect(() => {
    setSimulation(null);
    loadUnitDetail(selectedUnitId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnitId]);

  const handleDetectGaps = async () => {
    try {
      const res = await apiRequest(`/territorial/units/${selectedUnitId}/gaps/detect`, { method: 'POST' });
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
      const res = await apiRequest(`/territorial/units/${selectedUnitId}/simulate`, {
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
  const unitOpportunities = opportunities.filter((item) => item.city && item.city === selectedUnit?.city);
  const unitRisks = risks.filter((item) => item.city && item.city === selectedUnit?.city);
  const openSelectedUnitOnMap = () => {
    if (selectedUnit?.latitude == null || selectedUnit?.longitude == null) return;
    const territory = operationalContext?.territory || {
      id: selectedUnit.unit_id,
      name: selectedUnit.name,
      city: selectedUnit.city,
      region: selectedUnit.region,
      country: selectedUnit.country,
      type: selectedUnit.unit_type,
      coordinates: [Number(selectedUnit.longitude), Number(selectedUnit.latitude)],
      geometry: selectedUnit.geometry || null,
      source: selectedUnit.source_name || 'BACKSTAGE territorial units',
    };
    onNavigate?.('territorial-explorer', {
      ...operationalContext,
      territory,
      selectedLocation: territory,
      city: territory.city || selectedUnit.city,
      longitude: Number(selectedUnit.longitude),
      latitude: Number(selectedUnit.latitude),
    });
  };
  const createGapProject = async (gap) => {
    setCreatingGapId(gap.gap_id);
    try {
      const response = await apiRequest(`/territorial/units/${selectedUnitId}/gaps/${gap.gap_id}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo crear el proyecto.');
      onNavigate?.('mission-control', { analysis_run_id: data.analysis_run_id, project_name: data.project_name, city: selectedUnit?.city });
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setCreatingGapId(null); }
  };

  return (
    <div>
      <h2>AirHeart — Inteligencia Territorial</h2>
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
            <div className="score-row"><div><p className="eyebrow">Lectura integrada, métricas separadas</p><h3>Territorio · riesgo · oportunidad</h3></div>{selectedUnit?.latitude != null && selectedUnit?.longitude != null && <button type="button" onClick={openSelectedUnitOnMap}>Ver en mapa</button>}</div>
            <div className="metric-grid">
              <article className="metric-card"><span>Índice territorial</span><strong>{indexSnapshot?.composite_score == null ? 'Sin datos' : `${indexSnapshot.composite_score}/100`}</strong></article>
              <article className="metric-card"><span>Brechas abiertas</span><strong>{gaps.filter((gap) => !gap.resolved).length}</strong></article>
              <article className="metric-card"><span>Evaluaciones de riesgo en {selectedUnit?.city || 'la zona'}</span><strong>{unitRisks.length}</strong></article>
              <article className="metric-card"><span>Oportunidades documentadas</span><strong>{unitOpportunities.length}</strong></article>
            </div>
            <p className="auth-hint">El índice, los riesgos y las oportunidades conservan sus propias metodologías. La relación por ciudad sirve para navegación y contexto; no constituye causalidad ni un puntaje combinado.</p>
            <div className="form-actions"><button type="button" onClick={() => onNavigate?.('intelligence-evaluations', operationalContext)}>Abrir evaluaciones</button><button type="button" onClick={() => onNavigate?.('intelligence-opportunities', operationalContext)}>Abrir oportunidades</button></div>
          </div>

          <div className="form-section">
            <h3>Señales del territorio</h3>
            {unitRisks.length === 0 && unitOpportunities.length === 0 ? <p>Sin señales registradas para esta unidad.</p> : (
              <div className="card-grid">
                {unitRisks.slice(0, 4).map((risk, index) => (
                  <article className="card" key={`risk-${risk.risk_assessment_id || index}`}>
                    <p className="eyebrow">Riesgo</p>
                    <h4>{risk.name || risk.risk_type || risk.assessment_type || 'Evaluación territorial'}</h4>
                    {risk.severity && <p>{risk.severity}</p>}
                    <button type="button" className="secondary" onClick={openSelectedUnitOnMap}>Ver en mapa</button>
                  </article>
                ))}
                {unitOpportunities.slice(0, 4).map((opportunity, index) => (
                  <article className="card" key={`opportunity-${opportunity.opportunity_id || index}`}>
                    <p className="eyebrow">Oportunidad</p>
                    <h4>{opportunity.name || opportunity.title || opportunity.opportunity_type || 'Oportunidad documentada'}</h4>
                    <button type="button" className="secondary" onClick={() => onNavigate?.('intelligence-opportunities', { ...operationalContext, territory: operationalContext?.territory || { name: selectedUnit?.name, city: selectedUnit?.city }, city: selectedUnit?.city })}>Explorar oportunidades</button>
                  </article>
                ))}
              </div>
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
                    <button type="button" onClick={() => createGapProject(gap)} disabled={creatingGapId === gap.gap_id}>{creatingGapId === gap.gap_id ? 'Creando…' : 'Convertir brecha en proyecto'}</button>
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
            {simulationHistory.length > 0 && <div className="form-section"><h4>Historial de escenarios</h4><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Fecha</th><th>Escenario</th><th>Recomendación</th></tr></thead><tbody>{simulationHistory.map((item) => <tr key={item.simulation_id}><td>{new Date(item.created_at).toLocaleString('es-CO')}</td><td>{item.scenario_type}</td><td>{item.recommendation || 'Sin recomendación'}</td></tr>)}</tbody></table></div></div>}
          </div>
        </>
      )}
    </div>
  );
}

export default EarthArt;
