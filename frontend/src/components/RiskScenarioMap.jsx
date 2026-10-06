import { useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

const DEFINITIONS = {
  wildfire: ['dryness', 'temperature', 'wind', 'vegetationFuel', 'slope', 'humidity'],
  flood: ['rainfall', 'drainageDeficit', 'riverProximity', 'impermeability', 'soilSaturation', 'relativeElevation'],
  landslide: ['slope', 'rainfall', 'soilSaturation', 'geologySusceptibility', 'vegetationLoss', 'seismicity'],
};
const DERIVED = { wildfire: 'slope', flood: 'relativeElevation', landslide: 'slope' };
const LABELS = { wildfire: 'Incendio forestal', flood: 'Inundación', landslide: 'Deslizamiento', dryness: 'Sequedad', temperature: 'Temperatura', wind: 'Viento', vegetationFuel: 'Combustible vegetal', slope: 'Pendiente', humidity: 'Humedad', rainfall: 'Precipitación', drainageDeficit: 'Déficit de drenaje', riverProximity: 'Proximidad a río', impermeability: 'Impermeabilización', soilSaturation: 'Saturación del suelo', relativeElevation: 'Elevación relativa', geologySusceptibility: 'Susceptibilidad geológica', vegetationLoss: 'Pérdida vegetal', seismicity: 'Sismicidad' };

function terrainCells(terrain, hazard, values) {
  const rows = terrain.elevation.length; const columns = terrain.elevation[0].length;
  const [minLng, minLat, maxLng, maxLat] = terrain.bbox;
  const min = terrain.statistics.minElevation; const range = Math.max(1, terrain.statistics.maxElevation - min);
  const stride = Math.max(1, Math.ceil(Math.sqrt(((rows - 1) * (columns - 1)) / 400)));
  const cells = [];
  for (let row = 0; row < rows - 1; row += stride) {
    for (let col = 0; col < columns - 1; col += stride) {
      const nextRow = Math.min(rows - 1, row + stride); const nextCol = Math.min(columns - 1, col + stride);
      const x0 = minLng + col * (maxLng - minLng) / (columns - 1); const x1 = minLng + nextCol * (maxLng - minLng) / (columns - 1);
      const y0 = minLat + row * (maxLat - minLat) / (rows - 1); const y1 = minLat + nextRow * (maxLat - minLat) / (rows - 1);
      const inputs = Object.fromEntries(DEFINITIONS[hazard].map((field) => [field, Number(values[field])]));
      if (DERIVED[hazard] === 'slope') inputs.slope = Math.min(1, terrain.slope[row][col] / 45);
      if (DERIVED[hazard] === 'relativeElevation') inputs.relativeElevation = (terrain.elevation[row][col] - min) / range;
      cells.push({ id: `${row}-${col}`, geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] }, inputs });
    }
  }
  return cells;
}

function RiskScenarioMap({ terrain, onResult }) {
  const [hazard, setHazard] = useState('wildfire'); const [values, setValues] = useState({}); const [changes, setChanges] = useState({});
  const [result, setResult] = useState(null); const [message, setMessage] = useState('');
  const enteredFields = useMemo(() => DEFINITIONS[hazard].filter((field) => field !== DERIVED[hazard]), [hazard]);
  const run = async (event) => {
    event.preventDefault();
    try {
      if (!terrain) throw new Error('Espere a que se cargue el terreno visible.');
      const cells = terrainCells(terrain, hazard, values);
      const scenarioChanges = Object.fromEntries(DEFINITIONS[hazard].filter((field) => changes[field] !== '' && changes[field] != null).map((field) => [field, Number(changes[field])]));
      const response = await apiRequest('/spatial/risk/scenario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hazard, cells, changes: scenarioChanges, dataMode: terrain.dataMode === 'measured' ? 'derived' : 'procedural' }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No fue posible comparar el escenario.');
      setResult(data); onResult?.(data); setMessage('');
    } catch (error) { setMessage(error.message); }
  };
  return (
    <details className="card" style={{ marginBottom: 16 }}>
      <summary><strong>Mapa de riesgo base–escenario</strong></summary>
      <p className="auth-hint">La malla usa pendiente o elevación derivada del terreno. Las demás variables son declaradas por usted; el resultado es comparativo, no un pronóstico.</p>
      <form onSubmit={run} className="form-grid">
        <label>Amenaza<select value={hazard} onChange={(event) => { setHazard(event.target.value); setValues({}); setChanges({}); setResult(null); }}>
          {Object.keys(DEFINITIONS).map((key) => <option key={key} value={key}>{LABELS[key]}</option>)}
        </select></label>
        {enteredFields.map((field) => <label key={field}>{LABELS[field]} base (0–1)<input type="number" min="0" max="1" step="0.01" required value={values[field] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} /></label>)}
        {DEFINITIONS[hazard].map((field) => <label key={`change-${field}`}>Cambio en {LABELS[field]} (-1 a 1)<input type="number" min="-1" max="1" step="0.01" value={changes[field] ?? ''} placeholder="0" onChange={(event) => setChanges((current) => ({ ...current, [field]: event.target.value }))} /></label>)}
        <div className="form-actions"><button type="submit" disabled={!terrain}>Comparar y mapear</button></div>
      </form>
      {result && <p>Base: <strong>{(result.metadata.baseMean * 100).toFixed(1)}%</strong> · escenario: <strong>{(result.metadata.scenarioMean * 100).toFixed(1)}%</strong> · cambio: <strong>{result.metadata.deltaMean >= 0 ? '+' : ''}{(result.metadata.deltaMean * 100).toFixed(1)} pp</strong> · {result.features.length} celdas</p>}
      {result && <p className="auth-hint">{result.metadata.advisory}</p>}
      {message && <p className="message">{message}</p>}
    </details>
  );
}

export default RiskScenarioMap;
