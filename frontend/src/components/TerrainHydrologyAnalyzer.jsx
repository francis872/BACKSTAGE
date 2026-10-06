import { useState } from 'react';
import { apiRequest } from '../lib/api';

async function read(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'El análisis del terreno falló.');
  return data;
}

function ProfileChart({ profile }) {
  if (!profile?.points?.length) return null;
  const width = 640; const height = 150; const padding = 18;
  const range = Math.max(1, profile.maxElevationM - profile.minElevationM);
  const points = profile.points.map((point, index) => {
    const x = padding + index / (profile.points.length - 1) * (width - padding * 2);
    const y = height - padding - (point.elevationM - profile.minElevationM) / range * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Perfil topográfico" style={{ width: '100%', maxHeight: 180 }}><polyline points={points} fill="none" stroke="#39f5ae" strokeWidth="3" /><line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,.25)" /></svg>;
}

function TerrainHydrologyAnalyzer({ terrain, onHydrology }) {
  const [streamThreshold, setStreamThreshold] = useState(10);
  const [hydrology, setHydrology] = useState(null);
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState('');

  const analyze = async () => {
    if (!terrain) return;
    try {
      const result = await apiRequest('/terrain/hydrology', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grid: terrain.elevation, bbox: terrain.bbox, cellSizeM: terrain.statistics.cellSizeM,
          streamThreshold: Number(streamThreshold),
        }),
      }).then(read);
      setHydrology(result); onHydrology?.(result); setMessage('');
    } catch (error) { setMessage(error.message); }
  };
  const createProfile = async () => {
    if (!terrain) return;
    try {
      const [minLng, minLat, maxLng, maxLat] = terrain.bbox;
      const result = await apiRequest('/terrain/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grid: terrain.elevation, bbox: terrain.bbox, start: [minLng, minLat], end: [maxLng, maxLat], samples: 100 }),
      }).then(read);
      setProfile(result); setMessage('');
    } catch (error) { setMessage(error.message); }
  };

  return (
    <details className="card" style={{ marginBottom: 16 }}>
      <summary><strong>Topografía, drenaje y cuencas</strong></summary>
      <p className="auth-hint">Superficie: {terrain?.dataMode || 'no cargada'}. Los resultados heredan la calidad del modelo de elevación visible.</p>
      <div className="form-actions">
        <label>Umbral de cauce (celdas)<input type="number" min="2" step="1" value={streamThreshold} onChange={(event) => setStreamThreshold(event.target.value)} /></label>
        <button type="button" onClick={analyze} disabled={!terrain}>Analizar drenaje</button>
        <button type="button" className="secondary" onClick={createProfile} disabled={!terrain}>Perfil diagonal visible</button>
      </div>
      {hydrology && <p>Canales: <strong>{hydrology.statistics.streamCellCount}</strong> · valles: <strong>{hydrology.statistics.valleyCellCount}</strong> · crestas: <strong>{hydrology.statistics.ridgeCellCount}</strong> · cuenca: <strong>{hydrology.statistics.watershedCellCount}</strong> celdas</p>}
      {profile && <div><p>Perfil {(profile.totalDistanceM / 1000).toFixed(2)} km · {profile.minElevationM.toFixed(1)}–{profile.maxElevationM.toFixed(1)} m</p><ProfileChart profile={profile} /></div>}
      {message && <p className="message">{message}</p>}
    </details>
  );
}

export default TerrainHydrologyAnalyzer;
