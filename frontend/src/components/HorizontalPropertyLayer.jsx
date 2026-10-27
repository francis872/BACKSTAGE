import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { assetGeometry } from '../lib/assetGeometry.mjs';
import { PROPERTY_LAYER_PATH as base, propertyMapContext } from '../lib/horizontalProperty.mjs';
import { useLiveRefresh } from '../lib/useLiveResource';
import Button from './ui/Button';
import Input from './ui/Input';
import Card from './ui/Card';
import PropertyOperationsPanel from './PropertyOperationsPanel';
import PropertySpatialAnalysisPanel from './PropertySpatialAnalysisPanel';
import EconomicIntelligencePanel from './EconomicIntelligencePanel';
import NormativeIntelligencePanel from './NormativeIntelligencePanel';
import CommunityKnowledgePanel from './CommunityKnowledgePanel';

export default function HorizontalPropertyLayer({ context, user, onNavigate, onEconomicLayer }) {
  const id = context?.property_entity_id || null;
  const [catalog, setCatalog] = useState(null), [detail, setDetail] = useState(null), [rows, setRows] = useState([]);
  const [page, setPage] = useState(null), [offset, setOffset] = useState(0), [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [form, setForm] = useState(null), [draft, setDraft] = useState({}), [busy, setBusy] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const mounted = useRef(true), sending = useRef(false), key = useRef(null), inputRef = useRef(null), triggerRef = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setOffset(0); setForm(null); setDetail(null); setNotice(''); setOperationsOpen(false); }, [id]);
  useEffect(()=>{if(!['admin','analyst'].includes(user.role))setForm(null);},[user.role]);
  useEffect(() => { if (form === 'create' || form === 'edit') inputRef.current?.focus(); }, [form]);
  useLiveRefresh(() => { if (!sending.current && !form && !operationsOpen) setVersion(n => n + 1); });
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    const read = async suffix => { const r = await apiRequest(base + suffix, { signal: controller.signal }); const b = await r.json(); if (!r.ok) throw Error(b.error || 'No se pudo consultar la copropiedad.'); return b; };
    Promise.all([read('/catalog'), read(`?parent_id=${id || 'null'}&limit=50&offset=${offset}`), id ? read(`/${id}`) : null]).then(([c, children, selected]) => {
      if (!controller.signal.aborted) { setCatalog(c); setRows(children.data); setPage(children.pagination); setDetail(selected); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, offset, version]);
  const navigate = next => { if (!sending.current) onNavigate('territorial-explorer', { property_layer_open: true, property_entity_id: next }); };
  const selected = detail?.data, canWrite = ['admin', 'analyst'].includes(user.role) && !selected?.archived;
  const kinds = Object.entries(catalog?.kinds || {}).filter(([kind, spec]) => selected ? spec.parents.includes(selected.kind) : kind === 'coproperty');
  const open = mode => {
    key.current = crypto.randomUUID(); setNotice(''); setForm(mode);
    setDraft({ name: mode === 'edit' ? selected.name : '', kind: kinds[0]?.[0] || 'coproperty', coefficient_pct: mode === 'edit' ? selected.coefficient_pct ?? '' : '', source_name: mode === 'edit' ? selected.provenance?.source?.name || '' : '', use_geometry: false, revision: selected?.revision });
  };
  const close = () => { setForm(null); requestAnimationFrame(() => triggerRef.current?.focus()); };
  const save = async event => {
    event.preventDefault(); if (sending.current) return; sending.current = true; setBusy(true); setNotice('');
    try {
      const body = form === 'archive' ? { revision: selected.revision } : { name: draft.name, source_name: draft.source_name,
        ...(form === 'create' ? { kind: draft.kind, parent_id: id } : { revision: draft.revision }),
        ...((form === 'create' ? draft.kind : selected.kind) === 'private_unit' ? { coefficient_pct: draft.coefficient_pct || null } : {}),
        ...(draft.use_geometry ? { geometry: assetGeometry(context?.territory || {}) , crs: 'EPSG:4326' } : {}) };
      const url = form === 'create' ? base : `${base}/${id}${form === 'archive' ? '/archive' : ''}`;
      const response = await apiRequest(url, { method: form === 'edit' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key.current }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw Error(result.error || 'No se pudo guardar.');
      if (!mounted.current) return;
      setForm(null); setNotice(form === 'archive' ? 'Registro archivado. Su evidencia se conserva.' : 'Información guardada en tu organización.');
      if (form === 'create') onNavigate('territorial-explorer', { property_layer_open: true, property_entity_id: result.data.location_id });
      else if (form === 'archive') onNavigate('territorial-explorer', { property_layer_open: true, property_entity_id: selected.parent_id });
      setVersion(n => n + 1);
    } catch (e) { if (mounted.current) setNotice(e.message); }
    finally { sending.current = false; if (mounted.current) setBusy(false); }
  };
  const geometry = assetGeometry(context?.territory || {}), mapContext = propertyMapContext(detail);
  return <section aria-label="Capa Propiedad Horizontal" aria-busy={loading || busy || undefined}>
    <h2>Propiedad Horizontal</h2>
    <p>Organiza tu copropiedad y los lugares que contiene. Los registros pertenecen a tu organización.</p>
    <nav aria-label="Ubicación en la copropiedad" className="form-actions">
      <Button variant="secondary" disabled={busy} onClick={() => navigate(null)}>Todas las copropiedades</Button>
      {detail?.ancestors.map(parent => <Button variant="secondary" key={parent.location_id} disabled={busy} onClick={() => navigate(parent.location_id)}>{parent.name}</Button>)}
    </nav>
    {loading && <p role="status">Consultando copropiedades…</p>}
    {error && <div role="alert"><p>{error}</p><Button onClick={() => setVersion(n => n + 1)}>Volver a consultar</Button></div>}
    {!loading && !error && <>
      {selected && <Card header={<h3>{selected.name}</h3>}>
        <p>{catalog?.kinds[selected.kind]?.label}{selected.archived ? ' · Archivado' : ''}</p>
        <p>{detail.spatial_reference.mode === 'own_geometry' ? 'Tiene ubicación propia aportada.' : detail.spatial_reference.mode === 'linked_ancestor' ? `Sin geometría propia. Vinculado a la ubicación de ${detail.spatial_reference.name}.` : 'Sin ubicación. Puedes conservar este registro sin inventar coordenadas.'}</p>
        {mapContext && <Button variant="secondary" disabled={busy} onClick={() => onNavigate('territorial-explorer', mapContext)}>{detail.spatial_reference.mode === 'linked_ancestor' ? 'Ver ubicación del contenedor' : 'Ver ubicación en mapa'}</Button>}
        {selected.kind === 'private_unit' && <p>Coeficiente: {selected.coefficient_pct == null ? 'Sin registrar' : `${selected.coefficient_pct}%`}</p>}
        <p>Coeficientes registrados en la copropiedad: {detail.allocation.total_pct ?? 'Sin dato'}%. Es una suma de datos aportados, pendiente de revisión del reglamento.</p>
        {detail.allocation.unassigned_private_units > 0 && <p>{detail.allocation.unassigned_private_units} unidades privadas sin coeficiente registrado.</p>}
        <p>Fuente: {selected.provenance?.source?.name || 'Sin fuente'} · Información aportada, sin verificación independiente.</p>
        {canWrite && <Button variant="secondary" disabled={busy} onClick={() => open('edit')}>Editar datos</Button>}
        {user.role === 'admin' && !selected.archived && <Button variant="secondary" disabled={busy} onClick={() => open('archive')}>Archivar registro</Button>}
      </Card>}
      {selected && !selected.archived && <details key={selected.location_id} onToggle={event=>setOperationsOpen(event.currentTarget.open)}><summary>Operaciones e historial de este objeto</summary><PropertyOperationsPanel key={`${selected.location_id}:${user.role}`} locationId={selected.location_id} user={user}/><PropertySpatialAnalysisPanel key={`analysis:${selected.location_id}:${user.role}`} locationId={selected.location_id} user={user}/><EconomicIntelligencePanel key={`economics:${selected.location_id}:${user.role}`} locationId={selected.location_id} user={user} onLayer={onEconomicLayer}/><CommunityKnowledgePanel locationId={selected.location_id} user={user}/>{selected.kind==='coproperty'&&<NormativeIntelligencePanel key={`normative:${user.user_id}:${user.organization_id}:${selected.location_id}:${user.role}`} locationId={selected.location_id} user={user}/>}</details>}
      <h3>{selected ? 'Elementos que contiene' : 'Tus copropiedades'}</h3>
      {!rows.length && <p>{selected ? 'Todavía no hay elementos registrados dentro de este lugar.' : 'Aún no has registrado una copropiedad. Empieza por su nombre y la fuente de sus datos.'}</p>}
      <ul>{rows.map(row => <li key={row.location_id}><Button variant="secondary" disabled={busy} onClick={() => navigate(row.location_id)}>{row.name} · {catalog?.kinds[row.kind]?.label}</Button></li>)}</ul>
      {page && page.total > 50 && <div className="form-actions"><Button variant="secondary" disabled={!offset || busy} onClick={() => setOffset(n => Math.max(0, n - 50))}>Anterior</Button><span>{offset + 1}–{offset + rows.length} de {page.total}</span><Button variant="secondary" disabled={page.next == null || busy} onClick={() => setOffset(page.next)}>Siguiente</Button></div>}
      {canWrite && kinds.length > 0 && !form && <Button ref={triggerRef} onClick={() => open('create')}>{selected ? 'Agregar elemento aquí' : 'Registrar copropiedad'}</Button>}
      {form && <Card header={<h3>{form === 'archive' ? 'Archivar conservando la evidencia' : form === 'edit' ? 'Editar información' : selected ? `Agregar dentro de ${selected.name}` : 'Registrar copropiedad'}</h3>}>
        <form onSubmit={save} aria-label={form === 'archive' ? 'Confirmar archivo de registro' : 'Guardar entidad de copropiedad'}>
          {form === 'archive' ? <p>Se ocultará de la capa y de los listados activos. Archiva primero los elementos que contiene. Esta acción no borra su historial.</p> : <>
            <Input ref={inputRef} label="Nombre" helperText="Por ejemplo: Conjunto Los Olivos, Torre A o Apartamento 201." value={draft.name} maxLength={200} required disabled={busy} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            {form === 'create' && <Input as="select" label="Qué vas a registrar" value={draft.kind} disabled={busy} onChange={e => setDraft({ ...draft, kind: e.target.value, coefficient_pct: '' })}>{kinds.map(([kind, spec]) => <option value={kind} key={kind}>{spec.label}</option>)}</Input>}
            {(form === 'create' ? draft.kind : selected?.kind) === 'private_unit' && <Input label="Coeficiente (%)" type="number" min="0" max="100" step="0.0001" helperText="Dato opcional aportado por tu organización; hasta cuatro decimales." value={draft.coefficient_pct} disabled={busy} onChange={e => setDraft({ ...draft, coefficient_pct: e.target.value })} />}
            <Input label="Fuente de la información" helperText="Indica de dónde provienen estos datos, por ejemplo: inventario entregado por la administración." maxLength={300} value={draft.source_name} required disabled={busy} onChange={e => setDraft({ ...draft, source_name: e.target.value })} />
            {geometry && <label><input type="checkbox" checked={draft.use_geometry} disabled={busy} onChange={e => setDraft({ ...draft, use_geometry: e.target.checked })} />Usar la geometría del lugar seleccionado en el mapa</label>}
            <p>{form === 'edit' ? 'La ubicación actual se conserva si no eliges otra geometría.' : selected ? 'Sin geometría propia, quedará vinculado lógicamente a este contenedor.' : 'Puedes registrarla sin ubicación y añadir una geometría después.'}</p>
          </>}
          <div className="form-actions"><Button type="submit" loading={busy}>{form === 'archive' ? 'Confirmar archivo' : 'Guardar'}</Button><Button variant="secondary" disabled={busy} onClick={close}>Cancelar</Button></div>
        </form>
      </Card>}
    </>}
    {notice && <p role="status" aria-live="polite">{notice}</p>}
  </section>;
}
