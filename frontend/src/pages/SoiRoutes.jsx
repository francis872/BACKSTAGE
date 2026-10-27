import { useEffect, useMemo, useRef, useState } from 'react';
import { soiRequest, useSoiDraft } from '../lib/soi';
import { coordinatesOf } from '../lib/territory';
import { distanceM, routeProgress, validGps } from '../lib/soiNavigation.mjs';
import CleanComMap from '../components/CleanComMap';
import './SoiWorkspace.css';

const waypoint = () => ({ name: '', lng: '', lat: '' });
export default function SoiRoutes({ operationalContext, onNavigate, user }) {
  const [draft, setDraft] = useSoiDraft('route', { name: '', profile: 'driving', stops: [waypoint(), waypoint()], operation_id: '' });
  const [result, setResult] = useSoiDraft('route-result', null);
  const [choice, setChoice] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState({ index: 0, query: '', results: [] });
  const [policy, setPolicy] = useState(null);
  const [consent, setConsent] = useState(false);
  const [trip, setTrip] = useState(null);
  const [trips, setTrips] = useState([]);
  const [savedPlans, setSavedPlans] = useState([]);
  const [tracking, setTracking] = useState(false);
  const [position, setPosition] = useState(null);
  const [travelled, setTravelled] = useState(0);
  const [profile, setProfile] = useState(null);
  const watch = useRef(null), tripRef = useRef(null), last = useRef(null), sent = useRef(0), sending = useRef(false), pending = useRef(false), currentRoute = useRef(null);
  const mounted = useRef(true), gpsGeneration = useRef(0);
  tripRef.current = trip;
  const route = result?.routes?.[choice] || result?.routes?.[0];
  currentRoute.current = route;
  useEffect(()=>{
    if(route?.geometry?.type==='LineString'&&route.geometry.coordinates?.length)onNavigate?.('soi-routes',{plannedRoute:{geometry:route.geometry,distanceM:route.distanceM,durationS:route.durationS,source:route.source||result?.source||null,data_kind:'planned'}});
  },[route]);
  const canWrite = ['admin', 'analyst'].includes(user.role);
  const changed = (next) => { setDraft(next); setResult(null); setChoice(0); setProfile(null); };
  const update = (index, value) => changed({ ...draft, stops: draft.stops.map((stop, i) => i === index ? { ...stop, ...value } : stop) });
  const stopGps = () => { gpsGeneration.current += 1; if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current); watch.current = null; setTracking(false); };
  useEffect(() => {
    mounted.current = true;
    soiRequest('/trips/policy').then(setPolicy).catch((e) => setError(e.message));
    soiRequest('/trips').then((t) => setTrips(t.data)).catch((e) => setMessage(e.message));
    soiRequest('/geo/route-plans').then((p) => setSavedPlans(p.data)).catch(() => {});
    return () => {
      mounted.current = false; gpsGeneration.current += 1;
      if (watch.current !== null) {
        navigator.geolocation?.clearWatch(watch.current);
        if (tripRef.current) soiRequest(`/trips/${tripRef.current.trip_id}`, { state: 'INTERRUPTED' }, 'PATCH').catch(() => {});
      }
    };
  }, []);
  useEffect(() => {
    const selection = operationalContext?.soiRouteSelection;
    const pair = coordinatesOf(selection);
    const index = Number(selection?.stopIndex);
    if (pair && draft.selectionAt !== selection.selectedAt && Number.isInteger(index) && index >= 0 && index < draft.stops.length) changed({ ...draft, selectionAt: selection.selectedAt, stops: draft.stops.map((stop, i) => i === index ? { ...stop, lng: pair[0], lat: pair[1], name: selection.name || 'Punto en mapa' } : stop) });
  }, [operationalContext?.soiRouteSelection]);
  useEffect(() => {
    if (operationalContext?.soiOperationId) setDraft((old) => ({ ...old, operation_id: operationalContext.soiOperationId }));
  }, [operationalContext?.soiOperationId]);
  const execute = async (work) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); pending.current = false; }
  };
  const payload = () => {
    const coordinates = draft.stops.map((stop) => coordinatesOf(stop));
    if (coordinates.some((p) => !p)) throw new Error('Todas las paradas requieren longitud y latitud WGS84 válidas.');
    return { coordinates, profile: draft.profile, alternatives: true };
  };
  const calculate = async () => { const data = await soiRequest('/geo/routes', payload()); setResult(data); setChoice(0); setMessage('Ruta vial calculada. La duración no incluye tráfico en vivo.'); };
  const startGps = async (existing) => {
    if (!route) throw new Error('Calcula primero una ruta vial.');
    if (!navigator.geolocation) throw new Error('Este navegador no admite geolocalización.');
    if (!consent || !policy) throw new Error('Acepta el consentimiento y la política GPS.');
    const generation = ++gpsGeneration.current;
    const active = existing || trip;
    let value;
    if (active && !['COMPLETED', 'CANCELLED'].includes(active.state)) {
      value = active.state === 'ACTIVE' ? active : (await soiRequest(`/trips/${active.trip_id}`, { state: 'ACTIVE' }, 'PATCH')).data;
    } else value = (await soiRequest('/trips', { consent: true, retention_days: policy.retentionDays, operation_id: draft.operation_id || null })).data;
    if (!mounted.current || generation !== gpsGeneration.current) {
      soiRequest(`/trips/${value.trip_id}`, { state: 'INTERRUPTED' }, 'PATCH').catch(() => {});
      return;
    }
    setTrip(value); tripRef.current = value; last.current = null; sent.current = 0; setTracking(true);
    watch.current = navigator.geolocation.watchPosition((gps) => {
      if (!mounted.current || generation !== gpsGeneration.current) return;
      if (!validGps(gps) || gps.coords.accuracy > 100) { setMessage('Esperando una posición reciente con precisión de hasta 100 metros.'); return; }
      const point = [gps.coords.longitude, gps.coords.latitude];
      setPosition({ coordinates: point, accuracy: gps.coords.accuracy, timestamp: gps.timestamp });
      if (last.current) {
        const delta = distanceM(last.current.coordinates, point), seconds = (gps.timestamp - last.current.timestamp) / 1000;
        if (seconds > 0 && delta / seconds < 80) setTravelled((old) => old + delta);
      }
      last.current = { coordinates: point, timestamp: gps.timestamp };
      const progress = routeProgress(point, currentRoute.current?.geometry);
      if (progress?.offRouteM > Math.max(50, gps.coords.accuracy * 2)) setMessage('Desviación detectada. Puedes recalcular desde tu posición GPS.');
      if (Date.now() - sent.current < 10000 || sending.current) return;
      sending.current = true; sent.current = Date.now();
      soiRequest(`/trips/${value.trip_id}/points`, { points: [{ longitude: point[0], latitude: point[1], accuracy_m: gps.coords.accuracy, recorded_at: new Date(gps.timestamp).toISOString() }] })
        .catch((failure) => { if (!mounted.current || generation !== gpsGeneration.current) return; setError(failure.message); stopGps(); soiRequest(`/trips/${value.trip_id}`, { state: 'INTERRUPTED' }, 'PATCH').then((v) => { if (mounted.current) setTrip(v.data); }).catch(() => {}); })
        .finally(() => { sending.current = false; });
    }, (failure) => {
      if (!mounted.current || generation !== gpsGeneration.current) return;
      stopGps(); setError(failure.code === 1 ? 'El navegador no autorizó el GPS.' : 'La señal GPS no está disponible.');
      soiRequest(`/trips/${value.trip_id}`, { state: 'INTERRUPTED' }, 'PATCH').then((v) => setTrip(v.data)).catch(() => {});
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  };
  const changeTrip = (state) => execute(async () => { stopGps(); const data = await soiRequest(`/trips/${trip.trip_id}`, { state }, 'PATCH'); setTrip(data.data); setTrips((await soiRequest('/trips')).data); });
  const progress = position && route ? routeProgress(position.coordinates, route.geometry) : null;
  const nextStep = useMemo(() => {
    if (!position || !route?.steps) return null;
    return route.steps.find((step) => {
      const p = step.maneuver?.location;
      return p && (routeProgress(p, route.geometry)?.alongM ?? 0) > (progress?.alongM ?? 0) + 10;
    });
  }, [route, position]);
  const features = route ? [{ type: 'Feature', id: 'route', properties: { name: draft.name || 'Ruta vial' }, geometry: route.geometry }] : [];
  if (position) features.push({ type: 'Feature', id: 'gps', properties: { name: 'GPS autorizado' }, geometry: { type: 'Point', coordinates: position.coordinates } });
  const bounds = route?.geometry?.coordinates?.reduce((box, p) => [Math.min(box[0], p[0]), Math.min(box[1], p[1]), Math.max(box[2], p[0]), Math.max(box[3], p[1])], [180, 90, -180, -90]);
  const elevations = profile?.samples?.map((sample) => sample.elevationM) || [];
  const minElevation = Math.min(...elevations), maxElevation = Math.max(...elevations);
  const profilePoints = profile?.samples?.map((sample) => `${20 + sample.distanceM / (profile.distanceM || 1) * 560},${180 - (sample.elevationM - minElevation) / (maxElevation - minElevation || 1) * 150}`).join(' ');
  return <section className="soi-route"><h2>SOI Route Intelligence</h2><p>Selecciona el origen y las paradas en el mapa. Estas rutas son planificación; no hay un proveedor de GPS de vehículos conectado.</p>
    {error && <p role="alert" className="message">{error}</p>}{message && <p role="status">{message}</p>}
    <label>Nombre del recorrido<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
    <fieldset disabled={tracking || busy}><legend>Origen, paradas y destino</legend>{draft.stops.map((stop, index) => <div className="soi-waypoint" key={index}><strong>{index === 0 ? 'Origen' : index === draft.stops.length - 1 ? 'Destino' : `Parada ${index}`}</strong><span>{stop.name || 'Elige un lugar en el mapa'}</span><details><summary>Editar nombre o coordenadas</summary><label>Nombre<input value={stop.name} onChange={(e) => update(index, { name: e.target.value })} /></label><label>Longitud<input type="number" step="any" min="-180" max="180" value={stop.lng} onChange={(e) => update(index, { lng: e.target.value })} /></label><label>Latitud<input type="number" step="any" min="-90" max="90" value={stop.lat} onChange={(e) => update(index, { lat: e.target.value })} /></label></details><button onClick={() => onNavigate('territorial-explorer', { soiPicker: 'route', routeStopIndex: index, returnPage: 'soi-routes' })}>Elegir en mapa</button><button onClick={() => setSearch({ index, query: stop.name, results: [] })}>Buscar</button>{coordinatesOf(operationalContext?.territory) && <button onClick={() => { const p = coordinatesOf(operationalContext.territory); update(index, { name: operationalContext.territory.name, lng: p[0], lat: p[1] }); }}>Usar selección territorial</button>}{index > 0 && <button aria-label={`Subir parada ${index}`} onClick={() => { const stops = [...draft.stops]; [stops[index - 1], stops[index]] = [stops[index], stops[index - 1]]; changed({ ...draft, stops }); }}>↑</button>}{draft.stops.length > 2 && <button onClick={() => changed({ ...draft, stops: draft.stops.filter((_, i) => i !== index) })}>Quitar</button>}</div>)}<div className="form-actions"><button disabled={draft.stops.length >= 25} onClick={() => changed({ ...draft, stops: [...draft.stops.slice(0, -1), waypoint(), draft.stops.at(-1)] })}>Añadir parada</button><button onClick={() => changed({ ...draft, name: 'Miami – Los Ángeles', profile: 'driving', stops: [{ name: 'Miami', lng: -80.1918, lat: 25.7617 }, { name: 'Los Ángeles', lng: -118.2437, lat: 34.0522 }] })}>Cargar caso Miami–Los Ángeles</button></div><label>Transporte<select value={draft.profile} onChange={(e) => changed({ ...draft, profile: e.target.value })}><option value="driving">Carretera</option><option value="walking">A pie (requiere proveedor configurado)</option><option value="cycling">Bicicleta (requiere proveedor configurado)</option></select></label></fieldset>
    <form className="soi-waypoint" onSubmit={(e) => { e.preventDefault(); execute(async () => { const data = await soiRequest(`/geo/geocode?q=${encodeURIComponent(search.query)}`); setSearch({ ...search, results: data.results || [] }); }); }}><label>Buscar ubicación para parada {search.index + 1}<input required disabled={busy || tracking} value={search.query} onChange={(e) => setSearch({ ...search, query: e.target.value })} /></label><button disabled={busy || tracking}>Buscar dirección o lugar</button>{search.results.map((item, index) => <button key={item.id || index} type="button" disabled={tracking} onClick={() => { const p = coordinatesOf(item); if (!p) return; update(search.index, { name: item.displayName || item.name, lng: p[0], lat: p[1] }); setSearch({ ...search, results: [] }); }}>{item.displayName || item.name} · {item.precision?.type || 'precisión según fuente'}</button>)}</form>
    <div className="form-actions"><button disabled={busy || tracking} onClick={() => execute(calculate)}>Calcular ruta vial</button>{canWrite && route && <button disabled={busy || tracking || !draft.name.trim()} onClick={() => execute(async () => { const saved = await soiRequest('/geo/route-plans', { ...payload(), name: draft.name, operation_id: draft.operation_id || null, analysis_run_id: operationalContext?.analysis_run_id || null }); setMessage(`Planificación guardada: ${saved.data?.route_plan_id || saved.route_plan_id || ''}`); })}>Guardar planificación</button>}</div>
    <label>ID de operación a asociar (opcional)<input value={draft.operation_id} onChange={(e) => setDraft({ ...draft, operation_id: e.target.value })} /></label>
    <details><summary>Recorridos guardados de la organización</summary><button disabled={busy || tracking} onClick={() => execute(async () => setSavedPlans((await soiRequest('/geo/route-plans')).data))}>Consultar planificaciones</button>{!savedPlans.length && <p>No hay planificaciones consultadas. Pulsa Consultar para actualizar.</p>}{savedPlans.map((plan) => <p key={plan.route_plan_id}>#{plan.route_plan_id} · {plan.name} · {new Date(plan.created_at).toLocaleString('es-CO')}<button disabled={busy || tracking} onClick={() => execute(async () => { const saved = (await soiRequest(`/geo/route-plans/${plan.route_plan_id}`)).data; setDraft({ name: saved.name, profile: saved.profile, operation_id: saved.operation_id || '', stops: saved.coordinates.map((p, i) => ({ name: `Parada ${i + 1}`, lng: p[0], lat: p[1] })) }); setResult(saved.result); setChoice(0); setProfile(null); setMessage('Planificación histórica recuperada. Su fecha de cálculo se conserva; recalcula para una consulta nueva.'); })}>Abrir recorrido</button></p>)}</details>
    {route && <article className="card"><h3>Perfil topográfico del recorrido</h3><button disabled={busy} onClick={() => execute(async () => setProfile(await soiRequest('/geo/profile', { coordinates: route.geometry.coordinates.filter((_, index, points) => index % Math.max(1, Math.ceil(points.length / 9999)) === 0 || index === points.length - 1), samples: 50 })))}>Consultar perfil DEM real</button>{profile && <><p>{profile.source.name} · resolución {profile.precision.resolutionM} m · muestreo cada {(profile.precision.sampleSpacingM / 1000).toFixed(2)} km. Mínimo {minElevation.toFixed(0)} m, máximo {maxElevation.toFixed(0)} m.</p><svg role="img" aria-label="Perfil de elevación según distancia de la ruta" viewBox="0 0 600 210"><title>Elevación del DEM a lo largo de la ruta vial</title><path d="M20 20 V180 H580" fill="none" stroke="#8796b4" /><polyline points={profilePoints} fill="none" stroke="#82d6bd" strokeWidth="3" /><text x="20" y="205" fill="currentColor">0 km</text><text x="500" y="205" fill="currentColor">{(profile.distanceM / 1000).toFixed(1)} km</text></svg><p>Ascenso muestreado {profile.ascentM.toFixed(0)} m · descenso muestreado {profile.descentM.toFixed(0)} m. Los puntos intermedios pueden omitir relieve entre muestras.</p></>}</article>}
    {result && <><label>Alternativas<select disabled={tracking} value={choice} onChange={(e) => setChoice(Number(e.target.value))}>{result.routes.map((item, index) => <option key={index} value={index}>{index + 1}: {(item.distanceM / 1000).toFixed(1)} km · {(item.durationS / 3600).toFixed(1)} h</option>)}</select></label><p>{(route.distanceM / 1000).toFixed(1)} km · {(route.durationS / 3600).toFixed(1)} h estimadas · {route.source?.name}. Cálculo {route.source?.observedAt || result.source?.observedAt} · sin tráfico en vivo.</p><CleanComMap collection={{ type: 'FeatureCollection', features }} bounds={bounds} /><details><summary>Maniobras de la ruta</summary><ol>{route.steps?.map((step, i) => <li key={i}>{step.maneuver?.type} {step.maneuver?.modifier || ''} · {step.name || 'vía sin nombre'} · {Math.round(step.distanceM)} m</li>)}</ol></details></>}
    <details className="card personal-route-tracking"><summary>Recorridos personales con permiso del navegador</summary><h3>Navegación GPS personal</h3><p>El navegador solicita permiso de ubicación. El seguimiento se interrumpe al abandonar esta vista y puede detenerse si el navegador pasa a segundo plano. La aplicación conserva solo posiciones aceptadas por el servidor.</p>{policy && <label><input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); if (!e.target.checked && tracking) changeTrip('PAUSED'); }} />Autorizo registrar mi trayectoria y consultarla durante {policy.retentionDays} días, asociada a mi usuario y organización. Los registros vencidos dejan de estar disponibles y MongoDB los elimina mediante su política automática de retención.</label>}<p>Estado: {trip?.state || 'PLANNED'} · {tracking ? 'GPS activo' : 'GPS detenido'}</p>{position && <><p>GPS {position.coordinates.join(', ')} · precisión ±{position.accuracy.toFixed(0)} m · {new Date(position.timestamp).toLocaleTimeString('es-CO')}</p><p>Recorrido en esta sesión {(travelled / 1000).toFixed(2)} km · restante sobre geometría {progress ? (progress.remainingM / 1000).toFixed(2) : '—'} km · tiempo proporcional estimado {progress && route ? Math.round(route.durationS * progress.remainingM / (progress.totalM || 1) / 60) : '—'} min</p><p>Próxima maniobra: {nextStep ? `${nextStep.maneuver.type} ${nextStep.maneuver.modifier || ''} ${nextStep.name || ''}` : 'Sin próxima maniobra disponible'}</p></>}{canWrite && <div className="form-actions"><button disabled={tracking || busy || !consent || !route} onClick={() => execute(() => startGps())}>{trip && !['COMPLETED', 'CANCELLED'].includes(trip.state) ? 'Reanudar GPS' : 'Iniciar viaje con GPS'}</button>{trip && !['COMPLETED', 'CANCELLED'].includes(trip.state) && <><button disabled={!tracking || busy} onClick={() => changeTrip('PAUSED')}>Pausar</button><button disabled={busy} onClick={() => changeTrip('COMPLETED')}>Completar</button><button disabled={busy} onClick={() => changeTrip('CANCELLED')}>Cancelar viaje</button></>}{position && <button disabled={busy || tracking} onClick={() => execute(async () => { const body = payload(); body.coordinates[0] = position.coordinates; update(0, { lng: position.coordinates[0], lat: position.coordinates[1], name: 'GPS autorizado' }); setResult(await soiRequest('/geo/routes', body)); setChoice(0); })}>Recalcular desde GPS</button>}</div>}</details>
    <details><summary>Mis últimos viajes autorizados</summary><button disabled={busy} onClick={() => execute(async () => setTrips((await soiRequest('/trips')).data))}>Consultar historial</button>{trips.map((item) => <p key={item.trip_id}>#{item.trip_id} · {item.state} · {Number(item.distance_m).toFixed(0)} m · {new Date(item.started_at).toLocaleString('es-CO')} {canWrite && !tracking && !['COMPLETED', 'CANCELLED'].includes(item.state) && <button onClick={() => { setTrip(item); setMessage('Viaje seleccionado. Acepta el consentimiento y pulsa Reanudar GPS.'); }}>Recuperar viaje</button>}</p>)}{!trips.length && <p>No hay viajes disponibles en el periodo de retención.</p>}</details>
  </section>;
}
