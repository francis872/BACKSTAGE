import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { apiRequest } from '../lib/api';
import SpatialDataImporter from '../components/SpatialDataImporter';
import SpatialDatasetAdmin from '../components/SpatialDatasetAdmin';
import SpatialSearch from '../components/SpatialSearch';
import TerritorialRiskAnalyzer from '../components/TerritorialRiskAnalyzer';

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] };
const INTERNAL_STYLE = {
  version: 8,
  name: 'BACKSTAGE Internal Spatial Style',
  sources: {},
  layers: [{ id: 'backstage-background', type: 'background', paint: { 'background-color': '#06100e' } }],
};

function locationsToGeoJSON(locations) {
  return {
    type: 'FeatureCollection',
    features: locations.map((location) => ({
      type: 'Feature',
      id: location.location_id,
      geometry: { type: 'Point', coordinates: [Number(location.longitude), Number(location.latitude)] },
      properties: {
        location_id: location.location_id,
        name: location.name,
        city: location.city || '',
        locationType: location.type || '',
      },
    })),
  };
}

function terrainToGeoJSON(terrain, metric = 'relief') {
  if (!terrain?.elevation?.length) return EMPTY_COLLECTION;
  const [minLng, minLat, maxLng, maxLat] = terrain.bbox;
  const rows = terrain.elevation.length;
  const columns = terrain.elevation[0].length;
  const min = terrain.statistics.minElevation;
  const elevationRange = Math.max(1, terrain.statistics.maxElevation - min);
  const features = [];
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < columns - 1; col += 1) {
      const x0 = minLng + col * (maxLng - minLng) / (columns - 1);
      const x1 = minLng + (col + 1) * (maxLng - minLng) / (columns - 1);
      const y0 = minLat + row * (maxLat - minLat) / (rows - 1);
      const y1 = minLat + (row + 1) * (maxLat - minLat) / (rows - 1);
      const elevation = terrain.elevation[row][col];
      const normalized = metric === 'slope'
        ? Math.min(1, terrain.slope[row][col] / 45)
        : (elevation - min) / elevationRange;
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] },
        properties: { value: normalized, elevation, extrusion: Math.max(0, elevation - min) },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function contoursToGeoJSON(terrain) {
  return {
    type: 'FeatureCollection',
    features: (terrain?.contours || []).flatMap((contour) => contour.lines
      .filter((line) => line.length > 1)
      .map((line) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: line },
        properties: { elevation: contour.elevation, major: contour.major ? 1 : 0 },
      }))),
  };
}

function lonLatToTile(lng, lat, zoom) {
  const size = 2 ** zoom;
  const boundedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = Math.floor((lng + 180) / 360 * size);
  const latRad = boundedLat * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * size);
  return { x: Math.max(0, Math.min(size - 1, x)), y: Math.max(0, Math.min(size - 1, y)) };
}

function visibleTiles(bounds, zoom, maximum = 36) {
  const northWest = lonLatToTile(bounds.getWest(), bounds.getNorth(), zoom);
  const southEast = lonLatToTile(bounds.getEast(), bounds.getSouth(), zoom);
  const tiles = [];
  for (let x = northWest.x; x <= southEast.x; x += 1) {
    for (let y = northWest.y; y <= southEast.y; y += 1) {
      tiles.push({ z: zoom, x, y });
      if (tiles.length >= maximum) return tiles;
    }
  }
  return tiles;
}

function addBackstageLayers(map) {
  map.addSource('backstage-terrain', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('backstage-contours', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('backstage-locations', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('backstage-imported', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('backstage-route', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addLayer({
    id: 'backstage-terrain-fill', type: 'fill', source: 'backstage-terrain',
    paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'value'], 0, '#08251f', 0.35, '#17634f', 0.7, '#b48c42', 1, '#eef5ed'],
      'fill-opacity': 0.82,
    },
  });
  map.addLayer({
    id: 'backstage-terrain-3d', type: 'fill-extrusion', source: 'backstage-terrain', layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'value'], 0, '#08251f', 0.5, '#43866c', 1, '#e7dac0'],
      'fill-extrusion-height': ['*', ['get', 'extrusion'], 2],
      'fill-extrusion-opacity': 0.86,
    },
  });
  map.addLayer({
    id: 'backstage-contour-lines', type: 'line', source: 'backstage-contours',
    paint: {
      'line-color': ['case', ['==', ['get', 'major'], 1], '#ecfff8', '#77cfae'],
      'line-width': ['case', ['==', ['get', 'major'], 1], 1.8, 0.8],
      'line-opacity': 0.78,
    },
  });
  map.addLayer({
    id: 'backstage-imported-polygons', type: 'fill', source: 'backstage-imported',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#4f8cff', 'fill-opacity': 0.28, 'fill-outline-color': '#a9c6ff' },
  });
  map.addLayer({
    id: 'backstage-imported-lines', type: 'line', source: 'backstage-imported',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#ffc857', 'line-width': 2.4, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: 'backstage-imported-points', type: 'circle', source: 'backstage-imported',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 6, 'circle-color': '#5aa9ff', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 },
  });
  map.addLayer({
    id: 'backstage-route-line', type: 'line', source: 'backstage-route',
    paint: { 'line-color': '#ff5d8f', 'line-width': 5, 'line-opacity': 0.95 },
  });
  map.addLayer({
    id: 'backstage-location-halo', type: 'circle', source: 'backstage-locations',
    paint: { 'circle-radius': 10, 'circle-color': '#39f5ae', 'circle-opacity': 0.16 },
  });
  map.addLayer({
    id: 'backstage-location-points', type: 'circle', source: 'backstage-locations',
    paint: { 'circle-radius': 5.5, 'circle-color': '#39f5ae', 'circle-stroke-color': '#eafff7', 'circle-stroke-width': 1.5 },
  });
}

