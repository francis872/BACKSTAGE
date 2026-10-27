import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { coordinatesOf, territoryType } from '../lib/territory';
import { useLiveResource } from '../lib/useLiveResource';
import { sourceLabel } from '../lib/sourceLabel.mjs';
import './TerritoryLive.css';

export const formatTime = (value) => value ? new Date(value).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha disponible';
export const weatherName = (code) => code === 0 ? 'Despejado' : code <= 3 ? 'Nubosidad' : [45, 48].includes(code) ? 'Niebla' : code >= 95 ? 'Tormenta' : code >= 71 && code <= 86 ? 'Nieve o chubascos' : 'Precipitación';
export function WeatherSummary({ weather, error, loading }) {
  if (loading) return <span>Consultando meteorología…</span>;
  if (error || !weather || weather.status !== 'available') return <span>Meteorología no disponible en esta consulta.</span>;
  const value = (field) => weather.current?.[field] == null ? 'Sin dato' : `${weather.current[field]} ${weather.units?.[field] || ''}`;
  return <div className="weather-summary"><strong>{value('temperature_2m')} · {weather.current.weather_code == null ? 'Condición sin dato' : weatherName(weather.current.weather_code)}</strong>
    <span>Viento {value('wind_speed_10m')} · precipitación {value('precipitation')}</span>
    <details><summary>Fuente y hora del pronóstico</summary><small><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · estimación de modelo · válida {formatTime(weather.validAt)} · consultada {formatTime(weather.fetchedAt)}</small></details></div>;
}

