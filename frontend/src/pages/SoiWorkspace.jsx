import { useCallback, useEffect, useRef, useState } from 'react';
import { soiRequest, useSoiDraft } from '../lib/soi';
import { coordinatesOf } from '../lib/territory';
import CleanCom from './CleanCom';
import CleanComMap from '../components/CleanComMap';
import SoiFleet from '../components/SoiFleet';
import BsiePanel from '../components/BsiePanel';
import SanitaryWorkspace from '../components/SanitaryWorkspace';
import './SoiWorkspace.css';

const labels = { assets: 'Activos', operations: 'Operaciones', fleet: 'Flota', incidents: 'Incidencias', crews: 'Cuadrillas', service_orders: 'Órdenes de servicio', imports: 'Importar', trips: 'Viajes' };
const sanitaryLabels={waste:'Residuos',monitoring:'Monitoreo ambiental',water:'Agua y saneamiento',carbon:'Carbono y emisiones',optimization:'Optimización logística',predictive:'Analítica predictiva',reporting:'Informes sanitarios',integrations:'Integraciones de solo lectura',climate:'Clima operacional'};
const metricLabels = { inventory_assets: 'Activos en inventario', operational_assets: 'Activos de procedencia operativa', active_operations: 'Operaciones activas', vehicles: 'Vehículos declarados', open_incidents: 'Incidencias abiertas', imports: 'Importaciones', comparisons: 'Comparaciones' };
const initialAsset = { name: '', type: 'other', latitude: '', longitude: '', address: '', city: '', country: '', region: '', external_id: '' };
export default function SoiWorkspace({ user, operationalContext, onNavigate, compact = false, initialTab = 'operations', returnPage = 'soi' }) {
  const [tab, setTab] = useState(initialTab);
  const [catalog, setCatalog] = useState(null);
  const [configuration, setConfiguration] = useState(null);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editingAssetId, setEditingAssetId] = useState(null);
  const [operationAssets, setOperationAssets] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(null);
  const [asset, setAsset] = useSoiDraft('asset', initialAsset);
  const [operation, setOperation] = useSoiDraft('operation', { name: '', operation_type: '', status: 'planned', vehicle_id: '' });
  const [vehicle, setVehicle] = useSoiDraft('vehicle', { name: '', plate: '', capacity: '', status: 'available' });
  const [incident, setIncident] = useSoiDraft('incident', { title: '', description: '', severity: 'medium', operation_id: '', vehicle_id: '' });
  const [crew, setCrew] = useSoiDraft('crew', { name: '', member_user_ids: '', status: 'available' });
  const [order, setOrder] = useSoiDraft('service-order', { name: '', description: '', crew_id: '', operation_id: '', route_plan_id: '', asset_ids: '', due_at: '' });
  const [assignedCrewId, setAssignedCrewId] = useState('');
  const [incidentReason,setIncidentReason]=useState('');
  const [incidentAssignee,setIncidentAssignee]=useState('');
  const [upload, setUpload] = useSoiDraft('import', { format: 'csv', content: '', source: { name: '' }, asset_type: 'other' });
  const [preview, setPreview] = useState(null);
  const pending = useRef(false);
  const loadVersion = useRef(0);
  const canWrite = ['admin', 'analyst'].includes(user.role);
  const load = useCallback(async (signal) => {
    const version = ++loadVersion.current;
    setError(''); setSelected(null);
    try {
      const [cat, config, metrics] = await Promise.all([
        soiRequest('/catalog', undefined, 'GET', signal), soiRequest('/configuration', undefined, 'GET', signal),
        soiRequest('/summary', undefined, 'GET', signal),
      ]);
      setCatalog(cat.data); setConfiguration(config.data); setSummary(metrics.data);
      const rows = ['assets', 'operations', 'fleet', 'incidents', 'crews', 'service_orders'].includes(tab) && config.data.capabilities.includes(tab)
        ? await soiRequest(`/${tab === 'fleet' ? 'vehicles' : tab === 'service_orders' ? 'service-orders' : tab}?limit=100`, undefined, 'GET', signal) : { data: [] };
      if (signal?.aborted || version !== loadVersion.current) return;
      setCatalog(cat.data); setConfiguration(config.data); setRecords(rows.data); setSummary(metrics.data); setUpdated(new Date().toISOString());
    } catch (failure) { if (!signal?.aborted) { setError(failure.message); setRecords([]); setSummary(null); } }
  }, [tab]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    if (!compact) return;
    const timer = setInterval(() => { if (!document.hidden && !pending.current) load(); }, 30000);
    return () => clearInterval(timer);
  }, [compact, load]);
  useEffect(() => {
    if (!operationalContext?.soiAssetSelection || asset.selectionAt === operationalContext.soiAssetSelection.selectedAt) return;
    const pair = coordinatesOf(operationalContext.soiAssetSelection);
    if (pair) { setAsset((old) => ({ ...old, longitude: pair[0], latitude: pair[1], selectionAt: operationalContext.soiAssetSelection.selectedAt })); setTab('assets'); }
  }, [operationalContext?.soiAssetSelection]);
  useEffect(() => {
    const selected = operationalContext?.assetDraft;
    if (!selected) return;
    const token = JSON.stringify(selected);
    if (asset.assetContextKey === token) return;
    setAsset((old) => ({ ...old, ...selected, assetContextKey: token })); setTab('assets');
  }, [operationalContext?.assetDraft]);
  const run = async (action, refresh = true) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice('Operación completada.'); if (refresh) await load(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); pending.current = false; }
  };
  const form = (draft, setter, fields, submit, title) => <form className="entity-form soi-form" onSubmit={(event) => { event.preventDefault(); run(submit); }}><h3>{title}</h3>{fields.map(([key, label, options, optional]) => <label key={key}>{label}{options ? <select value={draft[key]} onChange={(e) => setter({ ...draft, [key]: e.target.value })}>{options.map((value) => <option key={value} value={value}>{value}</option>)}</select> : <input required={!optional} value={draft[key] ?? ''} maxLength={key === 'description' ? 4000 : 200} onChange={(e) => setter({ ...draft, [key]: e.target.value })} />}</label>)}<button disabled={busy}>Guardar</button></form>;
  const geometry = (row) => row.geometry || row.metadata?.geometry || (coordinatesOf(row) ? { type: 'Point', coordinates: coordinatesOf(row) } : null);
  const collection = { type: 'FeatureCollection', features: records.map((row, index) => ({ type: 'Feature', id: index, geometry: geometry(row), properties: { name: row.name || row.title, recordIndex: index } })).filter((feature) => feature.geometry) };
  const geometryPairs = (value) => Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' ? [value] : Array.isArray(value) ? value.flatMap(geometryPairs) : [];
  const pairs = collection.features.flatMap((f) => geometryPairs(f.geometry.coordinates));
  const bounds = pairs.length ? pairs.reduce((box, p) => [Math.min(box[0], p[0]), Math.min(box[1], p[1]), Math.max(box[2], p[0]), Math.max(box[3], p[1])], [180, 90, -180, -90]) : undefined;
  const selectedRow = selected == null ? null : records[selected];
  return <section className="soi-workspace"><header className="score-row"><div><p className="eyebrow">Operaciones de Inteligencia Sanitaria</p><h2>{compact ? 'Operación SOI' : 'SOI'}</h2><p>{user.organization_name} · {updated ? `Consulta ${new Date(updated).toLocaleString('es-CO')}` : 'Sin consulta disponible'}</p></div><button disabled={busy} onClick={() => load()}>Actualizar</button></header>
    {compact && <p>Consulta periódica cada 30 segundos mientras esta vista está abierta.</p>}
    {summary && <div className="soi-metrics">{Object.entries(summary).filter(([, value]) => typeof value === 'number' || /^\d+$/.test(String(value))).map(([key, value]) => <article className="card" key={key}><strong>{value}</strong><span>{metricLabels[key] || key.replaceAll('_', ' ')}</span></article>)}</div>}
    <nav className="form-actions" aria-label="Módulos SOI">{Object.entries(labels).filter(([key]) => key !== 'trips' && (!configuration || configuration.capabilities.includes(key))).map(([key, label]) => <button className={tab === key ? '' : 'secondary'} key={key} onClick={() => setTab(key)}>{label}</button>)}<button className={tab === 'configuration' ? '' : 'secondary'} onClick={() => setTab('configuration')}>Configuración</button><button className={tab === 'historical' ? '' : 'secondary'} onClick={() => setTab('historical')}>Casos históricos / demostración</button><button onClick={() => onNavigate('soi-routes')}>Route Intelligence</button><button onClick={() => setTab('bsie')}>Estadística espacial</button></nav>
    {error && <p role="alert" className="message">{error}</p>}{notice && <p role="status">{notice}</p>}
    {configuration?.capabilities.some(capability=>Object.hasOwn(sanitaryLabels,capability))&&<div className="form-actions"><button className={tab==='sanitary'?'':'secondary'} onClick={()=>setTab('sanitary')}>Centro sanitario</button></div>}
    {tab==='sanitary'&&<SanitaryWorkspace user={user} onNavigate={onNavigate} operationalContext={operationalContext}/>}
    {selectedRow&&tab==='incidents'&&canWrite&&selectedRow.status!=='resolved'&&<article className="card"><h3>Atención de incidencia</h3><p>Etapa: {selectedRow.workflow_state||'registered'}</p><label>Responsable al asignar (ID de usuario de la organización)<input value={incidentAssignee} onChange={e=>setIncidentAssignee(e.target.value)}/></label><label>Actuación / evidencia de verificación<textarea value={incidentReason} minLength={8} maxLength={2000} onChange={e=>setIncidentReason(e.target.value)}/></label><button disabled={busy||incidentReason.trim().length<8} onClick={()=>run(()=>soiRequest(`/incidents/${selectedRow.incident_id}`,{workflow_state:{registered:'triaged',triaged:'assigned',assigned:'in_progress',in_progress:'verified',verified:'closed'}[selectedRow.workflow_state||'registered'],reason:incidentReason,...(selectedRow.workflow_state==='triaged'?{assigned_user_id:Number(incidentAssignee)}:{})},'PATCH'))}>Avanzar atención con trazabilidad</button></article>}
    {tab === 'crews' && canWrite && form(crew,setCrew,[['name','Nombre de la cuadrilla'],['member_user_ids','IDs de usuarios de la organización, separados por comas',null,true],['status','Disponibilidad',['available','assigned','inactive']]],async()=>{
      await soiRequest('/crews',{ ...crew,member_user_ids:crew.member_user_ids.trim()?crew.member_user_ids.split(',').map((id)=>Number(id.trim())):[] }); setCrew({ name:'',member_user_ids:'',status:'available' });
    },'Registrar cuadrilla')}
    {tab === 'service_orders' && canWrite && form(order,setOrder,[['name','Nombre de la orden'],['description','Descripción',null,true],['crew_id','ID cuadrilla',null,true],['operation_id','ID operación',null,true],['asset_ids','IDs de activos separados por comas',null,true],['route_plan_id','ID planificación vial',null,true],['due_at','Vencimiento ISO 8601 (opcional)',null,true]],async()=>{
      await soiRequest('/service-orders',{ ...order,status:'planned',crew_id:order.crew_id||null,operation_id:order.operation_id||null,route_plan_id:order.route_plan_id||null,due_at:order.due_at||null,asset_ids:order.asset_ids.trim()?order.asset_ids.split(',').map((id)=>Number(id.trim())):[] }); setOrder({ ...order,name:'',description:'' });
    },'Crear orden de servicio')}
    {selectedRow && tab === 'service_orders' && canWrite && <article className="card"><h3>Gestionar orden #{selectedRow.service_order_id}</h3><label>ID cuadrilla<input value={assignedCrewId} onChange={(e)=>setAssignedCrewId(e.target.value)} /></label><div className="form-actions"><button disabled={busy||!assignedCrewId} onClick={()=>run(()=>soiRequest(`/service-orders/${selectedRow.service_order_id}`,{crew_id:Number(assignedCrewId)},'PATCH'))}>Asignar cuadrilla</button>{['planned','assigned','in_progress'].includes(selectedRow.status)&&<button disabled={busy} onClick={()=>run(()=>soiRequest(`/service-orders/${selectedRow.service_order_id}`,{status:{planned:'assigned',assigned:'in_progress',in_progress:'completed'}[selectedRow.status]},'PATCH'))}>Avanzar estado</button>}{!['completed','cancelled'].includes(selectedRow.status)&&<button disabled={busy} onClick={()=>run(()=>soiRequest(`/service-orders/${selectedRow.service_order_id}`,{status:'cancelled'},'PATCH'))}>Cancelar orden</button>}<button onClick={()=>onNavigate('soi-routes',{soiOperationId:selectedRow.operation_id})}>Planificar recorrido</button></div></article>}
    {tab === 'fleet' && configuration?.capabilities.includes('fleet') && <SoiFleet user={user} onNavigate={onNavigate} />}
    {summary && <p className="auth-hint">El inventario incluye registros con procedencia desconocida. Los conteos operacionales excluyen demostraciones, simulaciones, históricos y registros sin procedencia identificada.</p>}
    {selectedRow && tab === 'operations' && <article className="card"><h3>Activos de la operación #{selectedRow.operation_id}</h3><label>IDs de activos separados por comas<input value={operationAssets} onChange={(e) => setOperationAssets(e.target.value)} disabled={!canWrite} /></label><div className="form-actions"><button disabled={busy} onClick={() => run(async () => { const data = await soiRequest(`/operations/${selectedRow.operation_id}/assets`); setOperationAssets(data.data.asset_ids.join(', ')); }, false)}>Consultar activos asignados</button>{canWrite && <button disabled={busy} onClick={() => run(() => soiRequest(`/operations/${selectedRow.operation_id}/assets`, { asset_ids: operationAssets.trim() ? operationAssets.split(',').map((v) => Number(v.trim())) : [] }, 'PUT'))}>Guardar asignación</button>}<button onClick={() => onNavigate('soi-routes', { soiOperationId: selectedRow.operation_id })}>Planificar ruta de esta operación</button></div></article>}
    {tab === 'bsie' && <BsiePanel user={user} />}
    {tab === 'historical' && <CleanCom organizationId={user.organization_id} onNavigate={onNavigate} />}
    {tab === 'configuration' && configuration && <form className="soi-form" onSubmit={(e) => { e.preventDefault(); run(() => soiRequest('/configuration', configuration, 'PUT')); }}><h3>Sector y capacidades</h3><label>Sector<input list="soi-sectors" disabled={user.role !== 'admin'} value={configuration.sector} minLength={2} maxLength={80} onChange={(e) => setConfiguration({ ...configuration, sector: e.target.value })} /><datalist id="soi-sectors">{catalog.sectors.map((sector) => <option key={sector} value={sector} />)}</datalist><small>Elige uno o escribe un identificador propio.</small></label>{catalog.capabilities.map((capability) => <label key={capability}><input type="checkbox" disabled={user.role !== 'admin'} checked={configuration.capabilities.includes(capability)} onChange={(e) => setConfiguration({ ...configuration, capabilities: e.target.checked ? [...configuration.capabilities, capability] : configuration.capabilities.filter((c) => c !== capability) })} />{sanitaryLabels[capability] || labels[capability] || capability}</label>)}{user.role === 'admin' && <button disabled={busy}>Guardar configuración</button>}</form>}
    {tab === 'assets' && canWrite && <>{form(asset, setAsset, [['name', 'Nombre'], ['type', 'Categoría', catalog?.assetTypes || ['other']], ['longitude', 'Longitud WGS84', null, Boolean(asset.geometry)], ['latitude', 'Latitud WGS84', null, Boolean(asset.geometry)], ['address', 'Dirección', null, true], ['city', 'Municipio', null, true], ['region', 'Región', null, true], ['country', 'País (vacío = desconocido)', null, true], ['external_id', 'Identificador externo', null, true]], async () => { await soiRequest(editingAssetId ? '/assets/' + editingAssetId : '/assets', { ...asset, geometry: asset.longitude !== '' && asset.latitude !== '' ? { type: 'Point', coordinates: [Number(asset.longitude), Number(asset.latitude)] } : asset.geometry, source: { name: 'Registro manual de la organización' } }, editingAssetId ? 'PATCH' : 'POST'); setAsset(initialAsset); setEditingAssetId(null); }, editingAssetId ? 'Editar activo #' + editingAssetId : 'Registrar activo')}<div className="form-actions"><button onClick={() => onNavigate('territorial-explorer', { soiPicker: 'asset', returnPage })}>Elegir ubicación en el mapa</button>{coordinatesOf(operationalContext?.territory) && <button className="secondary" onClick={() => { const p = coordinatesOf(operationalContext.territory); setAsset({ ...asset, longitude: p[0], latitude: p[1] }); }}>Usar ubicación territorial seleccionada</button>}</div></>}
    {tab === 'operations' && canWrite && form(operation, setOperation, [['name', 'Nombre'], ['operation_type', 'Tipo de servicio'], ['status', 'Estado', ['planned', 'active', 'completed', 'cancelled']], ['vehicle_id', 'ID vehículo (opcional)', null, true]], async () => { await soiRequest('/operations', { ...operation, vehicle_id: operation.vehicle_id || null }); setOperation({ ...operation, name: '' }); }, 'Crear operación')}
    {tab === 'fleet' && canWrite && form(vehicle, setVehicle, [['name', 'Nombre'], ['plate', 'Matrícula'], ['capacity', 'Capacidad declarada'], ['status', 'Estado', ['available', 'maintenance', 'inactive']]], async () => { await soiRequest('/vehicles', vehicle); setVehicle({ ...vehicle, name: '', plate: '' }); }, 'Registrar vehículo')}
    {tab === 'incidents' && canWrite && form(incident, setIncident, [['title', 'Título'], ['description', 'Descripción', null, true], ['longitude', 'Longitud WGS84 (opcional)', null, true], ['latitude', 'Latitud WGS84 (opcional)', null, true], ['severity', 'Severidad', ['low', 'medium', 'high', 'critical']], ['operation_id', 'ID operación', null, true], ['vehicle_id', 'ID vehículo', null, true]], async () => { await soiRequest('/incidents', { ...incident, operation_id: incident.operation_id || null, vehicle_id: incident.vehicle_id || null }); setIncident({ ...incident, title: '' }); }, 'Reportar incidencia')}
    {tab === 'imports' && canWrite && <div className="soi-form"><h3>Importación controlada de activos</h3><p>CSV con encabezados name,type,longitude,latitude,external_id o GeoJSON FeatureCollection. Máximo 2 MB. Ningún registro se guarda durante la previsualización.</p><label>Formato<select value={upload.format} onChange={(e) => { setUpload({ ...upload, format: e.target.value }); setPreview(null); }}><option value="csv">CSV</option><option value="geojson">GeoJSON</option></select></label><label>Fuente<input value={upload.source.name} onChange={(e) => { setUpload({ ...upload, source: { name: e.target.value } }); setPreview(null); }} /></label><label>Archivo<input type="file" accept=".csv,.json,.geojson" onChange={async (e) => { const file = e.target.files[0]; if (!file) return; if (file.size > 2000000) return setError('El archivo supera 2 MB.'); setUpload({ ...upload, content: await file.text() }); setPreview(null); }} /></label><label>Contenido<textarea rows={6} value={typeof upload.content === 'string' ? upload.content : JSON.stringify(upload.content)} onChange={(e) => { setUpload({ ...upload, content: e.target.value }); setPreview(null); }} /></label><button disabled={busy} onClick={() => run(async () => setPreview((await soiRequest('/imports/preview', { ...upload, content: upload.format === 'geojson' ? JSON.parse(upload.content) : upload.content })).data))}>Validar y previsualizar</button>{preview && <><pre>{JSON.stringify(preview, null, 2)}</pre><button disabled={busy || preview.errors?.length > 0 || preview.valid === false} onClick={() => run(async () => { await soiRequest('/imports/commit', { ...upload, content: upload.format === 'geojson' ? JSON.parse(upload.content) : upload.content, preview_hash: preview.preview_hash }); setPreview(null); })}>Confirmar importación</button></>}</div>}
    {['assets', 'operations', 'fleet', 'incidents', 'crews', 'service_orders'].includes(tab) && <><p>Hasta 100 registros de la organización activa. Selecciona uno para consultar sus detalles.</p>{!records.length && !error && <p>No hay registros en esta consulta. {canWrite ? 'Utiliza el formulario para incorporar información de tu organización.' : 'Solicita registros al administrador.'}</p>}<div className="soi-records">{records.map((row, index) => <button className="secondary" key={row.location_id || row.operation_id || row.vehicle_id || row.incident_id || row.crew_id || row.service_order_id || index} onClick={() => setSelected(index)}>{row.name || row.title} · {row.status || row.type}<small>{row.metadata?.provenance?.data_type || row.metadata?.data_type || row.provenance?.data_type || 'UNKNOWN'}</small></button>)}</div>{collection.features.length > 0 && <CleanComMap collection={collection} bounds={bounds} onSelect={(feature) => setSelected(feature.properties.recordIndex)} />}</>}
    {selectedRow && <article className="card"><h3>{selectedRow.name || selectedRow.title}</h3><pre>{JSON.stringify(selectedRow, null, 2)}</pre><div className="form-actions">{coordinatesOf(selectedRow) && <><button onClick={() => onNavigate('soi-routes', { territory: { ...selectedRow, coordinates: coordinatesOf(selectedRow), name: selectedRow.name, type: 'asset' } })}>Planificar recorrido</button><button onClick={() => onNavigate('earthart', { returnPage: 'soi', territory: { ...selectedRow, coordinates: coordinatesOf(selectedRow), type: 'asset' } })}>Consultar meteorología</button></>}{canWrite && tab === 'assets' && <><button onClick={() => { setEditingAssetId(selectedRow.location_id); setAsset({ ...initialAsset, ...selectedRow, longitude: selectedRow.longitude ?? '', latitude: selectedRow.latitude ?? '' }); setSelected(null); }}>Editar activo</button><button disabled={busy} onClick={() => run(() => soiRequest('/assets/' + selectedRow.location_id, { archived: !selectedRow.metadata?.archived }, 'PATCH'))}>{selectedRow.metadata?.archived ? 'Restaurar activo' : 'Archivar activo'}</button></>}{canWrite && tab === 'operations' && ['planned', 'active'].includes(selectedRow.status) && <button disabled={busy} onClick={() => run(() => soiRequest(`/operations/${selectedRow.operation_id}`, { status: selectedRow.status === 'planned' ? 'active' : 'completed' }, 'PATCH'))}>{selectedRow.status === 'planned' ? 'Activar operación' : 'Completar operación'}</button>}<button className="secondary" onClick={() => setSelected(null)}>Cerrar detalles</button></div></article>}
  </section>;
}