function NativeTerritorialExplorer({ operationalContext }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const terrainRef = useRef(null);
  const locationsRef = useRef([]);
  const terrainModeRef = useRef('relief');
  const requestRef = useRef(0);
  const dataZoomRef = useRef(8);
  const reloadTilesRef = useRef(null);
  const [locations, setLocations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [terrain, setTerrain] = useState(null);
  const [terrainMode, setTerrainMode] = useState('relief');
  const [dataZoom, setDataZoom] = useState(8);
  const [visibleFeatureCount, setVisibleFeatureCount] = useState(0);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [mapCenter, setMapCenter] = useState([-74.07, 4.71]);

  useEffect(() => {
    apiRequest('/locations')
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'No fue posible cargar ubicaciones.');
        const nextLocations = (Array.isArray(data) ? data : []).filter((row) => row.latitude != null && row.longitude != null);
        locationsRef.current = nextLocations;
        setLocations(nextLocations);
      })
      .catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: INTERNAL_STYLE,
      center: [-74.07, 4.71],
      zoom: 8,
      pitch: 35,
      bearing: 0,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    const loadTerrain = async () => {
      const bounds = map.getBounds();
      const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      try {
        const response = await apiRequest(`/terrain/surface?bbox=${bbox.join(',')}&resolution=33&contourInterval=25&lod=${map.getZoom() < 5 ? 1 : 0}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No fue posible generar el terreno.');
        if (requestId !== requestRef.current) return;
        terrainRef.current = data;
        setTerrain(data);
        map.getSource('backstage-terrain')?.setData(terrainToGeoJSON(data, terrainModeRef.current));
        map.getSource('backstage-contours')?.setData(contoursToGeoJSON(data));
      } catch (error) {
        setMessage(error.message);
      }
    };

    const loadSpatialTiles = async () => {
      if (!map.getSource('backstage-imported')) return;
      const tiles = visibleTiles(map.getBounds(), dataZoomRef.current);
      try {
        const responses = await Promise.all(tiles.map(({ z, x, y }) => apiRequest(`/spatial/tiles/${z}/${x}/${y}?worldId=earth`)));
        const payloads = await Promise.all(responses.map(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'No fue posible cargar una tesela territorial.');
          return data;
        }));
        const unique = new Map();
        payloads.flatMap((payload) => payload.features || []).forEach((feature) => unique.set(String(feature.id), feature));
        const features = [...unique.values()];
        map.getSource('backstage-imported')?.setData({ type: 'FeatureCollection', features });
        setVisibleFeatureCount(features.length);
      } catch (error) {
        setMessage(error.message);
      }
    };
    reloadTilesRef.current = loadSpatialTiles;

    map.on('load', () => {
      addBackstageLayers(map);
      map.getSource('backstage-locations').setData(locationsToGeoJSON(locationsRef.current));
      loadTerrain();
      loadSpatialTiles();
    });
    map.on('moveend', () => {
      const nextCenter = map.getCenter(); setMapCenter([nextCenter.lng, nextCenter.lat]);
      loadTerrain(); loadSpatialTiles();
    });
    map.on('click', 'backstage-location-points', (event) => {
      const properties = event.features?.[0]?.properties;
      if (properties) setSelected(properties);
    });
    ['backstage-imported-points', 'backstage-imported-lines', 'backstage-imported-polygons'].forEach((layerId) => {
      map.on('click', layerId, (event) => {
        const feature = event.features?.[0];
        if (feature) setSelected({
          ...feature.properties,
          name: feature.properties?.name || feature.properties?.objectType || 'Objeto territorial',
          locationType: feature.geometry?.type || 'Geometría importada',
        });
      });
    });
    map.on('mouseenter', 'backstage-location-points', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'backstage-location-points', () => { map.getCanvas().style.cursor = ''; });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    dataZoomRef.current = dataZoom;
    reloadTilesRef.current?.();
  }, [dataZoom]);

  useEffect(() => {
    const map = mapRef.current;
    terrainModeRef.current = terrainMode;
    if (!map?.isStyleLoaded()) return;
    map.getSource('backstage-locations')?.setData(locationsToGeoJSON(locations));
    if (operationalContext?.city && locations.length) {
      const match = locations.find((row) => row.city === operationalContext.city);
      if (match) map.flyTo({ center: [Number(match.longitude), Number(match.latitude)], zoom: 12, duration: 900 });
    }
  }, [locations, operationalContext?.city]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !terrainRef.current) return;
    map.getSource('backstage-terrain')?.setData(terrainToGeoJSON(terrainRef.current, terrainMode));
    map.setLayoutProperty('backstage-terrain-fill', 'visibility', terrainMode === '3d' ? 'none' : 'visible');
    map.setLayoutProperty('backstage-terrain-3d', 'visibility', terrainMode === '3d' ? 'visible' : 'none');
    map.easeTo({ pitch: terrainMode === '3d' ? 62 : 35, duration: 500 });
  }, [terrainMode]);

  return (
    <section>
      <div className="score-row">
        <div>
          <p className="eyebrow">BACKSTAGE Engine + MapLibre WebGL</p>
          <h2>Explorador territorial híbrido</h2>
        </div>
        <div className="form-actions">
          {['relief', 'slope', 'contours', '3d'].map((mode) => (
            <button key={mode} type="button" className={terrainMode === mode ? '' : 'secondary'} onClick={() => setTerrainMode(mode)}>
              {mode === 'relief' ? 'Relieve' : mode === 'slope' ? 'Pendiente' : mode === 'contours' ? 'Curvas' : 'Vista 3D'}
            </button>
          ))}
        </div>
      </div>
      <p className="auth-hint">MapLibre acelera la presentación WebGL; los datos, cálculos y estilos proceden exclusivamente del motor BACKSTAGE.</p>
      <SpatialSearch
        center={mapCenter}
        onNavigate={(coordinate) => coordinate && mapRef.current?.flyTo({ center: coordinate, zoom: 14, duration: 900 })}
        onRoute={(route) => {
          const map = mapRef.current;
          if (!map || !route?.geometry?.coordinates?.length) return;
          map.getSource('backstage-route')?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: route.geometry, properties: {} }] });
          const bounds = route.geometry.coordinates.reduce((box, coordinate) => box.extend(coordinate), new maplibregl.LngLatBounds(route.geometry.coordinates[0], route.geometry.coordinates[0]));
          map.fitBounds(bounds, { padding: 80, duration: 900 });
        }}
      />
      <TerritorialRiskAnalyzer center={mapCenter} />
      <SpatialDataImporter
        dataZoom={dataZoom}
        onDataZoomChange={setDataZoom}
        onImported={() => { setCatalogRevision((value) => value + 1); reloadTilesRef.current?.(); }}
      />
      <SpatialDatasetAdmin
        revision={catalogRevision}
        onChanged={() => { setCatalogRevision((value) => value + 1); reloadTilesRef.current?.(); }}
      />
      {terrain && (
        <p className="auth-hint">Modelo procedimental · {terrain.statistics.minElevation.toFixed(0)}–{terrain.statistics.maxElevation.toFixed(0)} m · relieve {terrain.statistics.relief.toFixed(0)} m · malla {terrain.resolution}×{terrain.resolution}</p>
      )}
      <p className="auth-hint">Teselas XYZ nivel {dataZoom} · {visibleFeatureCount} objetos reales visibles</p>
      {message && <p className="message">{message}</p>}
      <div className="map-shell" style={{ position: 'relative' }}>
        <div ref={containerRef} aria-label="Mapa territorial WebGL" style={{ width: '100%', height: '620px' }} />
        {selected && (
          <article className="card" style={{ position: 'absolute', top: 16, right: 16, width: 280, zIndex: 2 }}>
            <button type="button" className="secondary" style={{ float: 'right' }} onClick={() => setSelected(null)}>×</button>
            <h3>{selected.name}</h3>
            <p>{selected.city || 'Sin municipio'} · {selected.locationType || 'Sin tipo'}</p>
          </article>
        )}
      </div>
    </section>
  );
}

export default NativeTerritorialExplorer;
