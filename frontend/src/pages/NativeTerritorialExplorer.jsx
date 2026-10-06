import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';

const WORLD = { minLng: -180, maxLng: 180, minLat: -85, maxLat: 85 };

function NativeTerritorialExplorer({ operationalContext }) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [locations, setLocations] = useState([]);
  const [center, setCenter] = useState({ lng: -74.07, lat: 4.71 });
  const [zoom, setZoom] = useState(4);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiRequest('/locations')
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'No fue posible cargar ubicaciones.');
        setLocations((Array.isArray(data) ? data : []).filter((row) => row.latitude != null && row.longitude != null));
      })
      .catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (operationalContext?.city && locations.length) {
      const match = locations.find((row) => row.city === operationalContext.city);
      if (match) setCenter({ lng: Number(match.longitude), lat: Number(match.latitude) });
    }
  }, [operationalContext?.city, locations]);

  const view = useMemo(() => {
    const degreesPerPixel = 360 / (256 * (2 ** zoom));
    return { degreesPerPixel };
  }, [zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const width = rect.width;
      const height = rect.height;
      context.fillStyle = '#07110f';
      context.fillRect(0, 0, width, height);

      const project = (lng, lat) => ({
        x: width / 2 + (lng - center.lng) / view.degreesPerPixel,
        y: height / 2 - (lat - center.lat) / view.degreesPerPixel,
      });

      context.strokeStyle = 'rgba(92, 255, 194, 0.12)';
      context.lineWidth = 1;
      const grid = Math.max(0.01, 10 ** Math.floor(Math.log10(view.degreesPerPixel * 120)));
      for (let lng = Math.ceil((center.lng - width * view.degreesPerPixel / 2) / grid) * grid;
        lng <= center.lng + width * view.degreesPerPixel / 2; lng += grid) {
        const x = project(lng, center.lat).x;
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
      }
      for (let lat = Math.ceil((center.lat - height * view.degreesPerPixel / 2) / grid) * grid;
        lat <= center.lat + height * view.degreesPerPixel / 2; lat += grid) {
        const y = project(center.lng, lat).y;
        context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
      }

      locations.forEach((location) => {
        const p = project(Number(location.longitude), Number(location.latitude));
        if (p.x < -10 || p.x > width + 10 || p.y < -10 || p.y > height + 10) return;
        const active = selected?.location_id === location.location_id;
        context.beginPath();
        context.arc(p.x, p.y, active ? 8 : 5, 0, Math.PI * 2);
        context.fillStyle = active ? '#ffffff' : '#39f5ae';
        context.fill();
        context.strokeStyle = '#062d22';
        context.stroke();
      });

      context.fillStyle = 'rgba(4, 18, 15, 0.88)';
      context.fillRect(16, height - 42, 270, 26);
      context.fillStyle = '#b8d8ce';
      context.font = '12px system-ui';
      context.fillText(`${center.lat.toFixed(5)}, ${center.lng.toFixed(5)} · nivel ${zoom}`, 26, height - 24);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [center, locations, selected, view, zoom]);

  const pick = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hits = locations.map((location) => ({
      location,
      x: rect.width / 2 + (Number(location.longitude) - center.lng) / view.degreesPerPixel,
      y: rect.height / 2 - (Number(location.latitude) - center.lat) / view.degreesPerPixel,
    })).filter((item) => Math.hypot(item.x - x, item.y - y) <= 12);
    setSelected(hits[0]?.location || null);
  };

  const onPointerDown = (event) => {
    dragRef.current = { x: event.clientX, y: event.clientY, center };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setCenter({
      lng: Math.max(WORLD.minLng, Math.min(WORLD.maxLng, dragRef.current.center.lng - dx * view.degreesPerPixel)),
      lat: Math.max(WORLD.minLat, Math.min(WORLD.maxLat, dragRef.current.center.lat + dy * view.degreesPerPixel)),
    });
  };

  return (
    <section>
      <div className="score-row">
        <div>
          <p className="eyebrow">BACKSTAGE Native Spatial Engine</p>
          <h2>Explorador territorial nativo</h2>
        </div>
        <div className="form-actions">
          <button type="button" onClick={() => setZoom((value) => Math.min(20, value + 1))}>+</button>
          <button type="button" className="secondary" onClick={() => setZoom((value) => Math.max(1, value - 1))}>−</button>
        </div>
      </div>
      <p className="auth-hint">Renderizado Canvas propio, sin Leaflet, MapLibre ni proveedor cartográfico externo.</p>
      {message && <p className="message">{message}</p>}
      <div className="map-shell" style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          aria-label="Mapa territorial nativo"
          style={{ width: '100%', height: '620px', display: 'block', cursor: dragRef.current ? 'grabbing' : 'grab' }}
          onClick={pick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { dragRef.current = null; }}
          onWheel={(event) => {
            event.preventDefault();
            setZoom((value) => Math.max(1, Math.min(20, value + (event.deltaY < 0 ? 1 : -1))));
          }}
        />
        {selected && (
          <article className="card" style={{ position: 'absolute', top: 16, right: 16, width: 280 }}>
            <h3>{selected.name}</h3>
            <p>{selected.city || 'Sin municipio'} · {selected.type || 'Sin tipo'}</p>
            <p>{Number(selected.latitude).toFixed(6)}, {Number(selected.longitude).toFixed(6)}</p>
          </article>
        )}
      </div>
    </section>
  );
}

export default NativeTerritorialExplorer;
