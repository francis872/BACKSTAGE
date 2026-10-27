import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useLiveResource } from '../lib/useLiveResource';
import Input from './ui/Input';
import Button from './ui/Button';
const stages = { probability_pending: 'Probabilidad', risk_review_pending: 'Revisión de riesgos', recommendation_review_pending: 'Revisión de recomendación', default: 'Otras etapas pendientes' };
const sources = { ORGANIZATION_PROVIDED: 'Aportada por la organización', IMPORTED: 'Importada', EXTERNAL_API: 'API externa' };
const status = { fresh:'Vigente', stale:'Vencida', timestamp_missing:'Falta fecha de observación', timestamp_in_future:'Fecha futura inválida', exception_recorded:'Excepción vigente registrada', simulated:'Simulación identificada', historical_snapshot:'Registro histórico identificado', healthy:'Sin incidentes abiertos', incident_open:'Incidente abierto', monitor_stale:'Monitor sin actualizaciones recientes', not_configured:'Monitor pendiente de configuración' };
async function call(path, method='GET', body) {
  const response=await apiRequest(path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const value=await response.json();if(!response.ok)throw Error(value.error||'No se pudo completar la operación.');return value;
}
export default function BusinessRulesPanel() {
  const [policy,setPolicy]=useState(null),[values,setValues]=useState(null),[projects,setProjects]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[review,setReview]=useState(null);
  const [source,setSource]=useState({project_id:'',reference:'',category:'ORGANIZATION_PROVIDED',observed_at:'',reason:'',exception_hours:1});
  const monitor=useLiveResource('/operations/monitor',30000);
  const load=async()=>{const p=await call('/operations/business-rules');setPolicy(p);setValues({sla_hours:{...p.rules.sla_hours},source_max_age_hours:{...p.rules.source_max_age_hours},exception_max_hours:p.rules.exception_max_hours});};
  useEffect(()=>{let alive=true;Promise.all([call('/operations/business-rules'),call('/analysis?limit=100')]).then(([p,rows])=>{if(!alive)return;setPolicy(p);setValues({sla_hours:{...p.rules.sla_hours},source_max_age_hours:{...p.rules.source_max_age_hours},exception_max_hours:p.rules.exception_max_hours});setProjects(Array.isArray(rows)?rows:[]);}).catch(e=>alive&&setMessage(e.message));return()=>{alive=false;};},[]);
  const act=async work=>{if(busy)return;setBusy(true);setMessage('');try{await work();}catch(e){setMessage(e.message);}finally{setBusy(false);}};
  const save=event=>{event.preventDefault();act(async()=>{const p=await call('/operations/business-rules','PUT',{...values,revision:policy.revision});setPolicy(p);setMessage(`Reglas guardadas y auditadas. Revisión ${p.revision}.`);});};
  const reviewSource=async()=>{const result=await call('/operations/business-rules/review','POST',{project_id:Number(source.project_id),sources:[{reference:source.reference,category:source.category,observed_at:source.observed_at?new Date(source.observed_at).toISOString():null}]});setReview(result);};
  const exception=()=>act(async()=>{await call('/operations/business-rules/exceptions','POST',{project_id:Number(source.project_id),rule:'source_freshness',source_reference:source.reference,reason:source.reason,expires_at:new Date(Date.now()+Number(source.exception_hours)*3600000).toISOString(),policy_revision:policy.revision,policy_sha256:policy.sha256});await reviewSource();setMessage('Excepción de vigencia registrada con responsable, motivo y vencimiento.');});
  return <section aria-label="Reglas comerciales y monitoreo">
    <h3>Alertas del administrador</h3>
    <p>Responsable: administrador vigente de la organización. Comprobaciones de staging cada cinco minutos mientras este equipo y la sesión de Windows estén activos.</p>
    {monitor.error&&<p role="alert">{monitor.error}</p>}
    {monitor.data&&<><p role="status">{status[monitor.data.status]||monitor.data.status} · Última comprobación: {monitor.data.checked_at?new Date(monitor.data.checked_at).toLocaleString('es-CO'):'Sin comprobación'}</p><ul>{monitor.data.events.slice(-5).map((event,i)=><li key={`${event.at}-${i}`}>{event.component==='api'?'API':'Interfaz'}: {event.event==='incident.opened'?'incidente abierto':'servicio recuperado'} · {new Date(event.at).toLocaleString('es-CO')}</li>)}</ul></>}
    <h3>Plazos y responsables</h3><p>Base operativa configurable. Horas transcurridas desde la última actualización del proyecto. Aprobaciones y excepciones de vigencia: administrador vigente.</p>
    {message&&<p role="status">{message}</p>}
    {!values?<p>Cargando reglas…</p>:<>
      <form onSubmit={save} aria-label="Configurar reglas comerciales"><div className="card-grid">
        {Object.entries(stages).map(([key,label])=><Input key={key} label={`SLA ${label} (horas)`} type="number" min="0.01" max="87600" step="0.01" required value={values.sla_hours[key]} onChange={e=>setValues({...values,sla_hours:{...values.sla_hours,[key]:Number(e.target.value)}})} disabled={busy}/>)}
        {Object.entries(sources).map(([key,label])=><Input key={key} label={`Vigencia: ${label} (horas)`} type="number" min="0.01" max="87600" step="0.01" required value={values.source_max_age_hours[key]} onChange={e=>setValues({...values,source_max_age_hours:{...values.source_max_age_hours,[key]:Number(e.target.value)}})} disabled={busy}/>)}
        <Input label="Duración máxima de excepción (horas)" type="number" min="0.01" max="168" step="0.01" required value={values.exception_max_hours} onChange={e=>setValues({...values,exception_max_hours:Number(e.target.value)})} disabled={busy}/>
      </div><p>Históricos y simulaciones conservan su clasificación. Cada edición conserva revisión, autor, fecha y auditoría.</p><Button type="submit" loading={busy}>Guardar reglas comerciales</Button> <Button type="button" variant="secondary" disabled={busy} onClick={()=>act(load)}>Consultar reglas vigentes</Button></form>
      <h3>Revisar la vigencia de una fuente</h3><p>Registra metadatos aportados y su revisión en el proyecto. La verificación científica conserva su propio contrato y controles.</p>
      <form onSubmit={e=>{e.preventDefault();act(reviewSource);}} aria-label="Revisar vigencia de fuente"><div className="card-grid">
        <Input as="select" label="Proyecto para revisión" required value={source.project_id} onChange={e=>{setReview(null);setSource({...source,project_id:e.target.value});}} disabled={busy}><option value="">Selecciona un proyecto</option>{projects.map(p=><option key={p.analysis_run_id} value={p.analysis_run_id}>{p.project_name}</option>)}</Input>
        <Input label="Referencia de fuente" required maxLength={200} value={source.reference} onChange={e=>{setReview(null);setSource({...source,reference:e.target.value});}} disabled={busy}/>
        <Input as="select" label="Categoría de fuente" value={source.category} onChange={e=>{setReview(null);setSource({...source,category:e.target.value});}} disabled={busy}>{Object.entries({...sources,HISTORICAL:'Histórica',SIMULATED:'Simulada'}).map(([key,label])=><option key={key} value={key}>{label}</option>)}</Input>
        <Input label="Fecha de observación (hora local)" type="datetime-local" value={source.observed_at} onChange={e=>{setReview(null);setSource({...source,observed_at:e.target.value});}} disabled={busy}/>
      </div><Button type="submit" loading={busy}>Revisar vigencia</Button></form>
      {review&&<p role="status">{review.sources.map(s=>`${s.reference}: ${status[s.status]||s.status}`).join(' · ')}</p>}
      <details className="form-section"><summary>Excepción de vigencia</summary><p>Aplicada únicamente a la referencia y proyecto seleccionados. Queda registrada con tu identidad y vence automáticamente.</p><Input as="textarea" label="Motivo de la excepción" minLength={10} maxLength={2000} value={source.reason} onChange={e=>setSource({...source,reason:e.target.value})} disabled={busy}/><Input label="Vencimiento dentro de (horas)" type="number" min="0.01" max={values.exception_max_hours} step="0.01" value={source.exception_hours} onChange={e=>setSource({...source,exception_hours:Number(e.target.value)})} disabled={busy}/><Button disabled={busy||!source.project_id||!source.reference.trim()||source.reason.trim().length<10||source.exception_hours<=0||source.exception_hours>values.exception_max_hours} onClick={exception}>Registrar excepción de vigencia</Button></details>
    </>}
  </section>;
}
