import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

const EMPTY = { type: 'FeatureCollection', features: [] };

function geometryFor(mode, coordinates) {
  if (mode === 'point' && coordinates.length) return { type: 'Point', coordinates: coordinates[0] };
  if (mode === 'line' && coordinates.length > 1) return { type: 'LineString', coordinates };
  if (mode === 'polygon' && coordinates.length > 2) return { type: 'Polygon', coordinates: [[...coordinates, coordinates[0]]] };
  return null;
}

function displayCollection(mode, coordinates) {
  const geometry = geometryFor(mode, coordinates);
  const features = geometry ? [{ type: 'Feature', geometry, properties: {} }] : [];
  if (coordinates.length) features.push({
    type: 'FeatureCollection',
    features: coordinates.map((coordinate, index) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: coordinate }, properties: { index } })),
  });
  return { type: 'FeatureCollection', features: features.flatMap((item) => item.type === 'FeatureCollection' ? item.features : item) };
}

function MapDrawingTools({ map }) {
  const [mode, setMode] = useState('');
  const [coordinates, setCoordinates] = useState([]);
  const [measurement, setMeasurement] = useState(null);
  const [message, setMessage] = useState('');
  const geometry = useMemo(() => geometryFor(mode, coordinates), [mode, coordinates]);

  useEffect(() => {
    if (!map || !mode) return undefined;
    const click = (event) => setCoordinates((current) => mode === 'point' ? [[event.lngLat.lng, event.lngLat.lat]] : [...current, [event.lngLat.lng, event.lngLat.lat]]);
    map.on('click', click);
    map.getCanvas().style.cursor = 'crosshair';
    return () => { map.off('click', click); map.getCanvas().style.cursor = ''; };
  }, [map, mode]);

  useEffect(() => { map?.getSource('backstage-drawing')?.setData(displayCollection(mode, coordinates)); }, [map, mode, coordinates]);

  const chooseMode = (next) => { setMode(next); setCoordinates([]); setMeasurement(null); setMessage(''); };
  const clear = () => { setMode(''); setCoordinates([]); setMeasurement(null); setMessage(''); map?.getSource('backstage-drawing')?.setData(EMPTY); };
  const measure = async () => {
    if (!geometry) return;
    try {
      const response = await apiRequest('/spatial/measure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ geometry }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible medir la geometría.');
      setMeasurement(data); setMessage('');
    } catch (error) { setMessage(error.message); }
  };
  const download = () => {
    if (!geometry) return;
    const blob = new Blob([JSON.stringify({ type: 'Feature', geometry, properties: { measurement } }, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `backstage-${mode}.geojson`; anchor.click(); URL.revokeObjectURL(url);
  };

  return (
    <details className="card" style={{ marginBottom: 16 }}>
      <summary><strong>Dibujo, medición y exportación</strong></summary>
      <p className="auth-hint">Seleccione una geometría y marque vértices sobre el visor. Las distancias y áreas se calculan sobre la esfera terrestre.</p>
      <div className="form-actions">
        {[['point', 'Punto'], ['line', 'Línea'], ['polygon', 'Polígono']].map(([key, label]) => <button key={key} type="button" className={mode === key ? '' : 'secondary'} onClick={() => chooseMode(key)}>{label}</button>)}
        <button type="button" onClick={measure} disabled={!geometry}>Medir</button>
        <button type="button" className="secondary" onClick={download} disabled={!geometry}>Exportar GeoJSON</button>
        <button type="button" className="secondary" onClick={clear}>Limpiar</button>
      </div>
      {measurement?.distanceM != null && <p>Distancia: <strong>{(measurement.distanceM / 1000).toFixed(3)} km</strong> · {measurement.vertexCount} vértices</p>}
      {measurement?.areaM2 != null && <p>Área: <strong>{(measurement.areaM2 / 1e6).toFixed(3)} km²</strong> · perímetro {(measurement.perimeterM / 1000).toFixed(3)} km</p>}
      {measurement?.coordinate && <p>Coordenada: <strong>{measurement.coordinate.map((value) => Number(value).toFixed(6)).join(', ')}</strong></p>}
      {message && <p className="message">{message}</p>}
    </details>
  );
}

export default MapDrawingTools;
