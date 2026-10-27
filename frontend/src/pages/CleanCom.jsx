import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import CleanComMap from '../components/CleanComMap';
import './CleanCom.css';

const number = (value) => value == null ? 'Sin dato' : Number(value).toLocaleString('es-CO');
const statusLabel = { descriptive: 'Descripción disponible', unavailable: 'Sin datos suficientes', needs_validation: 'Requiere validación', not_evaluable: 'Aún no evaluable' };
async function read(path, signal) {
  const response = await apiRequest(path, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No pudimos consultar Clean Com · archivo histórico.');
  return data;
}

function Quality({ layer }) {
  if (!layer) return null;
  const geometry = layer.geometryQuality;
  return <div><h3>{layer.name}</h3><p>{number(layer.recordCount)} registros auditados. {layer.complete ? 'Lectura completa de la capa.' : 'Lectura incompleta.'}</p>
    {layer.periodHint && <p className="cleancom-notice">El nombre menciona {layer.periodHint.year}; esto no verifica el periodo de vigencia.</p>}
    {geometry ? <div className="cleancom-facts"><p>Geometrías vacías: <strong>{number(geometry.empty)}</strong></p><p>Nulas: <strong>{number(geometry.null)}</strong></p><p>Inválidas: <strong>{number(geometry.invalid)}</strong></p><p>Geometrías con WKB idéntico: <strong>{number(geometry.identicalWkbDuplicates)}</strong></p></div> : <p>Tabla sin geometría. Sus registros no se ubican directamente en el mapa.</p>}
    <p className="auth-hint">Geometrías idénticas pueden tener una explicación operativa; no se eliminan ni se consideran errores automáticamente.</p>
    <div className="cleancom-table-wrap"><table><caption>Campos y completitud de todos los registros de esta capa</caption><thead><tr><th>Campo</th><th>Tipo</th><th>Sin valor</th><th>Distintos</th><th>Rango / periodo</th></tr></thead><tbody>{layer.fields.map((field) => <tr key={field.name}><th scope="row">{field.name}</th><td>{field.dtype}</td><td>{number(field.missing)} ({number(field.missingPercent)} %)</td><td>{field.distinctExact ? '' : 'Al menos '}{number(field.distinct)}</td><td>{field.period ? `${field.period.start || 'Sin fecha'} → ${field.period.end || 'Sin fecha'}` : field.minimum == null ? 'No aplica' : `${number(field.minimum)} → ${number(field.maximum)}`}</td></tr>)}</tbody></table></div>
  </div>;
}

function Operations({ report }) {
  const summary = report.summary;
  if (summary.status !== 'available') return <p>No hay tablas suficientes para describir la operación.</p>;
  const ticketLayer = report.layers.find((layer) => layer.name === summary.sourceLayer);
  const date = ticketLayer?.fields.find((field) => field.name === report.case.fields.ticketDate)?.period;
  const max = Math.max(1, ...summary.months.map((month) => month.ticketRows));
  return <div><h3>Registros operativos de {summary.year}</h3><p>Fuente: {summary.sourceLayer}. Se filtra por la fecha de cada registro y se excluyen otros años.</p>
    <p className="cleancom-notice">El archivo contiene {number(summary.allTicketRows)} registros de tickets; {number(summary.ticketRowsInYear)} corresponden a {summary.year}. Periodo observado: {date?.start || 'Sin fecha'} a {date?.end || 'Sin fecha'}.</p>
    <div className="cleancom-stat-grid"><article className="card"><span>Registros en {summary.year}</span><strong>{number(summary.ticketRowsInYear)}</strong></article><article className="card"><span>Vehículos distintos con registros</span><strong>{number(summary.vehiclesWithTicketsInYear)}</strong></article><article className="card"><span>Códigos de ruta en tickets</span><strong>{number(summary.distinctTicketRouteCodesInYear)}</strong></article><article className="card"><span>Registros sin vínculo de ruta geométrica</span><strong>{number(summary.unmatchedTicketRows)}</strong></article></div>
    <p className="auth-hint">Los registros no equivalen a viajes únicos; los vehículos observados no equivalen a la flota disponible. El cruce de rutas conserva ceros iniciales y solo normaliza espacios y mayúsculas.</p>
    <h4>Tickets por mes</h4><ol className="cleancom-bars" aria-label="Recuento de registros de tickets por mes">{summary.months.map((month) => <li key={month.month}><span>{month.month}</span><div><i style={{ width: `${100 * month.ticketRows / max}%` }} /></div><strong>{number(month.ticketRows)}</strong></li>)}</ol><p className="auth-hint">Sin registros en el archivo no significa que no hubo actividad.</p>
    <h4>Rutas con más registros</h4><div className="cleancom-table-wrap"><table><thead><tr><th>Código</th><th>Tickets</th><th>Geometría disponible</th></tr></thead><tbody>{summary.topRoutes.map((row) => <tr key={row.code}><th scope="row">{row.code}</th><td>{number(row.ticketRows)}</td><td>{row.hasRouteGeometry ? 'Sí; vigencia por validar' : 'Sin vínculo'}</td></tr>)}</tbody></table></div>
    <p className="cleancom-notice">El campo «{summary.valueField.name}» tiene unidad y significado sin verificar. No se interpreta como peso, toneladas ni costo.</p>
    <details><summary>Distribución territorial y tipos de servicio</summary>{ticketLayer?.fields.filter((field) => [report.case.fields.territory, report.case.fields.serviceType, report.case.fields.serviceState].includes(field.name)).map((field) => <div key={field.name}><h4>{field.name} · todos los periodos del archivo</h4><ul>{field.topValues?.map((row) => <li key={row.value}>{row.value}: {number(row.count)} registros</li>)}</ul></div>)}</details>
  </div>;
}

export default function CleanCom({ organizationId, onNavigate }) {
  const [cases, setCases] = useState([]);
  const [caseId, setCaseId] = useState('');
  const [report, setReport] = useState(null);
  const [layerId, setLayerId] = useState('');
  const [tab, setTab] = useState('map');
  const [collection, setCollection] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(false);
  const [error, setError] = useState('');
  const [mapError, setMapError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setReport(null); setCollection(null); setSelected(null);
    read('/clean-com/cases', controller.signal).then((rows) => { if (!controller.signal.aborted) { setCases(rows); setCaseId(rows[0]?.id || ''); if (!rows.length) setLoading(false); } }).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); setLoading(false); } });
    return () => controller.abort();
  }, [organizationId, retry]);
  useEffect(() => {
    if (!caseId) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setReport(null); setCollection(null); setSelected(null);
    read(`/clean-com/cases/${encodeURIComponent(caseId)}/audit`, controller.signal).then((audit) => {
      if (controller.signal.aborted) return;
      setReport(audit); setLayerId(audit.layers.find((layer) => layer.name === audit.case.layers.routes)?.id || audit.layers[0]?.id || ''); setLoading(false);
    }).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); setLoading(false); } });
    return () => controller.abort();
  }, [caseId, retry]);
  const layer = report?.layers.find((item) => item.id === layerId);
  useEffect(() => {
    setCollection(null); setSelected(null); setMapError('');
    if (tab !== 'map' || !layer?.preview?.file) { setMapLoading(false); return; }
    const controller = new AbortController();
    setMapLoading(true);
    (async () => {
      const features = [];
      let offset = 0;
      while (offset !== null) {
        const page = await read(`/clean-com/cases/${encodeURIComponent(caseId)}/layers/${encodeURIComponent(layer.id)}/features?limit=200&offset=${offset}`, controller.signal);
        if (controller.signal.aborted) return;
        if (page.metadata.preview.sha256 !== layer.preview.sha256 || page.metadata.version !== report.source.sha256) throw Error('El caso cambió durante la consulta. Vuelve a cargar su auditoría.');
        features.push(...page.features);
        if (features.length > 2000 || page.metadata.nextOffset !== null && page.metadata.nextOffset <= offset) throw Error('La vista geográfica no pudo paginar sus datos.');
        offset = page.metadata.nextOffset;
      }
      if (!controller.signal.aborted) { setCollection({ type: 'FeatureCollection', features }); setMapLoading(false); }
    })().catch((failure) => { if (!controller.signal.aborted) { setMapError(failure.message); setMapLoading(false); } });
    return () => controller.abort();
  }, [caseId, layerId, report, retry, tab]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `clean-com-${caseId}-auditoria.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  const explore = () => {
    const bounds = selected.bbox;
    if (!bounds?.every(Number.isFinite)) return;
    const coordinates = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
    onNavigate?.('territorial-explorer', { territory: { id: `clean-com:${caseId}:${layerId}:${selected.id}`, name: selected.properties?.DENO_RUTA || selected.properties?.COD_RUTA || layer.name, type: 'clean_com_geometry', geometry: selected.geometry, coordinates, bbox: bounds, source: 'Clean Com · archivo histórico', provenance: { source: report.case.provider, version: report.source.sha256, dataMode: 'source_geometry_reprojected', transformation: layer.crs.transformation } } });
  };
  return <section className="cleancom" aria-labelledby="cleancom-title"><header><p className="eyebrow">Datos de referencia · DEMO / HISTORICAL</p><h2 id="cleancom-title">Clean Com · archivo histórico</h2><p>Estos casos heredados son datos de demostración o históricos. No representan operaciones actuales, clientes ni indicadores reales de SOI.</p></header>
    {error && <div role="alert" className="message"><p>{error}</p><button onClick={() => setRetry((value) => value + 1)}>Volver a consultar</button></div>}
    {loading && <p role="status">Cargando el caso y su auditoría…</p>}
    {!loading && !error && !cases.length && <p className="card">Todavía no hay casos disponibles en este espacio. Clean Com · archivo histórico admite estudios compartidos y casos privados de cada organización.</p>}
    {cases.length > 0 && <label className="cleancom-field">Caso de estudio<select aria-label="Caso de estudio" value={caseId} onChange={(event) => setCaseId(event.target.value)}>{cases.map((item) => <option key={item.id} value={item.id}>{item.title || item.id}</option>)}</select></label>}
    {report && <><div className="cleancom-source"><strong>{report.case.title}</strong><span>{report.case.access?.scope === 'shared_authenticated' ? 'Caso de referencia compartido · acceso con tu sesión de Backstage' : 'Caso privado de tu organización'}</span><span>{report.layers.length} capas y tablas · auditoría de todos los registros · datos de origen sin modificar</span><details><summary>Fuente y trazabilidad</summary><p>{report.source.name} · {number(report.source.bytes)} bytes · {report.source.files} archivos</p><p>Procesado: {new Date(report.createdAt).toLocaleString('es-CO')}. Esta fecha no indica actualización operativa de la fuente.</p><code>SHA-256: {report.source.sha256}</code><p>Licencia de redistribución: {report.case.license || 'No suministrada'}</p><button className="secondary" onClick={download}>Descargar auditoría</button></details></div>
      <div className="cleancom-tabs" role="group" aria-label="Vistas de Clean Com · archivo histórico">{[['map', 'Mapa'], ['quality', 'Calidad de datos'], ['operations', 'Datos operativos'], ['plan', 'Plan de análisis']].map(([id, label]) => <button key={id} aria-pressed={tab === id} className={tab === id ? '' : 'secondary'} onClick={() => setTab(id)}>{label}</button>)}</div>
      {['map', 'quality'].includes(tab) && <label className="cleancom-field">Capa o tabla<select aria-label="Capa o tabla" value={layerId} onChange={(event) => setLayerId(event.target.value)}>{report.layers.map((item) => <option key={item.id} value={item.id}>{item.name} · {number(item.recordCount)} registros{item.geometryType ? '' : ' · sin geometría'}</option>)}</select></label>}
      {tab === 'map' && <><h3>{layer?.name}</h3>{layer?.preview.file ? <><p>Vista limitada a {number(layer.preview.count)} geometrías de {number(layer.recordCount)} registros. Los recuentos de la auditoría no se calculan sobre esta muestra.</p><p className="auth-hint">Selección sistemática de registros, sin representatividad estadística. Las geometrías inválidas o vacías no se dibujan.</p>{layer.crs.transformation?.ballpark && <p className="cleancom-notice" role="status">Transformación aproximada del sistema de coordenadas local. Su precisión no está verificada; la vista no permite concluir diferencias métricas precisas.</p>}{layer.periodHint && <p className="auth-hint">El nombre de esta capa menciona {layer.periodHint.year}; su vigencia no está verificada.</p>}{mapLoading && <p role="status">Cargando geometrías de la fuente…</p>}{mapError && <p role="alert">{mapError}</p>}<CleanComMap collection={collection} bounds={layer.boundsWgs84} onSelect={setSelected} /><p className="auth-hint">Pulsa una geometría para ver sus atributos.</p>{selected && <article className="card"><h4>Elemento seleccionado</h4><dl>{Object.entries(selected.properties).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value ?? 'Sin dato'}</dd></div>)}</dl><button onClick={explore}>Abrir en Explorador territorial</button><button className="secondary" onClick={() => setSelected(null)}>Cerrar selección</button></article>}</> : <p className="card">Esta tabla no tiene geometría. Puedes revisar sus campos en «Calidad de datos» y sus recuentos en «Datos operativos».</p>}</>}
      {tab === 'quality' && <Quality layer={layer} />}
      {tab === 'operations' && <Operations report={report} />}
      {tab === 'plan' && <div className="cleancom-plan"><p>La versión actual audita y describe. Los análisis se habilitan cuando sus variables, unidades, vínculos y calidad estén verificados.</p>{report.capabilities.map((capability) => <article className="card" key={capability.id}><h3>{capability.label}</h3><strong>{statusLabel[capability.status]}</strong>{Array.isArray(capability.evidence) ? <ul>{capability.evidence.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{capability.evidence}</p>}</article>)}</div>}
    </>}
  </section>;
}
