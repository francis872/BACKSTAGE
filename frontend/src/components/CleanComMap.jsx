import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl(workerUrl);
const empty = { type: 'FeatureCollection', features: [] };

/** Uses Backstage's existing renderer and basemap; source geometries only. */
export default function CleanComMap({ collection, bounds, onSelect, analytical = false }) {
  const host = useRef(null);
  const instance = useRef(null);
  const displayedBounds = useRef('');
  const latest = useRef({ collection, bounds, onSelect, analytical });
  const [error, setError] = useState('');
  const [geometryReady, setGeometryReady] = useState(false);
  latest.current = { collection, bounds, onSelect, analytical };
  const update = () => {
    const map = instance.current;
    if (!map?.getSource('clean-com')) return;
    setGeometryReady(false);
    map.getSource('clean-com').setData(latest.current.collection || empty);
    if (latest.current.analytical) {
      const rows=latest.current.collection?.features||[];
      const maximum=Math.max(0,...rows.map(f=>f.properties?.density_per_km2||0));
      const color=maximum>0?['interpolate',['linear'],['coalesce',['get','density_per_km2'],0],0,'#d6e8f5',maximum/2,'#f5b64b',maximum,'#b21e35']:['match',['get','category'],'HH','#d44343','HOTSPOT','#d44343','LL','#3978c9','COLDSPOT','#3978c9','HL','#efb652','LH','#9c77d5','#8895a7'];
      map.setPaintProperty('clean-com-areas','fill-color',color);
      map.setPaintProperty('clean-com-areas','fill-opacity',.65);
      map.setPaintProperty('clean-com-points','circle-color',color);
    }
    const box = latest.current.bounds;
    if (box?.length === 4 && box.every(Number.isFinite) && JSON.stringify(box) !== displayedBounds.current) {
      displayedBounds.current = JSON.stringify(box);
      map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: 35, maxZoom: 15, duration: 0 });
    }
  };
  useEffect(() => {
    let map;
    try { map = new maplibregl.Map({ container: host.current, style: 'https://tiles.openfreemap.org/styles/dark', center: [0, 20], zoom: 2, attributionControl: true }); }
    catch { setError('Este navegador no pudo abrir el mapa. Puedes consultar la auditoría y los datos operativos.'); return undefined; }
    instance.current = map;
    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }));
    let fallback = false;
    map.on('error', () => {
      setError('El mapa base no cargó por completo. Se conserva la vista de geometrías del caso.');
      if (!fallback && !map.getSource('clean-com')) {
        fallback = true;
        map.setStyle({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0c1526' } }] });
      }
    });
    map.on('style.load', () => {
      if (map.getSource('clean-com')) return;
      map.addSource('clean-com', { type: 'geojson', data: empty });
      map.addLayer({ id: 'clean-com-areas', type: 'fill', source: 'clean-com', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#718eff', 'fill-opacity': 0.3, 'fill-outline-color': '#a7bdff' } });
      map.addLayer({ id: 'clean-com-lines', type: 'line', source: 'clean-com', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#ff7480', 'line-width': 2.4 } });
      map.addLayer({ id: 'clean-com-points', type: 'circle', source: 'clean-com', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#82d6bd', 'circle-radius': 4, 'circle-stroke-color': '#fff', 'circle-stroke-width': 0.7 } });
      update();
    });
    map.on('sourcedata', (event) => {
      if (event.sourceId === 'clean-com' && event.isSourceLoaded) map.once('render', () => {
        if (!map.getLayer('clean-com-lines')) return;
        const visible = map.queryRenderedFeatures({ layers: ['clean-com-points', 'clean-com-lines', 'clean-com-areas'] }).length;
        setGeometryReady(visible > 0 || !latest.current.collection?.features.length);
      });
    });
    map.on('click', (event) => {
      if (!map.getLayer('clean-com-lines')) return;
      const hit = map.queryRenderedFeatures(event.point, { layers: ['clean-com-points', 'clean-com-lines', 'clean-com-areas'] })[0];
      if (hit) {
        const feature = latest.current.collection?.features.find((row) => String(row.id) === String(hit.id));
        if (feature) latest.current.onSelect?.(feature);
      }
    });
    return () => { instance.current = null; map.remove(); };
  }, []);
  useEffect(update, [collection, bounds, analytical]);
  return <div>{!geometryReady && <p role="status">Preparando la vista del mapa…</p>}<div className="cleancom-map" data-geometry-ready={geometryReady} ref={host} aria-label="Mapa de geometrías SOI" />{error && <p className="auth-hint" role="status">{error}</p>}</div>;
}
