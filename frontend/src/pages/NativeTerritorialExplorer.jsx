import { coordinatesOf, belongsToTerritory, territoryType } from '../lib/territory';
import { sourceLabel } from '../lib/sourceLabel.mjs';
import MapLayerControl from '../components/MapLayerControl';
import { PROPERTY_LAYER_PATH } from '../lib/horizontalProperty.mjs';
import { assetsToGeoJSON as locationsToGeoJSON, assetMapTarget } from '../lib/assetGeometry.mjs';
import { useLiveResource, useLiveRefresh } from '../lib/useLiveResource';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { apiRequest } from '../lib/api';
import SpatialDataImporter from '../components/SpatialDataImporter';
import SpatialDatasetAdmin from '../components/SpatialDatasetAdmin';
import SpatialSearch from '../components/SpatialSearch';
import TerritorialRiskAnalyzer from '../components/TerritorialRiskAnalyzer';
import TerrainHydrologyAnalyzer from '../components/TerrainHydrologyAnalyzer';
import MapDrawingTools from '../components/MapDrawingTools';
import RiskScenarioMap from '../components/RiskScenarioMap';
import './NativeTerritorialExplorer.css';
import CommunityKnowledgePanel from '../components/CommunityKnowledgePanel';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] };
const EMPTY_LAYERS = Object.freeze({});
const INTERNAL_STYLE = 'https://tiles.openfreemap.org/styles/dark';

function comparisonCandidatesToGeoJSON(candidates) {
  const features = (Array.isArray(candidates) ? candidates : []).flatMap((candidate) => {
    const coordinates = Array.isArray(candidate.coordinates) ? candidate.coordinates : null;
    const longitude = Number(candidate.lng ?? coordinates?.[0] ?? candidate.longitude);
    const latitude = Number(candidate.lat ?? coordinates?.[1] ?? candidate.latitude);
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return [];
    return [{
      type: 'Feature',
      id: candidate.id || `${candidate.name}:${longitude}:${latitude}`,
      geometry: { type: 'Point', coordinates: [longitude, latitude] },
      properties: { name: candidate.displayName || candidate.name || 'Candidato', rank: Number(candidate.rank) || 0 },
    }];
  });
  return { type: 'FeatureCollection', features };
}

function terrainToGeoJSON(terrain, metric = 'relief') {
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
function applyTerrainMode(map, mode) {
  map.setLayoutProperty('backstage-terrain-fill', 'visibility', ['relief', 'slope'].includes(mode) ? 'visible' : 'none');
  map.setLayoutProperty('backstage-terrain-3d', 'visibility', 'none');
  if (map.getSource('soi-dem')) map.setTerrain(mode === '3d' ? { source: 'soi-dem', exaggeration: 1 } : null);
  map.setLayoutProperty('backstage-buildings-3d', 'visibility', mode === '3d' ? 'visible' : 'none');
  map.setLayoutProperty('backstage-contour-lines', 'visibility', ['contours', '3d'].includes(mode) ? 'visible' : 'none');
  map.setLayoutProperty('backstage-contour-labels', 'visibility', ['contours', '3d'].includes(mode) ? 'visible' : 'none');
  map.setPaintProperty('backstage-terrain-fill', 'fill-opacity', mode === 'slope' ? 0.45 : 0.28);
  map.setPaintProperty('backstage-terrain-fill', 'fill-color', mode === 'slope'
    ? ['interpolate', ['linear'], ['get', 'value'], 0, '#151518', 0.15, '#33343a', 0.33, '#c5a243', 0.66, '#ea7836', 1, '#c72f37']
    : ['interpolate', ['linear'], ['get', 'value'], 0, '#08251f', 0.35, '#17634f', 0.7, '#b48c42', 1, '#eef5ed']);
}

function styleBackstageLabels(map) {
  const labels = map.getStyle().layers.filter((layer) => layer.type === 'symbol' && layer.layout?.['text-field']);
  labels.forEach((layer) => {
    const id = layer.id.toLowerCase();
    const isCountry = id.includes('country');
    const isCapital = id.includes('capital') || id.includes('city_large');
    const isCity = isCapital || id.includes('city') || id.includes('state');
    const isTown = id.includes('town') || id.includes('village');
    const isNeighborhood = id.includes('suburb') || id.includes('neighborhood') || id.includes('locality');
    const isRoad = id.includes('highway') || id.includes('road') || id.includes('street');
    const isLandform = id.includes('mountain') || id.includes('peak') || id.includes('waterway');
    const priority = isCountry ? 0 : isCapital ? 1 : isCity ? 2 : isTown ? 3 : isNeighborhood ? 4 : isRoad ? 5 : isLandform ? 6 : 8;
    const size = isCountry
      ? ['interpolate', ['linear'], ['zoom'], 2, 14, 6, 18]
      : isCity
        ? ['interpolate', ['linear'], ['zoom'], 5, 12, 10, 16, 14, 18]
        : isNeighborhood
          ? ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 14]
          : isRoad
            ? ['interpolate', ['linear'], ['zoom'], 12, 10, 17, 12]
            : ['interpolate', ['linear'], ['zoom'], 8, 10, 16, 13];
    map.setPaintProperty(layer.id, 'text-color', priority <= 3 ? '#F5F5F5' : '#C5C5CA');
    map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(0,0,0,0.88)');
    map.setPaintProperty(layer.id, 'text-halo-width', priority <= 3 ? 2.2 : 1.6);
    map.setLayoutProperty(layer.id, 'text-size', size);
    map.setLayoutProperty(layer.id, 'text-font', ['Noto Sans Regular']);
    map.setLayoutProperty(layer.id, 'symbol-sort-key', priority);
    map.setLayoutProperty(layer.id, 'text-allow-overlap', false);
    map.setLayoutProperty(layer.id, 'text-ignore-placement', false);
    map.setLayoutProperty(layer.id, 'text-pitch-alignment', 'viewport');
    map.setLayoutProperty(layer.id, 'text-rotation-alignment', 'viewport');
  });
}

