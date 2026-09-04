import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { apiRequest } from '../lib/api';

function normalizeGeometryType(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('polygon')) return 'polygon';
  if (text.includes('line')) return 'line';
  return 'point';
}

function parseCoordinateSearch(text) {
  const parts = String(text).split(',').map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((value) => Number.isNaN(value))) {
    return null;
  }
  const [lat, lng] = parts;
  return { lat, lng };
}

function TerritorialExplorer() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const [layers, setLayers] = useState([]);
  const [loadingLayers, setLoadingLayers] = useState(true);
  const [message, setMessage] = useState('');
  const [searchText, setSearchText] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);

  const visibleLayers = useMemo(() => layers.filter((layer) => layer.visible), [layers]);

  const getMapBoundsBbox = () => {
    const map = mapRef.current;
    if (!map) return null;
    const bounds = map.getBounds();
    return `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
  };

  const attachClickHandler = (map, layerId) => {
    map.on('click', layerId, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      if (popupRef.current) popupRef.current.remove();
      const props = feature.properties || {};
      const title = props.name || props.brand_name || props.category || 'Elemento';
      const entries = Object.entries(props).slice(0, 6).map(([key, value]) => `<div><strong>${key}:</strong> ${String(value)}</div>`).join('');
      popupRef.current = new maplibregl.Popup({ closeButton: true })
        .setLngLat(event.lngLat)
        .setHTML(`<div><h4>${title}</h4>${entries}</div>`)
        .addTo(map);
    });
    map.on('mouseenter', layerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = '';
    });
  };

  const renderLayerOnMap = (layer, geojson) => {
    const map = mapRef.current;
    if (!map || !map.getStyle()) return;

    const sourceId = `layer-source-${layer.layer_id}`;
    const layerId = `layer-vis-${layer.layer_id}`;
    const layerType = normalizeGeometryType(layer.geometry_type);
    const style = layer.style_json || {};

    if (map.getSource(sourceId)) {
      map.getSource(sourceId).setData(geojson);
    } else {
      map.addSource(sourceId, {
        type: 'geojson',
        data: geojson,
      });
    }

    if (!map.getLayer(layerId)) {
      if (layerType === 'polygon') {
        map.addLayer({
          id: layerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': style.fillColor || '#3b82f6',
            'fill-opacity': Number(layer.opacity ?? style.fillOpacity ?? 0.35),
            'fill-outline-color': style.strokeColor || '#93c5fd',
          },
        });
      } else if (layerType === 'line') {
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': style.color || '#60a5fa',
            'line-width': 2,
            'line-opacity': Number(layer.opacity ?? 0.9),
          },
        });
      } else {
        map.addLayer({
          id: layerId,
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-color': style.color || '#22c55e',
            'circle-radius': Number(style.radius || 6),
            'circle-stroke-width': 1,
            'circle-stroke-color': '#0f172a',
            'circle-opacity': Number(layer.opacity ?? 0.9),
          },
        });
      }
      attachClickHandler(map, layerId);
    }

    if (layerType === 'polygon') {
      map.setPaintProperty(layerId, 'fill-opacity', Number(layer.opacity ?? style.fillOpacity ?? 0.35));
    } else if (layerType === 'line') {
      map.setPaintProperty(layerId, 'line-opacity', Number(layer.opacity ?? 0.9));
    } else {
      map.setPaintProperty(layerId, 'circle-opacity', Number(layer.opacity ?? 0.9));
    }

    map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
  };

  const syncLayerFeatures = async (targetLayers) => {
    if (!mapLoaded || !mapRef.current) return;
    const bbox = getMapBoundsBbox();
    const activeLayers = targetLayers.filter((layer) => layer.visible);
    try {
      await Promise.all(activeLayers.map(async (layer) => {
        const response = await apiRequest(
          `/layers/${layer.layer_id}/features?bbox=${encodeURIComponent(bbox)}&limit=600`
        );
        if (!response.ok) {
          let errorMessage = `No fue posible cargar capa ${layer.name}`;
          try {
            const errorBody = await response.json();
            errorMessage = errorBody.error || errorMessage;
          } catch {
            // Response was not JSON (e.g. unexpected server error page); keep default message.
          }
          throw new Error(errorMessage);
        }
        const geojson = await response.json();
        renderLayerOnMap(layer, geojson);
      }));
    } catch (error) {
      setMessage(error.message || 'No se pudieron cargar las capas.');
    }
  };

  const loadLayerCatalog = async () => {
    setLoadingLayers(true);
    setMessage('');
    try {
      const response = await apiRequest('/layers');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible consultar el catálogo de capas.');
      const hydrated = (Array.isArray(data) ? data : []).map((layer) => ({
        ...layer,
        visible: Boolean(layer.is_visible_default),
        opacity: Number(layer.style_json?.fillOpacity || 0.85),
      }));
      setLayers(hydrated);
    } catch (error) {
      setLayers([]);
      setMessage(error.message || 'No se pudo cargar el catálogo de capas.');
    } finally {
      setLoadingLayers(false);
    }
  };

  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      // Free, no-API-key dark vector basemap (OpenFreeMap) matching the operations-console aesthetic.
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [-74.0721, 4.711],
      zoom: 11,
      attributionControl: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right'
    );

    map.on('load', () => {
      setMapLoaded(true);
    });

    map.on('moveend', () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        syncLayerFeatures(layers);
      }, 250);
    });

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (popupRef.current) popupRef.current.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadLayerCatalog();
  }, []);

  useEffect(() => {
    syncLayerFeatures(layers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, mapLoaded]);

  const handleToggleLayer = (layerId) => {
    setLayers((prev) => prev.map((layer) => (
      layer.layer_id === layerId ? { ...layer, visible: !layer.visible } : layer
    )));
  };

  const handleOpacityChange = (layerId, value) => {
    setLayers((prev) => prev.map((layer) => (
      layer.layer_id === layerId ? { ...layer, opacity: Number(value) } : layer
    )));
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    const map = mapRef.current;
    if (!map) return;

    const coordinateMatch = parseCoordinateSearch(searchText);
    if (coordinateMatch) {
      map.flyTo({ center: [coordinateMatch.lng, coordinateMatch.lat], zoom: 13 });
      return;
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(searchText)}`;
      const response = await fetch(url);
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        setMessage('No se encontró la ubicación indicada.');
        return;
      }
      const hit = data[0];
      map.flyTo({ center: [Number(hit.lon), Number(hit.lat)], zoom: 13 });
      setMessage('');
    } catch {
      setMessage('No fue posible ejecutar la búsqueda en este momento.');
    }
  };

  return (
    <section className="explorer-layout">
      <div className="explorer-sidebar">
        <h2>Explorador territorial</h2>
        <p>Capas activas: {visibleLayers.length}</p>
        <form onSubmit={handleSearch} className="entity-form">
          <div className="field-row">
            <label>Buscar dirección, lugar o "lat,lng"</label>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Ejemplo: Parque 93 Bogotá o 4.6763,-74.0489"
            />
          </div>
          <div className="form-actions">
            <button type="submit">Buscar</button>
            <button type="button" className="secondary" onClick={() => syncLayerFeatures(layers)}>Recargar capas</button>
          </div>
        </form>

        {loadingLayers ? (
          <p>Cargando catálogo de capas...</p>
        ) : (
          <div className="layer-list">
            {layers.map((layer) => (
              <article key={layer.layer_id} className="layer-item">
                <label className="layer-toggle">
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={() => handleToggleLayer(layer.layer_id)}
                  />
                  <span>{layer.name}</span>
                </label>
                <small>{layer.category}</small>
                <label>
                  Opacidad
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={layer.opacity}
                    onChange={(event) => handleOpacityChange(layer.layer_id, event.target.value)}
                  />
                </label>
              </article>
            ))}
          </div>
        )}
        {message && <p className="message">{message}</p>}
      </div>
      <div className="map-panel">
        <div ref={mapContainerRef} className="map-container" />
      </div>
    </section>
  );
}

export default TerritorialExplorer;
