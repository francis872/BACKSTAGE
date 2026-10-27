import { lazy, Suspense, useRef, useState } from 'react';
import CapabilityBoundary from './CapabilityBoundary';
import HorizontalPropertyLayer from './HorizontalPropertyLayer';
import {economicOwner,scopedEconomicOverlay} from '../lib/economicOverlay.mjs';
const Map = lazy(() => import('../pages/NativeTerritorialExplorer'));
const tools = [['portfolio-projects','Proyectos'],['portfolio-assets','Activos'],['portfolio-comparator','Comparar'],['intelligence-evaluations','Analizar'],['soi','SOI'],['soi-routes','Planificar rutas'],['mission-control','Supervisar']];

export default function ExplorerWorkspace({ page, context, user, onNavigate, onCameraChange, panel }) {
  const cameraCallback = useRef(onCameraChange); cameraCallback.current = onCameraChange;
  const propertyOpen = page === 'territorial-explorer' && context?.property_layer_open === true;
  const [economicState,setEconomicState]=useState(null);
  const economicLayer=scopedEconomicOverlay(economicState,user,context?.property_entity_id,propertyOpen);
  const open = page !== 'territorial-explorer' || propertyOpen;
  const label = propertyOpen ? 'Propiedad Horizontal' : [...tools,['earthart','Contexto del lugar'],['clean-com','Referencia Clean Com'],['probability-engine','Simulación'],['reports','Resultados']].find(([key])=>key===page)?.[1] || 'Herramienta';
  return <section className={`unified-explorer ${open?'has-panel':''}`} aria-label="Explorador Territorial y herramientas">
    <div className="explorer-toolbar" role="toolbar" aria-label="Herramientas del territorio">{tools.slice(0,3).map(([key,label])=><button type="button" key={key} className={page===key?'active secondary':'secondary'} aria-pressed={page===key} onClick={()=>onNavigate(page===key?'territorial-explorer':key)}>{label}</button>)}
      <details><summary>Más herramientas</summary><div>{[...tools.slice(3),['earthart','Contexto y meteorología'],['probability-engine','Simular escenarios'],['reports','Resultados y exportaciones'],['intelligence-risks','Riesgos'],['intelligence-opportunities','Oportunidades'],['intelligence-recommendations','Decisiones'],['clean-com','Referencia histórica Clean Com']].map(([key,label])=><button type="button" key={key} onClick={event=>{event.currentTarget.closest('details').open=false;onNavigate(key);}}>{label}</button>)}</div></details>
    </div>
    {context?.analysis_run_id && <div className="explorer-project-context"><span>Proyecto de trabajo</span><strong>{context.project_name || `Proyecto #${context.analysis_run_id}`}</strong><button type="button" className="secondary" onClick={()=>onNavigate('portfolio-projects')}>Abrir trabajo</button></div>}
    <div className="explorer-stage">
      <div className="explorer-canvas"><CapabilityBoundary name="map" label="el mapa" resetKey={user.organization_id}>
        <Suspense fallback={<p role="status">Abriendo el mundo…</p>}><Map user={user} embedded economicOverlay={economicLayer} operationalContext={context} canManageSpatialData={['admin','analyst'].includes(user.role)} onNavigate={onNavigate} onCameraChange={value=>cameraCallback.current?.(value)} /></Suspense>
      </CapabilityBoundary></div>
      {open && <aside className="explorer-capability-panel" aria-label={`Herramienta: ${label}`}><header><strong>{label}</strong><button type="button" className="secondary" onClick={()=>onNavigate('territorial-explorer',{property_layer_open:false})} aria-label="Cerrar herramienta y volver al mapa">Cerrar</button></header><CapabilityBoundary name={page} label={label.toLowerCase()} resetKey={`${page}:${context?.analysis_run_id||''}`} onRecover={()=>onNavigate('territorial-explorer',{property_layer_open:false})}>{propertyOpen ? <HorizontalPropertyLayer key={user.organization_id} context={context} user={user} onNavigate={onNavigate} onEconomicLayer={data=>setEconomicState(data?{owner:economicOwner(user,context?.property_entity_id),data}:null)} /> : panel}</CapabilityBoundary></aside>}
    </div>
  </section>;
}
