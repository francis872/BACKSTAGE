const crypto=require('node:crypto');
const ApiError=require('../utils/ApiError');
const {RESOURCES,CAPABILITIES}=require('../soi/sanitary.contract');
const {geometry}=require('./soiValidation');
const fail=(message,status=400)=>{throw new ApiError(status,message);};
const object=value=>{if(!value||typeof value!=='object'||Array.isArray(value))fail('Se requiere un objeto de datos.');return value;};
const identifier=value=>{if(!['number','string'].includes(typeof value)||!Number.isSafeInteger(Number(value))||Number(value)<=0)fail('Identificador inválido.');return Number(value);};
const numeric=(value,field)=>{if(!['number','string'].includes(typeof value)||value===''||typeof value==='string'&&!value.trim()||!Number.isFinite(Number(value)))fail(`${field} requiere un número finito.`);return Number(value);};
const timestamp=(value,label)=>{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))fail(`${label} requiere ISO 8601 con zona horaria.`);const[year,month,day]=value.slice(0,10).split('-').map(Number);if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())fail(`${label}: fecha de calendario inválida.`);return new Date(value);};
const clean=row=>row&&Object.fromEntries(Object.entries(row).filter(([key])=>key!=='_id'));
const canonical=value=>value instanceof Date?value.toISOString():Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function scalar(value,definition,key){
 if(value==null||value===''){if(definition.default!==undefined)return definition.default;if(definition.optional)return null;fail(`${definition.label} es obligatorio.`);}
 if(definition.type==='number'){const result=numeric(value,key);if(definition.min!=null&&(result<definition.min||definition.exclusiveMin&&result===definition.min)||definition.max!=null&&result>definition.max)fail(`${definition.label} está fuera de rango.`);return result;}
 if(definition.type==='boolean'){if(typeof value!=='boolean')fail(`${definition.label} requiere verdadero/falso.`);return value;}
 if(definition.type==='reference')return identifier(value);
 if(definition.type==='references'){if(!Array.isArray(value)||value.length>1000)fail('Lista de referencias inválida.');const ids=value.map(identifier);if(new Set(ids).size!==ids.length)fail('Referencias duplicadas.');return ids;}
 if(definition.type==='datetime')return value instanceof Date?value:timestamp(value,definition.label);
 if(definition.type==='urls'){if(!Array.isArray(value)||value.length>20)fail('Máximo 20 evidencias.');return value.map(url=>scalar(url,{type:'url',label:'Evidencia'},key));}
 if(typeof value!=='string'||!value.trim()||value.length>(definition.maxLength||1000))fail(`${definition.label} requiere texto de longitud válida.`);
 const result=value.trim();if(definition.type==='choice'&&!definition.values.includes(result))fail(`${definition.label}: opción inválida.`);
 if(definition.type==='url'){let parsed;try{parsed=new URL(result);}catch{fail('URL inválida.');}if(parsed.protocol!=='https:'||parsed.username||parsed.password)fail('La evidencia requiere HTTPS sin credenciales.');}
 return result;
}
function createSanitaryService(infrastructure=require('../infrastructure/soiMongo')){
 const scope=context=>({organization_id:identifier(context.organizationId)});
 const writer=(context,admin=false)=>{scope(context);identifier(context.userId);if(!(admin?['admin']:['admin','analyst']).includes(context.role))fail('Sin permiso para modificar este dominio.',403);};
 const definition=kind=>{if(!Object.hasOwn(RESOURCES,kind))fail('Recurso sanitario no disponible.',404);return RESOURCES[kind];};
 const db=infrastructure.getMongoDatabase;
 async function capability(context,name,store,session){const config=await(store||await db()).collection('soi_configuration').findOne(scope(context),{session});if(!(config?.capabilities||['assets','operations']).includes(name))fail(`Capacidad ${name} deshabilitada.`,409);return config;}
 async function reference(store,session,context,field,value){
  if(value==null)return null;const found=await store.collection(field.collection).findOneAndUpdate({...scope(context),[field.key]:identifier(value),...(field.collection==='soi_assets'?{'metadata.archived':{$ne:true}}:{})},{$inc:{relation_revision:1}},{session,returnDocument:'after',includeResultMetadata:false});
  if(!found)fail(`${field.label} no pertenece a la organización o no está disponible.`,404);return found;
 }
 async function normalize(context,kind,input,store,session){
  const spec=definition(kind),values={},references={};
  for(const [key,field]of Object.entries(spec.fields)){values[key]=scalar(input[key],field,key);if(field.type==='reference')references[key]=await reference(store,session,context,field,values[key]);if(field.type==='references')for(const value of values[key])await reference(store,session,context,field,value);}
  if(kind==='waste-movements'){
   values.quantity_kg=values.unit==='kg'?values.quantity:values.unit==='t'?values.quantity*1000:null;
   if(values.quantity_kg!=null&&!Number.isFinite(values.quantity_kg))fail('Cantidad convertida fuera de rango.');
   if(values.cost!=null&&!/^[A-Z]{3}$/.test(values.currency||''))fail('El costo requiere moneda ISO 4217.');
   if(values.destination_id&&references.destination_id.status!=='active')fail('La instalación receptora no está disponible.',409);
   if(values.container_id&&references.container_id.category_id!==values.category_id)fail('La categoría no coincide con el contenedor.');
  }
  if(kind==='containers'&&values.fill_percent!=null&&!values.observed_at)fail('El porcentaje de llenado requiere fecha de observación.');
  if(kind==='measurements'){
   const sensor=references.sensor_id;if(values.unit!==sensor.unit)fail('La unidad debe coincidir con el sensor; no se convierte silenciosamente.');
   if(sensor.status!=='active')fail('El sensor no está activo.',409);
   if(values.observed_at.getTime()>Date.now()+60000)fail('La medición tiene una fecha futura.');
   values.variable=sensor.variable;values.station_id=sensor.station_id;values.instrument=sensor.instrument;values.verification='SOURCE_DECLARED_NOT_INDEPENDENTLY_VERIFIED';
  }
  if(kind==='emission-factors'&&values.valid_until<values.valid_from)fail('Vigencia del factor inválida.');
  if(kind==='carbon-entries'){
   const factor=references.factor_id,source=references.source_id;let quantity=values.quantity;
   const correction=references.correction_of_id;if(correction&&(!correction.voided_at||correction.source_id!==values.source_id))fail('La corrección requiere una entrada anulada de la misma fuente.',409);
   values.business_activity_reference=correction?.business_activity_reference||correction?.activity_reference||values.activity_reference;
   if(values.activity_unit!==factor.activity_unit){if(values.activity_unit==='t'&&factor.activity_unit==='kg')quantity*=1000;else if(values.activity_unit==='kg'&&factor.activity_unit==='t')quantity/=1000;else fail('Las unidades de actividad y factor son incompatibles.');}
   if(values.occurred_at<new Date(factor.valid_from)||values.occurred_at>new Date(factor.valid_until))fail('La actividad está fuera de la vigencia del factor.');
   values.kgco2e=quantity*factor.kgco2e_per_unit;if(!Number.isFinite(values.kgco2e))fail('Resultado de emisiones fuera de rango.');
   values.scope=source.scope;values.boundary=source.boundary;values.factor_snapshot={record_id:factor.record_id,version:factor.version,source:factor.source,source_url:factor.source_url,methodology:factor.methodology,activity_unit:factor.activity_unit,kgco2e_per_unit:factor.kgco2e_per_unit,uncertainty_percent:factor.uncertainty_percent};
   values.calculation={activity_in_factor_unit:quantity,formula:'activity × factor',result_unit:'kgCO2e',factor_verification:'ORGANIZATION_DECLARED',result_kind:values.data_kind==='simulated'?'simulated':'estimated'};
  }
  if(kind==='route-executions'){
   if(values.ended_at&&values.ended_at<values.started_at)fail('La ejecución termina antes de comenzar.');
   if(values.served_asset_ids.some(id=>!values.planned_asset_ids.includes(id)))fail('Los puntos atendidos deben pertenecer a la planificación declarada.');
   values.omitted_asset_ids=values.planned_asset_ids.filter(id=>!values.served_asset_ids.includes(id));values.compliance_percent=values.planned_asset_ids.length?100*values.served_asset_ids.length/values.planned_asset_ids.length:null;
   const plan=references.route_plan_id;const route=plan.result?.routes?.[0]||plan.result?.alternatives?.[0];
   values.planned_distance_m=route?.distanceM??null;values.distance_difference_percent=values.planned_distance_m>0&&values.distance_m!=null?100*(values.distance_m-values.planned_distance_m)/values.planned_distance_m:null;
  }
  return {values,references};
 }
 async function event(store,session,context,type,resourceId,revision){const key=`${type}:${resourceId}:${revision}`;await store.collection('soi_domain_events').insertOne({...scope(context),event_id:await infrastructure.nextId('soi_domain_events',session),event_key:key,type,resource_id:resourceId,revision,actor_user_id:context.userId,created_at:new Date()},{session});}
 async function archiveVersion(store,session,context,kind,record){await store.collection('soi_sanitary_versions').insertOne({...scope(context),version_id:await infrastructure.nextId('soi_sanitary_versions',session),resource_kind:kind,resource_id:record.record_id,revision:record.revision,snapshot:clean(record),archived_at:new Date(),archived_by:context.userId},{session});}
 async function evaluateMeasurement(context,store,session,measurement,sensor){
  if(measurement.quality==='invalid')return;
  const previous=sensor.latest_by_kind?.[measurement.data_kind];
  if(previous&&new Date(previous.observed_at)>=measurement.observed_at)return;
  const latest={...(sensor.latest_by_kind||{}),[measurement.data_kind]:{observed_at:measurement.observed_at,value:measurement.value,measurement_id:measurement.record_id,quality:measurement.quality}};
  const newer=!sensor.latest_observed_at||new Date(sensor.latest_observed_at)<measurement.observed_at;
  await store.collection('soi_sensors').updateOne({...scope(context),record_id:sensor.record_id},{$set:{latest_by_kind:latest,...(newer?{latest_observed_at:measurement.observed_at,latest_value:measurement.value,latest_data_kind:measurement.data_kind,latest_quality:measurement.quality}:{}),updated_at:new Date()}},{session});
  const rules=await store.collection('soi_alert_rules').find({...scope(context),sensor_id:sensor.record_id,enabled:true,data_kind:measurement.data_kind},{session}).limit(100).toArray();
  const operators={gt:(a,b)=>a>b,gte:(a,b)=>a>=b,lt:(a,b)=>a<b,lte:(a,b)=>a<=b};
  for(const rule of rules){
   await store.collection('soi_alert_rules').updateOne({...scope(context),record_id:rule.record_id},{$inc:{evaluation_revision:1}},{session});
   const current=await store.collection('soi_sanitary_alerts').findOne({...scope(context),rule_id:rule.record_id,status:{$in:['open','acknowledged']}},{session});
   if(operators[rule.operator](measurement.value,rule.threshold)){
    if(current){await archiveVersion(store,session,context,'alerts',current);await store.collection('soi_sanitary_alerts').updateOne({...scope(context),record_id:current.record_id},{$set:{last_observed_at:measurement.observed_at,last_value:measurement.value,measurement_id:measurement.record_id},$inc:{occurrences:1,revision:1}},{session});await event(store,session,context,'alert.observed',current.record_id,current.revision+1);}
    else{const id=await infrastructure.nextId('soi_sanitary_alerts',session);await store.collection('soi_sanitary_alerts').insertOne({...scope(context),record_id:id,name:rule.name,rule_id:rule.record_id,sensor_id:sensor.record_id,measurement_id:measurement.record_id,status:'open',severity:rule.severity,threshold:rule.threshold,operator:rule.operator,unit:measurement.unit,data_kind:measurement.data_kind,first_observed_at:measurement.observed_at,last_observed_at:measurement.observed_at,last_value:measurement.value,occurrences:1,revision:1,created_at:new Date()},{session});await event(store,session,context,'alert.opened',id,1);}
   }else if(current){await archiveVersion(store,session,context,'alerts',current);await store.collection('soi_sanitary_alerts').updateOne({...scope(context),record_id:current.record_id},{$set:{status:'resolved',resolved_at:new Date(),resolution:'threshold_cleared',last_observed_at:measurement.observed_at},$inc:{revision:1}},{session});await event(store,session,context,'alert.resolved',current.record_id,current.revision+1);}
  }
 }
 async function create(context,kind,input){
  object(input);writer(context);const spec=definition(kind);if(spec.readonly)fail('Este recurso se genera mediante su proceso de dominio.',405);
  if(kind==='integrations')writer(context,true);
  if(JSON.stringify(input).length>100000)fail('El registro supera 100 kB.',413);
  if(Object.keys(input).some(key=>!Object.hasOwn(spec.fields,key)))fail('El registro contiene campos no admitidos por el contrato.');
  for(const key of ['organization_id','created_by','record_id','revision','kgco2e','factor_snapshot'])if(Object.hasOwn(input,key))fail(`${key} es gestionado por el servidor.`);
  return infrastructure.withMongoTransaction(async(store,session)=>{
   await capability(context,spec.capability,store,session);const {values,references}=await normalize(context,kind,input,store,session);const requestHash=hash(values);
   if(values.event_id){const existing=await store.collection(spec.collection).findOne({...scope(context),event_id:values.event_id},{session});if(existing){if(existing.request_hash!==requestHash)fail('El evento ya existe con un contenido diferente.',409);return clean(existing);}}
   if(kind==='carbon-entries'&&(await store.collection(spec.collection).findOne({...scope(context),activity_reference:values.activity_reference},{session})||await store.collection(spec.collection).findOne({...scope(context),business_activity_reference:values.business_activity_reference,active:true},{session})))fail('La actividad ya fue contabilizada; registra una corrección trazable.',409);
   const record={...values,...scope(context),record_id:await infrastructure.nextId(spec.collection,session),revision:1,created_by:context.userId,created_at:new Date(),updated_at:new Date(),request_hash:requestHash,verification:'ORGANIZATION_DECLARED_NOT_INDEPENDENTLY_VERIFIED'};
   if(kind==='carbon-entries')record.active=true;
   await store.collection(spec.collection).insertOne(record,{session});
   if(kind==='measurements')await evaluateMeasurement(context,store,session,record,references.sensor_id);
   if(kind==='waste-movements'&&record.status==='completed'&&record.container_id)await refreshCollection(context,store,session,record.container_id);
   await event(store,session,context,`${kind}.created`,record.record_id,1);return clean(record);
  });
 }
 async function get(context,kind,recordId){const spec=definition(kind);await capability(context,spec.capability);const record=await(await db()).collection(spec.collection).findOne({...scope(context),record_id:identifier(recordId)});if(!record)fail('Registro no disponible.',404);return clean(record);}
 async function list(context,kind,query={}){
  const spec=definition(kind);await capability(context,spec.capability);const filter=scope(context),limit=query.limit==null?50:identifier(query.limit),offset=Number(query.offset||0);
  if(limit>200||!Number.isInteger(offset)||offset<0||offset>100000)fail('Paginación fuera de rango.');
  if(query.status){if(typeof query.status!=='string'||query.status.length>40)fail('Filtro inválido.');filter.status=query.status;}
  for(const key of ['sensor_id','category_id','source_id','vehicle_id','network_id'])if(query[key]!=null)filter[key]=identifier(query[key]);
  if(query.data_kind){if(!['measured','estimated','forecast','simulated'].includes(query.data_kind))fail('Naturaleza de datos inválida.');filter.data_kind=query.data_kind;}
  if(query.from||query.until){filter[spec.fields.observed_at?'observed_at':spec.fields.occurred_at?'occurred_at':'created_at']={...(query.from?{$gte:timestamp(query.from,'from')}:{}),...(query.until?{$lt:timestamp(query.until,'until')}:{})};}
  const store=await db();const records=await store.collection(spec.collection).find(filter,{projection:kind==='optimization-scenarios'?{input:0,result:0}:kind==='prediction-runs'?{input:0}:undefined}).sort({record_id:-1}).skip(offset).limit(limit).toArray();
  const count=await store.collection(spec.collection).countDocuments(filter);return{data:records.map(clean),pagination:{limit,offset,total:count}};
 }
 async function update(context,kind,recordId,input){
  object(input);writer(context);const spec=definition(kind);
  if(kind==='integrations')writer(context,true);
  if(Object.keys(input).some(key=>key!=='revision'&&!Object.hasOwn(spec.fields,key)))fail('La revisión contiene campos no admitidos.');
  if(spec.readonly||spec.ledger&&!['waste-movements'].includes(kind))fail('Registro inmutable: crea una nueva versión o una anulación auditada.',409);
  const expected=identifier(input.revision);
  return infrastructure.withMongoTransaction(async(store,session)=>{
   await capability(context,spec.capability,store,session);const filter={...scope(context),record_id:identifier(recordId),revision:expected,voided_at:{$exists:false}};const current=await store.collection(spec.collection).findOne(filter,{session});if(!current)fail('El registro cambió o no está disponible; actualiza la vista.',409);
   if(['waste-movements','route-executions'].includes(kind)){
    const transitions={planned:['in_progress','cancelled'],in_progress:['completed','cancelled']};if(!transitions[current.status]?.includes(input.status))fail('Transición operacional inválida.',409);
    const allowed=new Set(['revision','status',...(kind==='route-executions'?['ended_at','distance_m','duration_s','fuel_l','served_asset_ids']:[])]);if(Object.keys(input).some(key=>!allowed.has(key)))fail('La operación conserva sus datos originales; registra correcciones con evidencia.');
   }
   const {values}=await normalize(context,kind,{...current,...input},store,session);
   await archiveVersion(store,session,context,kind,current);
   const changed=await store.collection(spec.collection).findOneAndUpdate(filter,{$set:{...values,updated_at:new Date(),updated_by:context.userId},$inc:{revision:1}},{session,returnDocument:'after',includeResultMetadata:false});if(!changed)fail('Conflicto concurrente.',409);
   if(kind==='waste-movements'&&changed.status==='completed'&&changed.container_id)await refreshCollection(context,store,session,changed.container_id);
   await event(store,session,context,`${kind}.updated`,changed.record_id,changed.revision);return clean(changed);
  });
 }
 async function resolveAlert(context,recordId,input){writer(context);object(input);const state=input.status;if(!['acknowledged','resolved'].includes(state))fail('Estado de alerta inválido.');if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>2000)fail('Justifica la acción sobre la alerta.');
  return infrastructure.withMongoTransaction(async(store,session)=>{await capability(context,'monitoring',store,session);const filter={...scope(context),record_id:identifier(recordId),revision:identifier(input.revision),status:{$in:state==='acknowledged'?['open']:['open','acknowledged']}};
   const current=await store.collection('soi_sanitary_alerts').findOne(filter,{session});if(!current)fail('La alerta cambió o no admite esta acción.',409);await archiveVersion(store,session,context,'alerts',current);
   const record=await store.collection('soi_sanitary_alerts').findOneAndUpdate(filter,{$set:{status:state,action_reason:input.reason,action_by:context.userId,action_at:new Date()},$inc:{revision:1}},{session,returnDocument:'after',includeResultMetadata:false});if(!record)fail('La alerta cambió o no admite esta acción.',409);await event(store,session,context,`alert.${state}`,record.record_id,record.revision);return clean(record);});
 }
 async function refreshCollection(context,store,session,containerId){
  const latest=await store.collection('soi_waste_movements').findOne({...scope(context),container_id:containerId,status:'completed',voided_at:{$exists:false}},{session,sort:{occurred_at:-1,record_id:-1}});
  await store.collection('soi_waste_containers').updateOne({...scope(context),record_id:containerId},{$set:{last_collection_at:latest?.occurred_at||null}},{session});
 }
 async function refreshSensor(context,store,session,measurement){
  const filter={...scope(context),sensor_id:measurement.sensor_id,quality:{$ne:'invalid'},voided_at:{$exists:false}};
  const sensor=await reference(store,session,context,{collection:'soi_sensors',key:'record_id',label:'Sensor'},measurement.sensor_id);
  const latest=await store.collection('soi_measurements').findOne(filter,{session,sort:{observed_at:-1,record_id:-1}}),byKind={};
  for(const kind of ['measured','estimated','forecast','simulated']){const row=await store.collection('soi_measurements').findOne({...filter,data_kind:kind},{session,sort:{observed_at:-1,record_id:-1}});if(row)byKind[kind]={observed_at:row.observed_at,value:row.value,measurement_id:row.record_id,quality:row.quality};}
  await store.collection('soi_sensors').updateOne({...scope(context),record_id:sensor.record_id},{$set:{latest_by_kind:byKind,latest_observed_at:latest?.observed_at||null,latest_value:latest?.value??null,latest_data_kind:latest?.data_kind||null,latest_quality:latest?.quality||null,updated_at:new Date()}},{session});
  const alerts=await store.collection('soi_sanitary_alerts').find({...scope(context),measurement_id:measurement.record_id,status:{$in:['open','acknowledged']}},{session}).limit(100).toArray();
  for(const alert of alerts){await archiveVersion(store,session,context,'alerts',alert);await store.collection('soi_sanitary_alerts').updateOne({...scope(context),record_id:alert.record_id},{$set:{status:'resolved',resolution:'measurement_voided',resolved_at:new Date(),action_by:context.userId},$inc:{revision:1}},{session});await event(store,session,context,'alert.resolved',alert.record_id,alert.revision+1);}
  const previous=await store.collection('soi_measurements').findOne({...filter,data_kind:measurement.data_kind},{session,sort:{observed_at:-1,record_id:-1}});
  if(alerts.length&&previous){const withoutKind={...byKind};delete withoutKind[measurement.data_kind];await evaluateMeasurement(context,store,session,previous,{...sensor,latest_by_kind:withoutKind,latest_observed_at:latest?.observed_at||null});}
 }
 async function voidRecord(context,kind,recordId,input){object(input);writer(context,true);const spec=definition(kind);if(!spec.ledger||!['waste-movements','measurements','carbon-entries'].includes(kind))fail('Este registro no admite anulación.',409);if(typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>2000)fail('Indica una justificación de anulación.');
  return infrastructure.withMongoTransaction(async(store,session)=>{
   await capability(context,spec.capability,store,session);const filter={...scope(context),record_id:identifier(recordId),revision:identifier(input.revision),voided_at:{$exists:false}};
   const current=await store.collection(spec.collection).findOne(filter,{session});if(!current)fail('No se puede anular el registro.',409);
   await archiveVersion(store,session,context,kind,current);
   const record=await store.collection(spec.collection).findOneAndUpdate(filter,{$set:{voided_at:new Date(),voided_by:context.userId,void_reason:input.reason,...(kind==='carbon-entries'?{active:false}:{})},$inc:{revision:1}},{session,returnDocument:'after',includeResultMetadata:false});if(!record)fail('Conflicto concurrente.',409);
   if(kind==='measurements')await refreshSensor(context,store,session,record);
   if(kind==='waste-movements'&&record.container_id)await refreshCollection(context,store,session,record.container_id);
   await event(store,session,context,`${kind}.voided`,record.record_id,record.revision);return clean(record);
  });
 }
 async function catalog(context){const config=await(await db()).collection('soi_configuration').findOne(scope(context));return{identity:'Operaciones de Inteligencia Sanitaria',resources:Object.fromEntries(Object.entries(RESOURCES).filter(([,spec])=>config?.capabilities?.includes(spec.capability)).map(([kind,spec])=>[kind,{label:spec.label,capability:spec.capability,readonly:!!spec.readonly,ledger:!!spec.ledger,fields:spec.fields}]))};}
 async function history(context,kind,recordId){const record=await get(context,kind,recordId);const versions=await(await db()).collection('soi_sanitary_versions').find({...scope(context),resource_kind:kind,resource_id:record.record_id}).sort({revision:-1}).limit(200).toArray();return{current:record,history:versions.map(clean),limit:200};}
 async function events(context,after=0){const cursor=Number(after);if(!Number.isSafeInteger(cursor)||cursor<0)fail('Cursor de eventos inválido.');const records=await(await db()).collection('soi_domain_events').find({...scope(context),event_id:{$gt:cursor}}).sort({event_id:1}).limit(200).toArray();return{data:records.map(clean),next:records.length?records.at(-1).event_id:cursor};}
 return{create,get,list,update,resolveAlert,voidRecord,catalog,events,history,capability,reference,writer,scope,definition,event,normalize};
}
module.exports={createSanitaryService,service:createSanitaryService(),RESOURCES,CAPABILITIES,identifier,numeric,timestamp,clean,hash,object};
