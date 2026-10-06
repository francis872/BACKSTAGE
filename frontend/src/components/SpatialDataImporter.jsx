import { useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

function currentRole() {
  try {
    return JSON.parse(window.localStorage.getItem('backstage_user') || '{}').role;
  } catch {
    return null;
  }
}

async function responseData(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'La operación geoespacial falló.');
  return data;
}

function SpatialDataImporter({ dataZoom, onDataZoomChange, onImported }) {
  const canWrite = useMemo(() => ['admin', 'analyst'].includes(currentRole()), []);
  const [form, setForm] = useState({ provider: '', dataset: '', version: '', license: '', confidence: '0.8', dataMode: 'declared' });
  const [collection, setCollection] = useState(null);
  const [inputMode, setInputMode] = useState('file');
  const [sourceUrl, setSourceUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (event) => setForm((value) => ({ ...value, [event.target.name]: event.target.value }));

  const selectFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) throw new Error('El archivo debe contener un GeoJSON FeatureCollection.');
      setCollection(parsed);
      setFileName(file.name);
      setStatus(`${parsed.features.length} objetos preparados para validación.`);
    } catch (error) {
      setCollection(null);
      setStatus(error.message);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (inputMode === 'file' && !collection) return setStatus('Selecciona primero un archivo GeoJSON válido.');
    if (inputMode === 'remote' && !sourceUrl) return setStatus('Ingresa la URL HTTPS de una fuente autorizada.');
    setBusy(true);
    setStatus('Registrando procedencia…');
    try {
      const source = await apiRequest('/spatial/sources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form, confidence: Number(form.confidence),
        }),
      }).then(responseData);
      setStatus('Validando geometrías y generando teselas…');
      const endpoint = inputMode === 'remote' ? '/spatial/ingest/remote' : '/spatial/ingest/geojson';
      const job = await apiRequest(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: source._id, worldId: 'earth', minZoom: Math.max(0, dataZoom - 2), maxZoom: dataZoom,
          ...(inputMode === 'remote' ? { sourceUrl } : { collection }),
        }),
      }).then(responseData);
      setStatus(`Carga completada: ${job.featureCount} objetos en ${job.tileCount} teselas.`);
      onImported?.(job);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="card" style={{ marginBottom: 16 }}>
      <summary><strong>{canWrite ? 'Importar dataset territorial' : 'Configuración de teselas'}</strong></summary>
      <div className="form-actions" style={{ marginTop: 12 }}>
        <label>Nivel XYZ
          <select value={dataZoom} onChange={(event) => onDataZoomChange(Number(event.target.value))}>
            {[6, 7, 8, 9, 10, 11, 12, 13, 14].map((zoom) => <option key={zoom} value={zoom}>{zoom}</option>)}
          </select>
        </label>
      </div>
      <p className="auth-hint">Las nuevas cargas se indexarán en los niveles {Math.max(0, dataZoom - 2)}–{dataZoom}.</p>
      {canWrite && (
        <form onSubmit={submit} className="form-grid" style={{ marginTop: 12 }}>
          <label>Proveedor<input name="provider" value={form.provider} onChange={update} required /></label>
          <label>Dataset<input name="dataset" value={form.dataset} onChange={update} required /></label>
          <label>Versión<input name="version" value={form.version} onChange={update} required /></label>
          <label>Licencia<input name="license" value={form.license} onChange={update} required placeholder="Ej. ODC-BY-1.0" /></label>
          <label>Confianza (0–1)<input name="confidence" type="number" min="0" max="1" step="0.01" value={form.confidence} onChange={update} required /></label>
          <label>Modo del dato
            <select name="dataMode" value={form.dataMode} onChange={update}>
              <option value="declared">Declarado por la fuente</option>
              <option value="measured">Medido</option>
              <option value="derived">Derivado</option>
              <option value="procedural">Procedimental</option>
            </select>
          </label>
          <label>Origen
            <select value={inputMode} onChange={(event) => setInputMode(event.target.value)}>
              <option value="file">Archivo local</option>
              <option value="remote">Fuente oficial remota</option>
            </select>
          </label>
          {inputMode === 'file' ? (
            <label>Archivo GeoJSON<input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={selectFile} required /></label>
          ) : (
            <label>URL GeoJSON autorizada<input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required placeholder="https://www.datos.gov.co/..." /></label>
          )}
          <div className="form-actions">
            <button type="submit" disabled={busy || (inputMode === 'file' ? !collection : !sourceUrl)}>{busy ? 'Procesando…' : 'Registrar e importar'}</button>
          </div>
        </form>
      )}
      {fileName && <p className="auth-hint">Archivo: {fileName}</p>}
      {inputMode === 'remote' && <p className="auth-hint">Dominios permitidos: datos.gov.co y mapas2.igac.gov.co. Sin redirecciones ni credenciales embebidas.</p>}
      {status && <p className="message">{status}</p>}
    </details>
  );
}

export default SpatialDataImporter;