function moveAnalysisLayersBelowLabels(map) {
  const labelAnchor = map.getStyle().layers.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field'])?.id;
  if (!labelAnchor) return;
  [
    'backstage-terrain-fill', 'backstage-terrain-3d', 'backstage-contour-lines',
    'backstage-imported-polygons', 'backstage-imported-lines', 'backstage-drainage-lines',
    'backstage-landform-points', 'backstage-risk-scenario-fill', 'backstage-buildings-3d', 'backstage-contour-labels',
  ].forEach((id) => { if (map.getLayer(id)) map.moveLayer(id, labelAnchor); });
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
  map.addSource('backstage-landforms', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('backstage-drainage', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('backstage-drawing', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('backstage-risk-scenario', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('backstage-selected-territory', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('backstage-comparison-candidates', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('backstage-projects', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('backstage-horizontal-property', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('backstage-economics', { type: 'geojson', data: EMPTY_COLLECTION });
  const economicColor=['case',['boolean',['get','has_balance'],false],'#cf5d63','#91949a'];
  map.addLayer({id:'backstage-economic-polygons',type:'fill',source:'backstage-economics',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':economicColor,'fill-opacity':0.45,'fill-outline-color':'#FFFFFF'}});
  map.addLayer({id:'backstage-economic-points',type:'circle',source:'backstage-economics',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':economicColor,'circle-radius':9,'circle-stroke-color':'#FFFFFF','circle-stroke-width':2}});
  map.addLayer({id:'backstage-economic-lines',type:'line',source:'backstage-economics',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':economicColor,'line-width':4}});
  map.addLayer({ id: 'backstage-ph-polygons', type: 'fill', source: 'backstage-horizontal-property', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#D1D5DB', 'fill-opacity': 0.3, 'fill-outline-color': '#FFFFFF' } });
  map.addLayer({ id: 'backstage-ph-lines', type: 'line', source: 'backstage-horizontal-property', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#FFFFFF', 'line-width': 3 } });
  map.addLayer({ id: 'backstage-ph-points', type: 'circle', source: 'backstage-horizontal-property', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 8, 'circle-color': '#D1D5DB', 'circle-stroke-color': '#08090B', 'circle-stroke-width': 3 } });
  map.addLayer({ id: 'backstage-project-points', type: 'circle', source: 'backstage-projects', paint: { 'circle-radius': 8, 'circle-color': '#E5E7EB', 'circle-stroke-color': '#17191D', 'circle-stroke-width': 3 } });
  map.addLayer({ id: 'backstage-project-labels', type: 'symbol', source: 'backstage-projects', layout: { 'text-field': ['get','name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0,1.4], 'text-allow-overlap': false }, paint: { 'text-color': '#FFFFFF', 'text-halo-color': '#08090B', 'text-halo-width': 2 } });
  map.addLayer({
    id: 'backstage-terrain-fill', type: 'fill', source: 'backstage-terrain',
    paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'value'], 0, '#08251f', 0.35, '#17634f', 0.7, '#b48c42', 1, '#eef5ed'],
      'fill-opacity': 0.28,
    },
  });
  map.addLayer({
    id: 'backstage-terrain-3d', type: 'fill-extrusion', source: 'backstage-terrain', layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'value'], 0, '#08251f', 0.5, '#43866c', 1, '#e7dac0'],
      'fill-extrusion-height': ['get', 'extrusion'],
      'fill-extrusion-opacity': 0.86,
    },
  });
  map.addLayer({
    id: 'backstage-buildings-3d',
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 15,
    layout: { visibility: 'none' },
    filter: ['all', ['has', 'render_height'], ['>', ['to-number', ['get', 'render_height']], 0]],
    paint: {
      'fill-extrusion-color': '#77777f',
      'fill-extrusion-height': ['to-number', ['get', 'render_height']],
      'fill-extrusion-base': ['to-number', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.78,
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
    id: 'backstage-contour-labels', type: 'symbol', source: 'backstage-contours',
    filter: ['==', ['get', 'major'], 1],
    layout: {
      visibility: 'none',
      'symbol-placement': 'line',
      'text-field': ['concat', ['to-string', ['get', 'elevation']], ' m'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 10,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
    },
    paint: { 'text-color': '#F5F5F5', 'text-halo-color': 'rgba(0,0,0,0.88)', 'text-halo-width': 1.5 },
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
    id: 'backstage-drainage-lines', type: 'line', source: 'backstage-drainage',
    paint: { 'line-color': '#35b9ff', 'line-width': ['interpolate', ['linear'], ['get', 'accumulation'], 1, 1, 100, 5], 'line-opacity': 0.85 },
  });
  map.addLayer({
    id: 'backstage-landform-points', type: 'circle', source: 'backstage-landforms',
    filter: ['!=', ['get', 'landform'], 'slope'],
    paint: {
      'circle-radius': 3,
      'circle-color': ['case', ['==', ['get', 'landform'], 'valley'], '#35b9ff', '#ffb347'],
      'circle-opacity': 0.75,
    },
  });
  map.addLayer({
    id: 'backstage-location-polygons', type: 'fill', source: 'backstage-locations', filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#39f5ae', 'fill-opacity': 0.18 },
  });
  map.addLayer({
    id: 'backstage-location-lines', type: 'line', source: 'backstage-locations', filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]],
    paint: { 'line-color': '#39f5ae', 'line-width': 2 },
  });
  map.addLayer({
    id: 'backstage-location-halo', type: 'circle', source: 'backstage-locations',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 10, 'circle-color': '#39f5ae', 'circle-opacity': 0.16 },
  });
  map.addLayer({
    id: 'backstage-location-points', type: 'circle', source: 'backstage-locations',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 5.5, 'circle-color': '#39f5ae', 'circle-stroke-color': '#eafff7', 'circle-stroke-width': 1.5 },
  });
  map.addLayer({
    id: 'backstage-risk-scenario-fill', type: 'fill', source: 'backstage-risk-scenario',
    paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'scenarioScore'], 0, '#2cb67d', 0.4, '#f4d35e', 0.7, '#ee964b', 1, '#d62828'],
      'fill-opacity': 0.64, 'fill-outline-color': 'rgba(255,255,255,0.25)',
    },
  });
  map.addLayer({
    id: 'backstage-drawing-fill', type: 'fill', source: 'backstage-drawing', filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#c77dff', 'fill-opacity': 0.22, 'fill-outline-color': '#e0aaff' },
  });
  map.addLayer({
    id: 'backstage-drawing-line', type: 'line', source: 'backstage-drawing', filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#e0aaff', 'line-width': 3 },
  });
  map.addLayer({
    id: 'backstage-drawing-points', type: 'circle', source: 'backstage-drawing', filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-color': '#e0aaff', 'circle-radius': 5, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 },
  });
  map.addLayer({
    id: 'backstage-comparison-candidate-points', type: 'circle', source: 'backstage-comparison-candidates',
    paint: {
      'circle-radius': 8,
      'circle-color': ['match', ['get', 'rank'], 1, '#10d981', 2, '#fbbf24', 3, '#ff8c42', '#ff2b2b'],
      'circle-stroke-color': '#fff4f4', 'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: 'backstage-comparison-candidate-labels', type: 'symbol', source: 'backstage-comparison-candidates',
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-allow-overlap': false },
    paint: { 'text-color': '#F5F5F5', 'text-halo-color': 'rgba(0,0,0,0.88)', 'text-halo-width': 1.7 },
  });
  map.addLayer({
    id: 'backstage-selected-territory-fill', type: 'fill', source: 'backstage-selected-territory',
    paint: { 'fill-color': '#ff2b2b', 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'backstage-selected-territory-line', type: 'line', source: 'backstage-selected-territory',
    paint: { 'line-color': '#ff2b2b', 'line-width': 3, 'line-opacity': 0.95, 'line-blur': 1 },
  });
  map.addLayer({
    id: 'backstage-selected-territory-point', type: 'circle', source: 'backstage-selected-territory',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-color': '#ff2b2b', 'circle-radius': 8, 'circle-stroke-color': '#fff4f4', 'circle-stroke-width': 2 },
  });
}

function NativeTerritorialExplorer({ user, operationalContext, canManageSpatialData, onNavigate, embedded = false, onCameraChange, economicOverlay }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const terrainRef = useRef(null);
  const locationsRef = useRef([]);
  const propertyFeaturesRef = useRef(EMPTY_COLLECTION);
  const economicOverlayRef=useRef(economicOverlay);economicOverlayRef.current=economicOverlay;
  const terrainModeRef = useRef('none');
  const requestRef = useRef(0);
  const terrainRequestKeyRef = useRef('');
  const tileRequestRef = useRef(0);
  const terrainAbortRef = useRef(null);
  const tileAbortRef = useRef(null);
  const tileCacheRef = useRef(new Map());
  const mapContextRef = useRef(operationalContext?.mapContext || null);
  const operationalContextRef = useRef(operationalContext);
  const onNavigateRef = useRef(onNavigate);
  const dataZoomRef = useRef(8);
  const reloadTilesRef = useRef(null);
  const reloadTerrainRef = useRef(null);
  const [locations, setLocations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [terrain, setTerrain] = useState(null);
  const [terrainLoading, setTerrainLoading] = useState(true);
  const [terrainError, setTerrainError] = useState('');
  const [terrainMode, setTerrainMode] = useState('none');
  const [dataZoom, setDataZoom] = useState(8);
  const [visibleFeatureCount, setVisibleFeatureCount] = useState(0);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [mapCenter, setMapCenter] = useState(coordinatesOf(operationalContext?.territory) || [0, 20]);
  const [geocodingViewbox, setGeocodingViewbox] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapAttempt, setMapAttempt] = useState(0);
  const [mapView, setMapView] = useState(operationalContext?.mapView || '2d');
  const [projects, setProjects] = useState([]);
  const [hoverName, setHoverName] = useState('');
  const propertyLayer = useLiveResource(`${PROPERTY_LAYER_PATH}/geojson`, 60000);
  const layerValues = operationalContext?.layers || EMPTY_LAYERS;
  useEffect(()=>{setMapView(operationalContext?.mapView||'2d');},[operationalContext?.mapView]);
  operationalContextRef.current = operationalContext;
  onNavigateRef.current = onNavigate;

  const activateTerritory = (item, coordinate) => {
    if (!item || !Array.isArray(coordinate) || coordinate.length < 2) return;
    const geometry = item.geometry || { type: 'Point', coordinates: coordinate };
    const territory = {
      id: item.id || item.location_id || null,
      origin: item.origin || item.properties?.origin || null,
      location_id: item.location_id || item.properties?.location_id || null,
      asset_id: item.asset_id || item.properties?.asset_id || null,
      type: item.type || item.objectType || item.locationType || 'territory',
      name: item.name || item.displayName || item.properties?.name || 'Territorio seleccionado',
      displayName: item.displayName || item.properties?.displayName || item.name || 'Territorio seleccionado',
      city: item.city || item.municipality || item.properties?.city || null,
      municipality: item.municipality || item.properties?.municipality || null,
      region: item.region || item.properties?.region || null,
      country: item.country || item.properties?.country || null,
      countryCode: item.countryCode || item.properties?.countryCode || null,
      coordinates: coordinate,
      bbox: item.bbox || item.bounds || null,
      geometry,
      source: item.source || item.sourceId || item.provider || item.provenance?.source || null,
      provenance: item.provenance || (item.sourceVersion ? { source: item.source, version: item.sourceVersion, fetchedAt: item.sourceFetchedAt, license: 'ODbL 1.0' } : null),
    };
    setSelected({ ...territory, locationType: territory.type });
    const map = mapRef.current;
    const selectedSource = map?.getSource('backstage-selected-territory');
    selectedSource?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry, properties: { name: territory.name } }] });
    if (map && Array.isArray(territory.bbox) && territory.bbox.length === 4) {
      map.fitBounds([[territory.bbox[0], territory.bbox[1]], [territory.bbox[2], territory.bbox[3]]], { padding: 80, maxZoom: 14, duration: 900 });
    } else {
      map?.flyTo({ center: coordinate, zoom: 14, duration: 900 });
    }
    const mapCenter = map?.getCenter();
    const mapContext = map ? {
      center: coordinate,
      zoom: map.getZoom(),
      bounds: map.getBounds() ? [map.getBounds().getWest(), map.getBounds().getSouth(), map.getBounds().getEast(), map.getBounds().getNorth()] : territory.bbox,
    } : { center: coordinate, zoom: 12 };
    const nextContext = {
      ...operationalContextRef.current,
      preserveProject: true,
      territory,
      activeTerritory: territory,
      selectedLocation: territory,
      city: territory.city || territory.name,
      longitude: coordinate[0],
      latitude: coordinate[1],
      mapContext,
    };
    onNavigateRef.current?.('territorial-explorer', nextContext);
  };

  const createTerritoryProject = async () => {
    if (!selected) return;
    setMessage('Creando borrador de proyecto…');
    try {
      const response = await apiRequest('/analysis/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: `Proyecto en ${selected.city || selected.name}`,
          city: selected.city || selected.name,
          objective: 'Proyecto iniciado desde el territorio seleccionado en Explorer.',
          territory: selected,
          analysis_context: { ...operationalContextRef.current, mapContext: mapContextRef.current || operationalContextRef.current?.mapContext || null },
          selected_assets: [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo crear el proyecto.');
      onNavigateRef.current?.('portfolio-projects', {
        ...operationalContextRef.current,
        project: data,
        analysis_run_id: data.analysis_run_id,
        project_name: data.project_name,
        territory: selected,
        city: selected.city || selected.name,
        mapContext: mapContextRef.current || operationalContextRef.current?.mapContext,
      });
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    apiRequest('/assets?limit=500')
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'No fue posible cargar ubicaciones.');
        const nextLocations = (Array.isArray(data.data) ? data.data : []).filter(asset => !asset.metadata?.horizontal_property && assetMapTarget(asset));
        locationsRef.current = nextLocations;
        setLocations(nextLocations);
      })
      .catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    let map;
    setMapError('');
    try { map = new maplibregl.Map({
      container: containerRef.current,
      style: INTERNAL_STYLE,
      center: operationalContextRef.current?.mapContext?.center || coordinatesOf(operationalContextRef.current?.territory) || [0, 20],
      zoom: operationalContextRef.current?.mapContext?.zoom ?? (coordinatesOf(operationalContextRef.current?.territory) ? 12 : 2),
      pitch: operationalContextRef.current?.mapContext?.pitch || 0,
      bearing: operationalContextRef.current?.mapContext?.bearing || 0,
      renderWorldCopies: false,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
    }); } catch {
      setMapError('El mapa no pudo iniciar la aceleración gráfica. Puedes seguir usando la búsqueda y tus proyectos. Activa la aceleración gráfica del navegador o prueba otro dispositivo.');
      setTerrainLoading(false);
      return undefined;
    }
    mapRef.current = map;
    map.on('error', () => setMessage('No fue posible cargar completamente el mapa territorial.'));
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    const loadTerrain = async () => {
      const bounds = map.getBounds();
      const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      const zoom = map.getZoom();
      const resolution = 8;
      const requestKey = `${bbox.map((value) => value.toFixed(3)).join(',')}:${resolution}`;
      if (requestKey === terrainRequestKeyRef.current) return;
      terrainRequestKeyRef.current = requestKey;
      const requestId = ++requestRef.current;
      terrainAbortRef.current?.abort();
      const controller = new AbortController();
      terrainAbortRef.current = controller;
      setTerrainLoading(true);
      setTerrainError('');
      try {
        const response = await apiRequest(`/geography/surface?bbox=${bbox.join(',')}&resolution=${resolution}&contourInterval=25`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No fue posible generar el terreno.');
        if (requestId !== requestRef.current) return;
        terrainRef.current = data;
        setTerrain(data);
        setTerrainLoading(false);
        map.getSource('backstage-terrain')?.setData(terrainToGeoJSON(data, terrainModeRef.current));
        map.getSource('backstage-contours')?.setData(contoursToGeoJSON(data));
      } catch (error) {
        if (!controller.signal.aborted) {
          terrainRequestKeyRef.current = '';
          setTerrainLoading(false);
          setTerrainError(error.message);
          setMessage(error.message);
        }
      } finally {
        if (terrainAbortRef.current === controller) terrainAbortRef.current = null;
      }
    };

    reloadTerrainRef.current = loadTerrain;
    const loadSpatialTiles = async () => {
      if (!map.getSource('backstage-imported') || map.getZoom() < 6) return;
      const tiles = visibleTiles(map.getBounds(), dataZoomRef.current);
      const requestId = tileRequestRef.current + 1;
      tileRequestRef.current = requestId;
      tileAbortRef.current?.abort();
      const controller = new AbortController();
      tileAbortRef.current = controller;
      try {
        const payloads = new Array(tiles.length);
        let nextTile = 0;
        const fetchTile = async (tile) => {
          const { z, x, y } = tile;
          const key = `${operationalContextRef.current?.organization_id || 'anonymous'}:${z}/${x}/${y}`;
          const cached = tileCacheRef.current.get(key);
          if (cached && Date.now() - cached.cachedAt < 30000) {
            tileCacheRef.current.delete(key);
            tileCacheRef.current.set(key, cached);
            return cached.data;
          }
          const response = await apiRequest(`/spatial/tiles/${z}/${x}/${y}?worldId=earth&refresh=1`, { signal: controller.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'No fue posible cargar una tesela territorial.');
          tileCacheRef.current.set(key, { data, cachedAt: Date.now() });
          while (tileCacheRef.current.size > 128) tileCacheRef.current.delete(tileCacheRef.current.keys().next().value);
          return data;
        };
        const workers = Array.from({ length: Math.min(6, tiles.length) }, async () => {
          while (nextTile < tiles.length && !controller.signal.aborted) {
            const index = nextTile;
            nextTile += 1;
            payloads[index] = await fetchTile(tiles[index]);
          }
        });
        await Promise.all(workers);
        if (requestId !== tileRequestRef.current) return;
        const unique = new Map();
        payloads.flatMap((payload) => payload.features || []).forEach((feature) => unique.set(String(feature.id), feature));
        const features = [...unique.values()];
        map.getSource('backstage-imported')?.setData({ type: 'FeatureCollection', features });
        setVisibleFeatureCount(features.length);
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error.message);
      } finally {
        if (tileAbortRef.current === controller) tileAbortRef.current = null;
      }
    };
    reloadTilesRef.current = loadSpatialTiles;

    map.on('load', () => {
      const labelAnchor = map.getStyle().layers.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field'])?.id;
      const originalAddLayer = map.addLayer;
      try {
        if (labelAnchor) {
          map.addLayer = function addLayerBeforeLabels(layer, beforeId) {
            return originalAddLayer.call(map, layer, beforeId || labelAnchor);
          };
        }
        addBackstageLayers(map);
        styleBackstageLabels(map);
        map.addSource('soi-dem', { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium', maxzoom: 15,
          attribution: 'Terrain: Mapzen · USGS · NOAA · Copernicus · <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">fuentes y licencias regionales</a>' });
        map.addLayer({ id: 'soi-hillshade', type: 'hillshade', source: 'soi-dem', paint: { 'hillshade-exaggeration': 0.35 } });
      } catch (error) {
        console.error(JSON.stringify({ code: 'map_layer_initialization_failed' }));
        setMessage('No fue posible inicializar las capas territoriales.');
        return;
      } finally {
        map.addLayer = originalAddLayer;
      }
      ['backstage-selected-territory-fill', 'backstage-selected-territory-line', 'backstage-selected-territory-point'].forEach((id) => {
        if (map.getLayer(id)) map.moveLayer(id);
      });
      applyTerrainMode(map, terrainModeRef.current);
      map.addSource('backstage-live-places', { type: 'geojson', data: EMPTY_COLLECTION, attribution: 'OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors · ODbL' });
      map.addLayer({ id: 'backstage-live-places-points', type: 'circle', source: 'backstage-live-places', paint: { 'circle-radius': 5, 'circle-color': '#afc5ee', 'circle-stroke-color': '#162441', 'circle-stroke-width': 2 } });
      setMapReady(true);
      const initialBounds = map.getBounds();
      setGeocodingViewbox([initialBounds.getWest(), initialBounds.getSouth(), initialBounds.getEast(), initialBounds.getNorth()]);
      map.getSource('backstage-locations').setData(locationsToGeoJSON(locationsRef.current));
      map.getSource('backstage-comparison-candidates')?.setData(comparisonCandidatesToGeoJSON(operationalContextRef.current?.candidates));
      map.getSource('backstage-economics')?.setData(economicOverlayRef.current?.geojson||EMPTY_COLLECTION);
      const context = operationalContextRef.current;
      const territory = context?.territory;
      const center = territory?.coordinates || (context?.longitude != null && context?.latitude != null
        ? [Number(context.longitude), Number(context.latitude)] : null);
      if (Array.isArray(center) && center.length === 2 && center.every((value) => Number.isFinite(Number(value)))) {
        map.flyTo({ center: center.map(Number), zoom: context?.mapContext?.zoom || 12, duration: 0 });
        if (territory?.geometry) map.getSource('backstage-selected-territory')?.setData({
          type: 'FeatureCollection', features: [{ type: 'Feature', geometry: territory.geometry, properties: { name: territory.name } }],
        });
        setSelected(territory || { name: context.city || 'Territorio seleccionado', city: context.city, coordinates: center, locationType: 'Entidad espacial' });
      }
      loadTerrain();
      loadSpatialTiles();
    });
    let moveTimer;
    map.on('moveend', () => {
      window.clearTimeout(moveTimer);
      moveTimer = window.setTimeout(() => {
      const nextCenter = map.getCenter(); setMapCenter([nextCenter.lng, nextCenter.lat]);
      const bounds = map.getBounds();
      setGeocodingViewbox([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
      mapContextRef.current = {
        center: [nextCenter.lng, nextCenter.lat],
        zoom: map.getZoom(),
        pitch: map.getPitch(), bearing: map.getBearing(),
        bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      };
      onCameraChange?.(mapContextRef.current);
      loadTerrain(); loadSpatialTiles();
      }, 1200);
    });
    map.on('click', (event) => {
      const context = operationalContextRef.current;
      if (context?.soiPicker) {
        const selection = { coordinates: [event.lngLat.lng, event.lngLat.lat], name: 'Punto seleccionado en mapa', source: 'map_selection', precision: 'user_selected', selectedAt: new Date().toISOString() };
        if (context.soiPicker === 'route') selection.stopIndex = context.routeStopIndex;
        onNavigateRef.current?.(context.returnPage || 'soi', { soiPicker: null, returnPage: null,
          ...(context.soiPicker === 'asset' ? { soiAssetSelection: selection } : { soiRouteSelection: selection }) });
        return;
      }
      if (context?.projectPicker) {
        const coordinates = [event.lngLat.lng, event.lngLat.lat];
        const territory = {
          id: `site:${coordinates[0].toFixed(6)}:${coordinates[1].toFixed(6)}`,
          type: 'custom_site',
          name: context.projectDraft?.name || `Sitio ${coordinates[0].toFixed(4)}, ${coordinates[1].toFixed(4)}`,
          city: belongsToTerritory({ coordinates }, context.territory) ? context.territory?.city || null : null,
          region: belongsToTerritory({ coordinates }, context.territory) ? context.territory?.region || null : null,
          country: belongsToTerritory({ coordinates }, context.territory) ? context.territory?.country || null : null,
          coordinates,
          geometry: { type: 'Point', coordinates },
          source: 'Coordenada seleccionada en el mapa',
        };
        onNavigateRef.current?.('portfolio-projects', { ...context, projectPicker: false, territory, city: territory.city, projectDraft: context.projectDraft });
        return;
      }
      if (context?.assetPicker) {
        const coordinates = [event.lngLat.lng, event.lngLat.lat];
        const assetDraft = {
          ...(context.assetDraft || {}),
          city: belongsToTerritory({ coordinates }, context.territory) ? context.territory?.city || '' : '',
          region: belongsToTerritory({ coordinates }, context.territory) ? context.territory?.region || '' : '',
          country: belongsToTerritory({ coordinates }, context.territory) ? context.territory?.country || '' : '',
          latitude: coordinates[1],
          longitude: coordinates[0],
          geometry: { type: 'Point', coordinates },
          source: 'Coordenada seleccionada en el mapa',
        };
        const territory = { ...assetDraft, id: 'map:' + coordinates.join(','), name: assetDraft.name || 'Punto seleccionado', type: 'map_point', coordinates };
        onNavigateRef.current?.('portfolio-assets', { territory, assetPicker: false, assetImport: false, assetDraft });
        return;
      }
      if (!context?.candidatePicker) return;
      const coordinates = [event.lngLat.lng, event.lngLat.lat];
      const candidate = {
        id: `custom:${Math.round(coordinates[0]*1e6)}:${Math.round(coordinates[1]*1e6)}`,
        type: 'custom_coordinate',
        name: context.candidateDraftName || `Punto ${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`,
        address: context.candidateDraftAddress || null,
        city: belongsToTerritory({ coordinates }, context.territory) ? context.territory?.city || null : null,
        region: belongsToTerritory({ coordinates }, context.territory) ? context.territory?.region || null : null,
        country: belongsToTerritory({ coordinates }, context.territory) ? context.territory?.country || null : null,
        lat: coordinates[1],
        lng: coordinates[0],
        coordinates,
        geometry: { type: 'Point', coordinates },
        source: 'Coordenada seleccionada en el mapa',
      };
      const candidates = [...(context.candidates || [])];
      if (!candidates.some((item) => item.id === candidate.id)) candidates.push(candidate);
      onNavigateRef.current?.('portfolio-comparator', { ...context, candidatePicker: false, candidates: candidates.slice(0, 6) });
    });
    ['backstage-location-points', 'backstage-location-lines', 'backstage-location-polygons'].forEach(layerId => map.on('click', layerId, (event) => {
      if (operationalContextRef.current?.candidatePicker || operationalContextRef.current?.assetPicker || operationalContextRef.current?.projectPicker) return;
      const feature = event.features?.[0];
      if (feature) activateTerritory({ ...feature.properties, geometry: feature.geometry }, [event.lngLat.lng, event.lngLat.lat]);
    }));
    ['backstage-ph-points', 'backstage-ph-lines', 'backstage-ph-polygons'].forEach(layerId => map.on('click', layerId, event => {
      const context = operationalContextRef.current;
      if (context?.candidatePicker || context?.assetPicker || context?.projectPicker || context?.soiPicker) return;
      const id = Number(event.features?.[0]?.properties?.location_id);
      const feature = propertyFeaturesRef.current.features.find(row => Number(row.properties.location_id) === id);
      if (!feature) return;
      onNavigateRef.current?.('territorial-explorer', { property_layer_open: true, property_entity_id: id, preserveProject: true,
        territory: { location_id: id, asset_id: `platform:${id}`, name: feature.properties.name, geometry: feature.geometry } });
    }));
    map.on('click', 'backstage-comparison-candidate-points', (event) => {
      if (operationalContextRef.current?.candidatePicker || operationalContextRef.current?.assetPicker || operationalContextRef.current?.projectPicker) return;
      const feature = event.features?.[0];
      if (feature?.geometry?.type === 'Point') activateTerritory({ ...feature.properties, id: feature.id, type: 'comparison_candidate', geometry: feature.geometry }, feature.geometry.coordinates);
    });
    ['backstage-imported-points', 'backstage-imported-lines', 'backstage-imported-polygons'].forEach((layerId) => {
      map.on('click', layerId, (event) => {
        if (operationalContextRef.current?.candidatePicker || operationalContextRef.current?.assetPicker || operationalContextRef.current?.projectPicker) return;
        const feature = event.features?.[0];
        if (!feature) return;
        activateTerritory({
          ...feature.properties,
          name: feature.properties?.name || feature.properties?.objectType || 'Objeto territorial',
          type: feature.properties?.objectType || feature.geometry?.type || 'Geometría importada',
          geometry: feature.geometry,
          source: feature.properties?.sourceId || null,
        }, [event.lngLat.lng, event.lngLat.lat]);
      });
    });
    map.on('click', 'backstage-live-places-points', (event) => {
      if (operationalContextRef.current?.candidatePicker || operationalContextRef.current?.assetPicker || operationalContextRef.current?.projectPicker) return;
      const feature = event.features?.[0];
      if (feature) activateTerritory({ ...feature.properties, id: feature.properties.providerFeatureId || feature.properties.osmId || feature.id, geometry: feature.geometry, type: 'mapped_place' }, feature.geometry.coordinates);
    });
    map.on('mouseenter', 'backstage-location-points', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'backstage-location-points', () => { map.getCanvas().style.cursor = ''; });
    return () => {
      window.clearTimeout(moveTimer);
      terrainAbortRef.current?.abort();
      tileAbortRef.current?.abort();
      map.remove(); mapRef.current = null; setMapReady(false);
    };
  }, [mapAttempt]);

  useEffect(() => {
    dataZoomRef.current = dataZoom;
    tileRequestRef.current += 1;
    tileAbortRef.current?.abort();
    tileCacheRef.current.clear();
    reloadTilesRef.current?.();
  }, [dataZoom, catalogRevision, operationalContext?.organization_id]);

  useEffect(() => {
    mapRef.current?.getSource('backstage-comparison-candidates')?.setData(comparisonCandidatesToGeoJSON(operationalContext?.candidates));
  }, [operationalContext?.candidates]);
  useEffect(()=>{
    if(!mapReady)return;
    const geometry=operationalContext?.plannedRoute?.geometry;
    mapRef.current?.getSource('backstage-route')?.setData(geometry?.type==='LineString'?{type:'FeatureCollection',features:[{type:'Feature',geometry,properties:{data_kind:'planned'}}]}:EMPTY_COLLECTION);
  },[mapReady,operationalContext?.plannedRoute]);

  useEffect(() => {
    const map = mapRef.current;
    terrainModeRef.current = terrainMode;
    if (!map?.isStyleLoaded()) return;
    map.getSource('backstage-locations')?.setData(locationsToGeoJSON(locations));
    applyTerrainMode(map, terrainMode);
    if (locations.length) {
      const match = operationalContext?.asset_id
        ? locations.find(row => row.asset_id === operationalContext.asset_id)
        : operationalContext?.location_id ? locations.find((row) => row.origin === 'platform' && Number(row.location_id) === Number(operationalContext.location_id))
        : null;
      if (match) {
        map.flyTo({ center: assetMapTarget(match).center, zoom: 15, duration: 900 });
        setSelected({ ...match, locationType: match.type || 'Ubicación evaluada' });
      }
    }
  }, [locations, operationalContext?.city, operationalContext?.location_id, operationalContext?.asset_id]);

  const activePair = coordinatesOf(operationalContext?.territory);
  const publicPlaces = useLiveResource(activePair ? '/spatial/live-context?' + new URLSearchParams({ lat: activePair[1], lng: activePair[0], radiusM: '1200' }) : null, 5 * 60000);
  useEffect(() => {
    if (!mapReady) return;
    mapRef.current?.getSource('backstage-live-places')?.setData(publicPlaces.data?.cartography?.geojson || EMPTY_COLLECTION);
  }, [publicPlaces.data, mapReady]);
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const territory = operationalContext?.territory;
    const pair = coordinatesOf(territory);
    setSelected(territory ? { ...territory, locationType: territoryType(territory.type) } : null);
    map.getSource('backstage-selected-territory')?.setData(territory && assetMapTarget(territory) ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: territory.geometry || { type: 'Point', coordinates: pair }, properties: { name: territory.name } }] } : EMPTY_COLLECTION);
    const camera = pair || operationalContext?.mapContext?.center;
    if (camera) {
      const center = map.getCenter();
      if (Math.abs(center.lng - camera[0]) + Math.abs(center.lat - camera[1]) > 0.0005) map.flyTo({ center: camera, zoom: operationalContext?.mapContext?.zoom || 12, duration: 700 });
    }
  }, [operationalContext?.territory, mapReady]);
  useLiveRefresh(async () => {
    const response = await apiRequest('/assets?limit=500');
    if (response.ok) {
      const rows = await response.json();
      const located = (Array.isArray(rows.data) ? rows.data : []).filter(asset => !asset.metadata?.horizontal_property && assetMapTarget(asset));
      locationsRef.current = located;
      setLocations(located);
      tileCacheRef.current.clear();
      await reloadTilesRef.current?.();
    }
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    if (terrainRef.current) map.getSource('backstage-terrain')?.setData(terrainToGeoJSON(terrainRef.current, terrainMode));
    applyTerrainMode(map, terrainMode);
    map.easeTo({ pitch: terrainMode === '3d' ? 62 : 0, duration: 500 });
  }, [terrainMode]);

  useEffect(() => {
    const data = propertyLayer.data?.type === 'FeatureCollection' ? propertyLayer.data : EMPTY_COLLECTION;
    propertyFeaturesRef.current = data;
    if (mapReady) mapRef.current?.getSource('backstage-horizontal-property')?.setData(data);
  }, [propertyLayer.data, mapReady]);
  useEffect(()=>{if(mapReady)mapRef.current?.getSource('backstage-economics')?.setData(economicOverlay?.geojson||EMPTY_COLLECTION);},[economicOverlay,mapReady]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest('/analysis?limit=100', { signal: controller.signal }).then(async r => { const data = await r.json(); if (r.ok && Array.isArray(data) && !controller.signal.aborted) setProjects(data); }).catch(() => {});
    return () => controller.abort();
  }, [operationalContext?.organization_id, operationalContext?.analysis_run_id]);
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const features = projects.flatMap(project => {
      const pair = coordinatesOf(project.metadata?.territory);
      return pair ? [{ type:'Feature', id:project.analysis_run_id, geometry:{type:'Point',coordinates:pair}, properties:{name:project.project_name,project_id:project.analysis_run_id} }] : [];
    });
    map.getSource('backstage-projects')?.setData({ type:'FeatureCollection',features });
    applyTerrainMode(map, mapView === '3d' ? '3d' : terrainMode === '3d' ? 'none' : terrainMode);
    const groups = { assets:['backstage-location-points','backstage-location-halo','backstage-location-lines','backstage-location-polygons'], projects:['backstage-project-points','backstage-project-labels'], candidates:['backstage-comparison-candidate-points','backstage-comparison-candidate-labels'], places:['backstage-live-places-points'], routes:['backstage-route-line'], imported:['backstage-imported-points','backstage-imported-lines','backstage-imported-polygons'] };
    groups.horizontal_property = ['backstage-ph-points', 'backstage-ph-lines', 'backstage-ph-polygons'];
    for (const [key, ids] of Object.entries(groups)) for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id,'visibility',layerValues[key]===false?'none':'visible');
  }, [projects,mapReady,mapView,layerValues,terrainMode]);
  useEffect(()=>{
    if(!mapReady)return;
    const map=mapRef.current;
    map.setProjection({type:mapView==='globe'?'globe':'mercator'});
    map.easeTo({pitch:mapView==='3d'?62:0,duration:350});
  },[mapReady,mapView]);
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const hover = event => { const f=map.queryRenderedFeatures(event.point).find(f=>f.properties?.name||f.properties?.['name:es']); setHoverName(f?.properties?.name || f?.properties?.['name:es'] || ''); };
    const leave = () => setHoverName('');
    const openProject = event => { const id=Number(event.features?.[0]?.properties?.project_id);const project=projects.find(p=>Number(p.analysis_run_id)===id); if(project)onNavigateRef.current?.('portfolio-projects',{analysis_run_id:id,project,project_name:project.project_name,territory:project.metadata?.territory||null}); };
    map.on('mousemove',hover);map.getCanvas().addEventListener('mouseleave',leave);map.on('click','backstage-project-points',openProject);
    return()=>{map.off('mousemove',hover);map.getCanvas().removeEventListener('mouseleave',leave);map.off('click','backstage-project-points',openProject);};
  }, [mapReady,projects]);
  const layerList = [
    {key:'projects',label:'Mis proyectos',available:true,source:'BACKSTAGE · organización activa',status:`${projects.length} proyectos; solo se dibujan los que tienen ubicación`},
    {key:'assets',label:'Mis activos',available:true,source:'BACKSTAGE · organización activa',status:`${locations.length} activos con ubicación`},
    {key:'horizontal_property',label:'Propiedad Horizontal',available:!!propertyLayer.data,source:'Datos aportados por la organización · EPSG:4326',legend:'Solo geometrías propias; las unidades sin geometría conservan un vínculo lógico al contenedor',status:`${propertyLayer.data?.features?.length || 0} elementos con geometría${propertyLayer.data?.truncated ? '; se muestran los primeros 500' : ''}`,reason:propertyLayer.error || 'Consultando capa',manageLabel:'Gestionar copropiedades'},
    {key:'candidates',label:'Candidatos de comparación',available:true,source:'Selección del usuario'},
    {key:'places',label:'Lugares e infraestructura',available:!!publicPlaces.data,source:'OpenStreetMap / OpenFreeMap',reason:publicPlaces.error?'La consulta no está disponible':'Selecciona un lugar para consultar'},
    {key:'routes',label:'Rutas planificadas',available:true,source:'Ruta calculada o aportada',legend:'Planificación; no representa GPS en vivo'},
    {key:'imported',label:'Datos importados',available:true,source:'Fuentes registradas de la organización'},
    ...['Satélite','Tráfico en vivo','Calidad del aire','Objetos orbitales'].map((label,i)=>({key:`unavailable-${i}`,label,available:false,reason:'Sin fuente autorizada conectada'})),
  ];
  return (
    <section className={embedded?'explorer-map embedded':'explorer-map'} data-map-ready={mapReady} data-map-view={mapView}>
      {economicOverlay&&<div role="status" aria-label="Leyenda de saldos económicos"><strong>{economicOverlay.title}</strong><p>{economicOverlay.legend}</p><small>{economicOverlay.omitted_unlocated} entidades sin geometría propia omitidas; captura {new Date(economicOverlay.captured_at).toLocaleString()}.</small></div>}
      <div className="score-row">
        <div>
          {!embedded && <h2>Explorador territorial</h2>}
          {operationalContext?.returnPage && <button type="button" onClick={() => onNavigate?.(operationalContext.returnPage, { soiPicker: null, returnPage: null })}>Regresar sin cambiar la selección</button>}
        </div>
        <div className="form-actions">
          {['2d','3d','globe'].map(view=><button type="button" key={view} aria-pressed={mapView===view} onClick={()=>{setMapView(view);onNavigate?.('territorial-explorer',{mapView:view});}}>{view==='globe'?'Globo':view.toUpperCase()}</button>)}
          <details><summary>Visualización del terreno</summary>
          <button type="button" className="secondary" aria-pressed={terrainMode === 'none'} onClick={() => setTerrainMode('none')}>Sin superposición de relieve</button>
          {['relief', 'slope', 'contours'].map((mode) => (
            <button key={mode} type="button" aria-pressed={terrainMode === mode} disabled={mode !== '3d' && !terrain} title={!terrain && mode !== '3d' ? 'Espera a que cargue el DEM o vuelve a intentarlo.' : undefined} className={terrainMode === mode ? '' : 'secondary'} onClick={() => setTerrainMode(mode)}>
              {mode === 'relief' ? 'Relieve' : mode === 'slope' ? 'Pendiente' : mode === 'contours' ? 'Curvas de nivel' : 'Vista 3D'}
            </button>
          ))}
          </details>
        </div>
      </div>
      {mapView === '3d' && <div className="form-actions"><label>Resaltar alturas <input type="range" min="0.5" max="3" step="0.25" defaultValue="1" onChange={(event) => {const map=mapRef.current;if(map?.isStyleLoaded()&&map.getSource('soi-dem'))map.setTerrain({ source: 'soi-dem', exaggeration: Number(event.target.value) });}} /></label><p>Permite resaltar visualmente las diferencias de altura del terreno.</p></div>}
      <MapLayerControl layers={layerList} values={layerValues} onChange={(key,value)=>onNavigate?.('territorial-explorer',{layers:{...layerValues,[key]:value}})} onManage={key=>{if(key==='horizontal_property')onNavigate?.('territorial-explorer',{property_layer_open:true});}} />
      {terrainLoading && <p className="auth-hint" role="status">Cargando terreno para esta vista…</p>}
      {terrainError && <div className="message" role="alert"><p>No pudimos cargar el terreno de este lugar. {terrainError}</p><button type="button" className="secondary" disabled={terrainLoading} onClick={() => reloadTerrainRef.current?.()}>Volver a cargar el terreno</button></div>}
      {terrain?.dataMode === 'procedural' && (
        <p className="auth-hint" role="status">Vista orientativa: las alturas, pendientes y curvas son simuladas. No representan mediciones reales del terreno.</p>
      )}
      <details className="advanced-map-search"><summary>Búsqueda y rutas avanzadas</summary><SpatialSearch
        center={mapCenter}
        geocodingContext={{
          countryBias: operationalContext?.territory?.countryCode || operationalContext?.territory?.country || operationalContext?.countryCode || operationalContext?.country,
          regionBias: operationalContext?.territory?.region || operationalContext?.region || operationalContext?.department || operationalContext?.state || operationalContext?.city,
          viewboxBias: geocodingViewbox,
        }}
        onNavigate={(coordinate, item) => activateTerritory(item || { name: operationalContext?.city }, coordinate)}
        onRoute={(route) => {
          const map = mapRef.current;
          if (!map || !route?.geometry?.coordinates?.length) return;
          map.getSource('backstage-route')?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: route.geometry, properties: {} }] });
          const bounds = route.geometry.coordinates.reduce((box, coordinate) => box.extend(coordinate), new maplibregl.LngLatBounds(route.geometry.coordinates[0], route.geometry.coordinates[0]));
          map.fitBounds(bounds, { padding: 80, duration: 900 });
        }}
      /></details>

      <div className="map-shell territorial-map" style={{ position: 'relative' }}>
        {mapError && <div className="map-unavailable" role="alert"><p>{mapError}</p><button type="button" onClick={()=>setMapAttempt(v=>v+1)}>Volver a abrir el mapa</button></div>}
        {hoverName && <output className="map-hover-label" aria-live="off">{hoverName}</output>}
        <div ref={containerRef} aria-label="Mapa territorial WebGL" style={{ width: '100%', height: '620px' }} />
      </div>
        {selected && (
          <article className="card territorial-inspector" aria-label="Lugar seleccionado y acciones">
            <button type="button" className="secondary" onClick={() => setSelected(null)}>Cerrar</button>
            <h3>{selected.name}</h3>
            {user&&selected.origin==='platform'&&Number.isSafeInteger(Number(selected.location_id))&&Number(selected.location_id)>0&&!operationalContext?.property_layer_open&&<CommunityKnowledgePanel locationId={Number(selected.location_id)} user={user}/>}
            <p>{[selected.city || selected.municipality, selected.region, selected.country, selected.locationType || selected.type].filter(Boolean).join(' · ') || 'Territorio seleccionado'}</p>
            {selected.source && <p className="auth-hint">Fuente: {sourceLabel(selected.source)}</p>}
            {operationalContext?.assetImport && <button type="button" onClick={() => {
              const pair = coordinatesOf(selected);
              if (!pair) return;
              onNavigate?.('portfolio-assets', { territory: selected, assetImport: false, assetPicker: false, assetDraft: { name: selected.name || '', address: selected.displayName || '', city: selected.city || '', region: selected.region || '', country: selected.country || '', longitude: pair[0], latitude: pair[1], geometry: selected.geometry, source: selected.source } });
            }}>Usar este lugar para el activo</button>}
            <div className="form-actions">
              <button type="button" onClick={() => onNavigate?.('earthart', {
                ...operationalContextRef.current,
                territory: selected,
                selectedLocation: selected,
                city: selected.city || selected.name,
                longitude: selected.coordinates?.[0] ?? selected.lng ?? operationalContextRef.current?.longitude,
                latitude: selected.coordinates?.[1] ?? selected.lat ?? operationalContextRef.current?.latitude,
                mapContext: mapContextRef.current || operationalContextRef.current?.mapContext,
              })}>Abrir en AirHeart</button>
              <button type="button" className="secondary" disabled={!canManageSpatialData} onClick={createTerritoryProject}>Crear proyecto</button>
              <button type="button" className="secondary" onClick={() => {
                const candidate = { ...selected, id: selected.id || `territory:${selected.name}`, lat: selected.coordinates?.[1] ?? selected.lat, lng: selected.coordinates?.[0] ?? selected.lng };
                const candidates = [...(operationalContextRef.current?.candidates || [])];
                if (!candidates.some((item) => item.id === candidate.id)) candidates.push(candidate);
                onNavigate?.('portfolio-comparator', { ...operationalContextRef.current, territory: selected, mapContext: mapContextRef.current || operationalContextRef.current?.mapContext, candidates: candidates.slice(0, 6) });
              }}>Añadir a comparación</button>
            </div>
          </article>
        )}

      <details className="advanced-territorial-tools">
        <summary>Herramientas avanzadas</summary>
        <div className="advanced-territorial-tools-content">
          <TerritorialRiskAnalyzer center={mapCenter} />
          <RiskScenarioMap
            terrain={terrain}
            onResult={(result) => mapRef.current?.getSource('backstage-risk-scenario')?.setData(result)}
          />
          <TerrainHydrologyAnalyzer
            terrain={terrain}
            onHydrology={(result) => {
              mapRef.current?.getSource('backstage-landforms')?.setData(result.features);
              mapRef.current?.getSource('backstage-drainage')?.setData(result.drainage);
            }}
          />
          <MapDrawingTools map={mapReady ? mapRef.current : null} />
          {canManageSpatialData && (
            <>
              <SpatialDataImporter
                dataZoom={dataZoom}
                onDataZoomChange={setDataZoom}
                onImported={() => { setCatalogRevision((value) => value + 1); reloadTilesRef.current?.(); }}
              />
              <SpatialDatasetAdmin
                revision={catalogRevision}
                onChanged={() => { setCatalogRevision((value) => value + 1); reloadTilesRef.current?.(); }}
              />
            </>
          )}
        </div>
      </details>

      {terrain && (
        <p className="auth-hint">{terrain.dataMode === 'procedural' ? 'Elevación procedimental, no DEM' : `Fuente: ${terrain.source?.name || terrain.provenance?.name || terrain.provenance?.source || 'sin especificar'}`} · {terrain.statistics.minElevation.toFixed(0)}–{terrain.statistics.maxElevation.toFixed(0)} m · relieve {terrain.statistics.relief.toFixed(0)} m · malla {terrain.resolution}×{terrain.resolution}</p>
      )}
      <details><summary>Información cartográfica avanzada</summary><p className="auth-hint">Teselas XYZ nivel {dataZoom} · {visibleFeatureCount} objetos importados visibles. La fecha y precisión dependen de cada fuente. Globo conserva el territorio; no incluye telemetría orbital.</p></details>
      {message && <p className="message">{message}</p>}
    </section>
  );
}

export default NativeTerritorialExplorer;
