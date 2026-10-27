import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { coordinatesOf } from '../lib/territory';
import { existingLocationCandidate } from '../lib/comparisonCandidates.mjs';
import { assetMapTarget } from '../lib/assetGeometry.mjs';
import { useLiveRefresh } from '../lib/useLiveResource';
import RealEstatePortfolio from './RealEstatePortfolio';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import LoadingState from '../components/ui/LoadingState';
const assetTypeLabels = {equipment:'Equipo',facility:'Instalación',network:'Red',vehicle:'Vehículo',land:'Terreno',building:'Edificación',other:'Otro',plant:'Planta'};

export default function AssetsWorkspace({ operationalContext, onNavigate, canManageAssets }) {
  const [view, setView] = useState('general');
  const [assets, setAssets] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageRole, setMessageRole] = useState('status');
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ name: '', type: 'equipment' });
  const requestVersion = useRef(0);
  const formTrigger = useRef(null);
  useEffect(()=>{if(showForm)document.getElementById('general-asset-name')?.focus({preventScroll:true});},[showForm]);
  const load = useCallback(async signal => {
    const version = ++requestVersion.current;
    setLoading(true); setLoadError('');
    try {
      const response = await apiRequest(`/assets?limit=50&offset=${offset}`, { signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo consultar el inventario.');
      if (!signal?.aborted && version === requestVersion.current) { setAssets(body.data); setPagination(body.pagination); }
    } catch (error) { if (error.name !== 'AbortError' && version === requestVersion.current) setLoadError(error.message); }
    finally { if (!signal?.aborted && version === requestVersion.current) setLoading(false); }
  }, [offset]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => { controller.abort(); requestVersion.current++; }; }, [load]);
  useLiveRefresh(() => load());
  const point = coordinatesOf(operationalContext?.territory);
  const save = async event => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setMessage(''); setMessageRole('status');
    try {
      const response = await apiRequest('/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        name: draft.name, type: draft.type,
        ...(point ? { longitude: point[0], latitude: point[1], city: operationalContext?.territory?.city || operationalContext?.city || null } : {}),
      }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'No se pudo registrar el activo.');
      setDraft({ name: '', type: 'equipment' }); setShowForm(false); setMessage('Activo registrado en el inventario general.'); await load();
    } catch (error) { setMessage(error.message); setMessageRole('alert'); }
    finally { setSaving(false); }
  };
  const analyzeAsset = asset => {
    onNavigate?.('portfolio-comparator', {
      ...operationalContext, analysis_run_id: null, project: null, project_name: `Análisis de ${asset.name}`,
      comparison_id: null, comparison_mode: 'configurable', asset_id: asset.asset_id, location_id: asset.location_id,
      selected_assets: [asset], territory: operationalContext?.territory || { ...asset, coordinates: coordinatesOf(asset) },
      candidates: [existingLocationCandidate(asset)], startComparison: true,
    });
  };
  const columns = [
    { key: 'name', header: 'Activo', rowHeader: true },
    { key: 'type', header: 'Tipo', render: asset => assetTypeLabels[asset.type] || asset.type || 'Sin clasificar' },
    { key: 'origin', header: 'Origen', render: asset => asset.origin === 'platform' ? 'General' : 'SOI' },
    { key: 'location', header: 'Ubicación', render: asset => asset.city || (assetMapTarget(asset) ? 'Ubicación en el mapa' : 'Sin ubicación') },
    { key: 'actions', header: 'Acciones', render: asset => <div className="form-actions">{coordinatesOf(asset) && <Button variant="secondary" size="sm" onClick={() => analyzeAsset(asset)}>Analizar activo</Button>}{assetMapTarget(asset) && <Button variant="secondary" size="sm" onClick={() => onNavigate?.('territorial-explorer', { asset_id: asset.asset_id, location_id: asset.location_id, territory: { ...asset, coordinates: coordinatesOf(asset) }, mapContext: { center: assetMapTarget(asset).center, bounds: assetMapTarget(asset).bounds, zoom: 12 } })}>Ver activo en mapa</Button>}</div> },
  ];
  return <section aria-label="Activos de BACKSTAGE">
    <h2>Activos</h2>
    <div className="form-actions" role="group" aria-label="Vistas del portafolio">
      <Button variant={view === 'general' ? 'primary' : 'secondary'} aria-pressed={view === 'general'} onClick={() => setView('general')}>Inventario general</Button>
      <Button variant={view === 'real-estate' ? 'primary' : 'secondary'} aria-pressed={view === 'real-estate'} onClick={() => setView('real-estate')}>Portafolio inmobiliario</Button>
    </div>
    {view === 'real-estate' ? <RealEstatePortfolio operationalContext={operationalContext} onNavigate={onNavigate} canManageAssets={canManageAssets} /> : <>
      <p>Un activo es un lugar o recurso de tu organización: por ejemplo, un equipo, un vehículo o una instalación. Aquí puedes consultar su información. Las funciones sanitarias se gestionan en SOI.</p>
      {canManageAssets && <Button ref={formTrigger} onClick={() => setShowForm(value => !value)} aria-expanded={showForm} aria-controls={showForm ? 'general-asset-form' : undefined}>Registrar activo general</Button>}
      {showForm && <Card as="section" header={<h3>Registrar activo general</h3>}>
        <form id="general-asset-form" onSubmit={save} aria-label="Registrar activo general" aria-busy={saving || undefined}>
          <Input id="general-asset-name" label="Nombre" helperText="Usa un nombre fácil de reconocer, como Bodega del centro o Vehículo 12." value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required maxLength={200} disabled={saving} />
          <Input as="select" label="Tipo" value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value })} disabled={saving}><option value="equipment">Equipo</option><option value="facility">Instalación</option><option value="network">Red</option><option value="vehicle">Vehículo</option><option value="land">Terreno</option><option value="building">Edificación</option><option value="other">Otro</option></Input>
          <p>{point ? `Ubicación del territorio seleccionado: ${point[1]}, ${point[0]}.` : 'Puedes guardarlo sin ubicación. Para incluirla, busca y selecciona un lugar en la parte superior antes de guardar.'}</p>
          <Button type="submit" loading={saving}>{saving ? 'Guardando…' : 'Guardar activo general'}</Button>
          <Button variant="secondary" disabled={saving} onClick={()=>{setShowForm(false);requestAnimationFrame(()=>formTrigger.current?.focus());}}>Cerrar formulario</Button>
        </form>
      </Card>}
      {loading && <LoadingState>Consultando activos…</LoadingState>}
      {loadError && <EmptyState tone="error" title="No se pudo consultar el inventario" description={loadError}><Button variant="secondary" onClick={() => load()}>Volver a consultar inventario</Button></EmptyState>}
      {(assets.length > 0 || !loading && !loadError) && <DataTable caption="Inventario de la organización" rows={assets} rowKey="asset_id" columns={columns} loading={loading} emptyTitle="No hay activos en esta página del inventario." emptyDescription="Los activos registrados aparecerán aquí con su origen identificado." />}
      <div className="form-actions" role="group" aria-label="Paginación del inventario">
        <Button variant="secondary" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - 50))}>Anterior</Button>
        <span role="status" aria-live="polite">{pagination ? `${offset + (assets.length ? 1 : 0)}–${offset + assets.length} de ${pagination.total}` : ''}</span>
        <Button variant="secondary" disabled={pagination?.next == null || loading} onClick={() => setOffset(pagination.next)}>Siguiente</Button>
      </div>
    </>}
    {message && <p role={messageRole} className="message">{message}</p>}
  </section>;
}