export default function TerritoryLiveBar({ operationalContext, onSelect, onOpenProject, compact = false }) {
  const territory = operationalContext?.territory;
  const pair = coordinatesOf(territory);
  const weather = useLiveResource(pair ? `/spatial/weather?lat=${pair[1]}&lng=${pair[0]}` : null, 5 * 60000);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(false);
  const [internalIndex,setInternalIndex]=useState({assets:[],projects:[]});
  const [predictive,setPredictive]=useState(false);
  const [suggestions,setSuggestions]=useState([]);
  const watch = useRef(null);
  const active = useRef(null);
  const select = useRef(onSelect);
  const searchAbort = useRef(null);
  const locationAbort = useRef(null);
  const locationGeneration = useRef(0);
  const namedLocation = useRef(null);
  select.current = onSelect;
  useEffect(()=>{
    const controller=new AbortController();
    Promise.allSettled([apiRequest('/assets?limit=100',{signal:controller.signal}),apiRequest('/analysis?limit=100',{signal:controller.signal}),apiRequest('/geography/capabilities',{signal:controller.signal})]).then(async rows=>{
      const values=await Promise.all(rows.map(async row=>row.status==='fulfilled'&&row.value.ok?row.value.json():null));
      if(!controller.signal.aborted){setInternalIndex({assets:Array.isArray(values[0]?.data)?values[0].data:[],projects:Array.isArray(values[1])?values[1]:[]});setPredictive(values[2]?.autocomplete===true);}
    }).catch(()=>{});
    return()=>controller.abort();
  },[operationalContext?.organization_id]);
  useEffect(()=>{
    if(!compact||!predictive||busy||results.length||query.trim().length<3){setSuggestions([]);return;}
    const controller=new AbortController(),timer=setTimeout(()=>apiRequest(`/geography/autocomplete?q=${encodeURIComponent(query.trim())}`,{signal:controller.signal}).then(async r=>{const data=await r.json();if(r.ok&&!controller.signal.aborted)setSuggestions(Array.isArray(data.results)?data.results:[]);}).catch(()=>{}),600);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,compact,predictive,busy,results.length]);
  const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const internalMatches=compact&&query.trim().length>=2?[...internalIndex.projects.filter(p=>normalized(p.project_name).includes(normalized(query.trim()))).slice(0,4).map(project=>({kind:'project',project,name:project.project_name})),...internalIndex.assets.filter(a=>normalized(a.name).includes(normalized(query.trim()))).slice(0,4).map(asset=>({kind:'asset',asset,name:asset.name}))]:[];
  const stop = () => {
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    active.current = null;
    locationGeneration.current += 1;
    locationAbort.current?.abort();
    setFollowing(false);
  };
  useEffect(() => {
    if (territory?.source !== 'device') stop();
  }, [territory?.source, territory?.id]);
  useEffect(() => () => { if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current); searchAbort.current?.abort(); locationGeneration.current += 1; locationAbort.current?.abort(); }, []);
  const distance = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180));
  const nameLocation = async (item) => {
    const previous = namedLocation.current;
    // Resolver el municipio al comenzar o al desplazarse; nunca en cada muestra GPS.
    if (previous && (distance(previous, item) < 2000 || Date.now() - previous.time < 60000)) return;
    const generation = locationGeneration.current;
    locationAbort.current?.abort();
    const controller = new AbortController();
    locationAbort.current = controller;
    namedLocation.current = { lat: item.lat, lng: item.lng, time: Date.now(), place: null };
    try {
      const response = await apiRequest(`/spatial/reverse-geocode?lng=${item.lng}&lat=${item.lat}&zoom=10`, { signal: controller.signal });
      const place = await response.json();
      if (!response.ok || !place?.name) throw new Error('Nombre no disponible');
      if (generation !== locationGeneration.current || controller.signal.aborted) return;
      namedLocation.current.place = place;
      const latest = active.current?.item || item;
      if (distance(latest, item) >= 2000) return;
      const name = place.municipality || place.properties?.city || place.name;
      select.current?.({ ...latest, name, city: name, municipality: name, region: place.region, country: place.country, displayName: [...new Set([name, place.region, place.country].filter(Boolean))].join(', '), provenance: place.provenance });
      setMessage('Estás usando tu ubicación actual. Puedes buscar otro lugar cuando quieras.');
    } catch (error) {
      if (error.name !== 'AbortError' && generation === locationGeneration.current) setMessage('Ubicación encontrada. El nombre del lugar no está disponible ahora; puedes buscarlo por su nombre.');
    }
  };
  useEffect(() => {
    // Nombrar también la ubicación guardada por versiones anteriores.
    if (territory?.source === 'device' && !territory.city && pair) nameLocation({ ...territory, lat: pair[1], lng: pair[0] });
  }, [territory?.source, territory?.id]);
  const locate = () => {
    if (watch.current !== null) return stop();
    if (!navigator.geolocation) return setMessage('Este navegador no ofrece ubicación. Puedes buscar el lugar.');
    setMessage('Esperando permiso y ubicación del navegador…');
    active.current = null;
    namedLocation.current = null;
    locationGeneration.current += 1;
    setFollowing(true);
    watch.current = navigator.geolocation.watchPosition((position) => {
      if (document.hidden) return;
      const { latitude: lat, longitude: lng, accuracy } = position.coords;
      const prev = active.current;
      if (prev && (Date.now() - prev.time < 15000 || Math.hypot((lat - prev.lat) * 111320, (lng - prev.lng) * 111320 * Math.cos(lat * Math.PI / 180)) < 50)) return;
      active.current = { lat, lng, time: Date.now() };
      const place = namedLocation.current?.place;
      const name = place && distance(namedLocation.current, { lat, lng }) < 2000 ? place.municipality || place.properties?.city || place.name : null;
      const item = { id: 'device:position', type: 'device', name: name || 'Tu ubicación actual', displayName: name ? [...new Set([name, place.region, place.country].filter(Boolean))].join(', ') : 'Tu ubicación actual', city: name, region: name ? place.region : null, country: name ? place.country : null, lat, lng, coordinates: [lng, lat], geometry: { type: 'Point', coordinates: [lng, lat] }, source: 'device', accuracyM: accuracy, capturedAt: new Date(position.timestamp).toISOString() };
      active.current.item = item;
      select.current?.(item);
      setMessage(name ? 'Estás usando tu ubicación actual.' : 'Ubicación encontrada. Buscando el nombre del lugar…');
      nameLocation(item);
    }, (error) => {
      stop();
      setMessage(error.code === 1 ? 'No se concedió acceso a la ubicación. Puedes buscar cualquier lugar.' : 'No se pudo obtener la ubicación. Puedes buscar el territorio.');
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  };
  const search = async (event) => {
    event.preventDefault();
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setBusy(true); setMessage(''); setResults([]);
    try {
      const response = await apiRequest(`/spatial/geocode?${new URLSearchParams({ q: query.trim(), limit: '5' })}`, { signal: controller.signal });
      const rows = await response.json();
      if (!response.ok) throw new Error(response.status === 503 ? 'No pudimos consultar los lugares ahora. Vuelve a pulsar Buscar lugar en un momento.' : response.status === 429 ? 'La búsqueda ha recibido muchas consultas. Espera un momento y vuelve a intentarlo.' : rows.error || 'La búsqueda no está disponible.');
      setResults(Array.isArray(rows) ? rows : []);
      if (!rows.length) setMessage('No se encontraron lugares. Añade el país a la búsqueda.');
    } catch (error) { if (error.name !== 'AbortError') setMessage(error.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const selectPlace = item => {
    stop(); searchAbort.current?.abort(); setBusy(false);
    onSelect(item); setQuery(''); setResults([]); setSuggestions([]);
    setMessage(`${item.name || 'Lugar'} seleccionado. Ya puedes explorarlo o preparar un análisis.`);
  };
  const attribution = territory?.source_metadata?.attribution || (typeof territory?.source === 'object' ? territory.source?.attribution : null);
  return <section className={`territory-live-bar ${compact?'universal-search':''}`} aria-label="Buscar lugares y consultar su contexto">
    <div className="territory-live-heading"><div><p className="eyebrow">{compact?'Explorar':'Territorio activo'}</p><strong>{territory?.source === 'device' && !territory.city ? 'Ubicación de tu dispositivo' : territory?.displayName || territory?.name || 'Elige un territorio'}</strong>
      <small>{territory?.source === 'device' ? following ? 'Tu ubicación actual' : 'Última ubicación guardada del dispositivo' : 'Este lugar se usa en el mapa y en tus análisis.'}</small>
      {pair && <details className="location-details"><summary>Detalles de la ubicación</summary><small>{territoryType(territory.type)} · {pair[1].toFixed(4)}, {pair[0].toFixed(4)}{territory.capturedAt ? ` · ${formatTime(territory.capturedAt)}` : ''}{territory.accuracyM != null ? ` · precisión aproximada ${Math.round(territory.accuracyM)} m` : ''}</small></details>}</div>
      <button type="button" className="secondary" aria-pressed={following} onClick={locate}>{following ? 'Detener ubicación' : compact ? 'Mi ubicación' : 'Usar mi ubicación'}</button></div>
    <div className="territory-live-controls"><form onSubmit={search}><div className="place-query-field"><label htmlFor="live-place-query">¿Qué lugar quieres explorar?</label><input type="search" id="live-place-query" placeholder="Por ejemplo: Medellín, Colombia" value={query} minLength={2} maxLength={120} required onChange={(event) => setQuery(event.target.value)} /></div><button disabled={busy}>{busy ? 'Buscando…' : 'Buscar lugar'}</button></form>
      {pair && (compact?<details className="search-weather-context"><summary>Clima del lugar</summary><WeatherSummary weather={weather.data} loading={weather.loading} error={weather.error}/></details>:<WeatherSummary weather={weather.data} loading={weather.loading} error={weather.error} />)}</div>
    {(internalMatches.length>0||suggestions.length>0)&&<ul className="live-place-results" aria-label="Sugerencias de búsqueda">{internalMatches.map((item,index)=><li key={`${item.kind}:${index}`}><button type="button" className="secondary" onClick={()=>{stop();setQuery('');if(item.kind==='project')onOpenProject?.(item.project);else{const pair=coordinatesOf(item.asset);if(pair)onSelect({...item.asset,id:item.asset.asset_id,coordinates:pair,source:item.asset.source||'Registro de tu organización'});else setMessage('Este activo no tiene ubicación. Abre Activos para completarla.');}}}><strong>{item.name}</strong><small>{item.kind==='project'?'Proyecto de tu organización':'Activo de tu organización'}</small></button></li>)}{suggestions.map(item=><li key={item.id}><button type="button" className="secondary" onClick={()=>selectPlace(item)}><strong>{item.displayName||item.name}</strong><small>{territoryType(item.type)} · {sourceLabel(item.source)} · Confirma el lugar</small></button></li>)}</ul>}
    {results.length > 0 && <div><p>Elige el lugar que buscas:</p><ul className="live-place-results">{results.map((item) => <li key={item.id}><button type="button" className="secondary" onClick={() => selectPlace(item)}><strong>{item.name}</strong><small>{item.displayName || [item.region, item.country].filter(Boolean).join(', ')} · {territoryType(item.type)}</small></button></li>)}</ul></div>}
    {suggestions.length>0&&<small className="search-source-attribution">{[...new Set(suggestions.map(item=>item.source?.attribution).filter(value=>typeof value==='string'))].join(' · ')}</small>}
    {typeof attribution==='string'&&<details className="search-source-details"><summary>Fuente de la ubicación</summary><small>{sourceLabel(territory.source)} · {attribution}</small></details>}
    {message && <p className="auth-hint" role="status">{message}</p>}
  </section>;
}
