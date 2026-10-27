import { useLiveResource } from '../lib/useLiveResource';
import { belongsToTerritory, coordinatesOf } from '../lib/territory';
import { formatTime, WeatherSummary } from './TerritoryLiveBar';

export default function LiveTerritoryOverview({ territory, operationalContext, onNavigate }) {
  const pair = coordinatesOf(territory);
  const live = useLiveResource(pair ? `/spatial/live-context?lat=${pair[1]}&lng=${pair[0]}&radiusM=1200` : null, 5 * 60000);
  const assets = useLiveResource('/assets?limit=500');
  const projects = useLiveResource('/analysis?limit=50');
  const rows = (resource) => (Array.isArray(resource.data?.data) ? resource.data.data : Array.isArray(resource.data) ? resource.data : []).filter((row) => belongsToTerritory(row, territory));
  const map = live.data?.cartography;
  const available = map?.status === 'available';
  const counts = map?.counts;
  const context = { territory, longitude: pair?.[0], latitude: pair?.[1], intent_type: operationalContext?.intent_type };
  const open = (page, extra = {}) => onNavigate?.(page, { ...context, ...extra });
  return <section className="form-section" aria-label="Evidencia territorial actual">
    <div className="score-row"><div><p className="eyebrow">Territorio activo · consulta actual</p><h3>{territory.displayName || territory.name}</h3><p className="auth-hint">Cartografía consultada cada 5 minutos; activos y proyectos cada 30 segundos mientras esta vista está abierta.</p></div><button type="button" onClick={() => open('territorial-explorer')}>Ver en mapa</button></div>
    {live.error && <p role="status" className="message">{live.error} {live.data && 'La última consulta permanece visible con su fecha.'}</p>}
    <div className="live-evidence-grid">
      <article className="card"><p className="eyebrow">Meteorología actual</p><WeatherSummary weather={live.data?.weather} loading={live.loading} error={!live.data && live.error} />
        {live.data?.weather?.daily?.time?.map((day, index) => <p key={day}>{day} · {live.data.weather.daily.temperature_2m_min?.[index] ?? '—'} / {live.data.weather.daily.temperature_2m_max?.[index] ?? '—'} °C · {live.data.weather.daily.precipitation_sum?.[index] ?? '—'} mm</p>)}</article>
      <article className="card"><p className="eyebrow">Movilidad cartografiada</p><p>{available ? `${counts.transport} puntos de transporte en la muestra de 1,2 km.` : live.loading ? 'Consultando cartografía…' : 'Fuente cartográfica no disponible.'}</p><small>Paradas y estaciones registradas en OSM. Sin tráfico en vivo ni cobertura completa de rutas.</small><button className="secondary" onClick={() => open('territorial-explorer', { activeTool: 'route' })}>Explorar rutas</button></article>
      <article className="card"><p className="eyebrow">Infraestructura cercana</p><p>{available ? `${counts.health} lugares de salud · ${counts.education} educativos · ${counts.mappedPlaces} lugares en la muestra.` : 'Sin muestra cartográfica disponible.'}</p><small>{map?.limited ? 'Muestra limitada a 250 elementos.' : 'Inventario público parcial; un conteo cero no demuestra ausencia de infraestructura.'}</small><button className="secondary" onClick={() => open('territorial-explorer')}>Ver lugares en mapa</button></article>
      <article className="card"><p className="eyebrow">Ambiente y terreno</p><p>{available ? `${counts.parks} espacios verdes o recreativos cartografiados en la muestra.` : 'Parques sin consulta disponible.'}</p><p>{live.data?.weather?.elevationM != null ? `Elevación de la celda meteorológica: ${live.data.weather.elevationM} m.` : 'Elevación del modelo no disponible.'}</p><small>Elevación de modelo puntual. No constituye un DEM verificado ni una evaluación de riesgo.</small></article>
      <article className="card"><p className="eyebrow">Activos asociados</p><p>{assets.loading ? 'Consultando…' : assets.error ? 'No se pudo consultar el portafolio.' : `${rows(assets).length} activos coinciden con el territorio en el inventario consultado.`}</p><button className="secondary" onClick={() => open('portfolio-assets')}>Abrir portafolio</button></article>
      <article className="card"><p className="eyebrow">Proyectos asociados</p><p>{projects.loading ? 'Consultando…' : projects.error ? 'No se pudo consultar los proyectos.' : `${rows(projects).length} proyectos coinciden entre los últimos 50 consultados.`}</p><button className="secondary" onClick={() => open('portfolio-projects')}>Ver proyectos</button></article>
      <article className="card"><p className="eyebrow">Población, riesgo y oportunidades</p><p>Requieren fuentes demográficas, evaluaciones y evidencia financiera verificadas para este territorio.</p><small>Los datos meteorológicos y cartográficos no sustituyen una evaluación territorial o de inversión.</small><button className="secondary" onClick={() => open('intelligence-opportunities')}>Consultar oportunidades registradas</button></article>
      <article className="card"><p className="eyebrow">Fuentes y vigencia</p><p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap · ODbL</a></p>
        {map?.source?.dataMode === 'vector_tile_snapshot' && <p><a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a><small>Versión cartográfica: {map.source.version}. Es una publicación del conjunto cartográfico, no una medición instantánea.</small></p>}
        <small>Cartografía consultada {formatTime(map?.fetchedAt)}{map?.sourceUpdatedAt ? ` · base actualizada ${formatTime(map.sourceUpdatedAt)}` : ''}</small><p><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo · CC BY 4.0</a></p><small>Modelo meteorológico consultado {formatTime(live.data?.weather?.fetchedAt)}</small><button type="button" className="secondary" disabled={live.loading} onClick={live.refresh}>Volver a consultar</button></article>
    </div>
  </section>;
}
