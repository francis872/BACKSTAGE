import { useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

const HAZARDS = {
  wildfire: ['dryness', 'temperature', 'wind', 'vegetationFuel', 'slope', 'humidity'],
  flood: ['rainfall', 'drainageDeficit', 'riverProximity', 'impermeability', 'soilSaturation', 'relativeElevation'],
  landslide: ['slope', 'rainfall', 'soilSaturation', 'geologySusceptibility', 'vegetationLoss', 'seismicity'],
};
const LABELS = {
  wildfire: 'Incendio forestal', flood: 'Inundación', landslide: 'Deslizamiento', dryness: 'Sequedad',
  temperature: 'Temperatura', wind: 'Viento', vegetationFuel: 'Combustible vegetal', slope: 'Pendiente', humidity: 'Humedad',
  rainfall: 'Precipitación', drainageDeficit: 'Déficit de drenaje', riverProximity: 'Proximidad a río',
  impermeability: 'Impermeabilización', soilSaturation: 'Saturación del suelo', relativeElevation: 'Elevación relativa',
  geologySusceptibility: 'Susceptibilidad geológica', vegetationLoss: 'Pérdida vegetal', seismicity: 'Sismicidad',
};

function TerritorialRiskAnalyzer({ center }) {
  const [hazard, setHazard] = useState('wildfire');
  const [values, setValues] = useState({});
  const [confidence, setConfidence] = useState('');
  const [dataMode, setDataMode] = useState('declared');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  const fields = useMemo(() => HAZARDS[hazard], [hazard]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      const hazardValues = Object.fromEntries(fields.map((field) => [field, Number(values[field])]));
      const response = await apiRequest('/spatial/risk/evaluate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [hazard]: hazardValues, dataMode,
          ...(confidence === '' ? {} : { confidence: Number(confidence) }),
          context: { center: { lng: center[0], lat: center[1] } },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible evaluar el riesgo.');
      setResult(data); setMessage('');
    } catch (error) { setMessage(error.message); }
  };
  const hazardResult = result?.hazards?.[hazard];

  return (
    <details className="card" style={{ marginBottom: 16 }}>
      <summary><strong>Evaluación territorial explicable</strong></summary>
      <form onSubmit={submit} className="form-grid" style={{ marginTop: 12 }}>
        <label>Amenaza<select value={hazard} onChange={(event) => { setHazard(event.target.value); setValues({}); setResult(null); }}>
          {Object.keys(HAZARDS).map((key) => <option key={key} value={key}>{LABELS[key]}</option>)}
        </select></label>
        <label>Origen del dato<select value={dataMode} onChange={(event) => setDataMode(event.target.value)}>
          <option value="declared">Declarado</option><option value="measured">Medido</option><option value="derived">Derivado</option><option value="procedural">Procedimental</option>
        </select></label>
        {fields.map((field) => (
          <label key={field}>{LABELS[field]} (0–1)<input type="number" min="0" max="1" step="0.01" value={values[field] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} required /></label>
        ))}
        <label>Confianza opcional (0–1)<input type="number" min="0" max="1" step="0.01" value={confidence} onChange={(event) => setConfidence(event.target.value)} /></label>
        <div className="form-actions"><button type="submit">Evaluar</button></div>
      </form>
      {hazardResult && (
        <div style={{ marginTop: 12 }}>
          <h3>{LABELS[hazard]}: {(hazardResult.score * 100).toFixed(1)}%</h3>
          <p>Clasificación: <strong>{hazardResult.classification}</strong> · confianza {result.confidence == null ? 'no declarada' : `${(result.confidence * 100).toFixed(0)}%`}</p>
          <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Variable</th><th>Entrada</th><th>Peso</th><th>Contribución</th></tr></thead><tbody>
            {Object.entries(hazardResult.contributions).map(([name, item]) => <tr key={name}><td>{LABELS[name]}</td><td>{item.input.toFixed(2)}</td><td>{item.weight.toFixed(2)}</td><td>{item.contribution.toFixed(3)}</td></tr>)}
          </tbody></table></div>
          <p className="auth-hint">{result.advisory}</p>
        </div>
      )}
      {message && <p className="message">{message}</p>}
    </details>
  );
}

export default TerritorialRiskAnalyzer;
