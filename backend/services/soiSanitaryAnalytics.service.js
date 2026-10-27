const ApiError=require('../utils/ApiError');
const {createSanitaryService,identifier,object,timestamp,hash,clean}=require('./soiSanitary.service');
const {executeSoiPython}=require('./bsie.service');
const evidence=require('./optimizationEvidence.service');
const fail=(message,status=400)=>{throw new ApiError(status,message);};
function createSanitaryAnalytics(infrastructure=require('../infrastructure/soiMongo'),runner=executeSoiPython,{fetchImpl=fetch,env=process.env,weather=require('./territoryLive.service').weather}={}){
 const sanitary=createSanitaryService(infrastructure),db=infrastructure.getMongoDatabase;
 async function scopedReference(store,session,context,collection,key,id,label){return sanitary.reference(store,session,context,{collection,key,label},identifier(id));}
 async function lockConfiguration(store,session,context,config){
  const locked=await store.collection('soi_configuration').findOneAndUpdate({...sanitary.scope(context),revision:config.revision==null?{$exists:false}:config.revision},{$inc:{relation_revision:1}},{session,returnDocument:'after',includeResultMetadata:false});
  if(!locked)fail('La configuración cambió concurrentemente; vuelve a revisar el escenario.',409);
 }
 async function prepareOptimization(context,input){
  object(input);sanitary.writer(context);const config=await sanitary.capability(context,'optimization');
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>200)fail('El escenario requiere nombre.');
  if(!Array.isArray(input.nodes)||input.nodes.length<2||input.nodes.length>100||!Array.isArray(input.vehicles)||input.vehicles.length<1||input.vehicles.length>20)fail('Admite 2–100 puntos y 1–20 vehículos.');
  const prepared=await infrastructure.withMongoTransaction(async(store,session)=>{
   const nodes=[],vehicles=[];
   for(const raw of input.nodes){object(raw);const asset=await scopedReference(store,session,context,'soi_assets','location_id',raw.asset_id,'Punto operativo');if(asset.geometry?.type!=='Point')fail('La optimización requiere activos puntuales.');
    nodes.push({id:String(asset.location_id),asset_id:asset.location_id,coordinates:asset.geometry.coordinates,name:asset.name,resource_snapshot:{geometry_sha256:hash(asset.geometry),source:asset.metadata?.provenance?.source||asset.metadata?.source||null,data_type:asset.metadata?.provenance?.data_type||'UNKNOWN'},demand_kg:raw.demand_kg??0,service_s:raw.service_s??0,...(raw.time_window_s?{time_window_s:raw.time_window_s}:{}),...(raw.optional!==undefined?{optional:raw.optional}:{}),...(raw.priority!==undefined?{priority:raw.priority}:{})});
   }
   for(const raw of input.vehicles){object(raw);const vehicle=await scopedReference(store,session,context,'soi_vehicles','vehicle_id',raw.vehicle_id,'Vehículo');if(vehicle.status!=='available')fail('Un vehículo seleccionado no está disponible.',409);
    if(!Number.isFinite(Number(raw.capacity_kg))||Number(raw.capacity_kg)<=0)fail('Declara capacidad en kg por vehículo.');
    if(vehicle.capacity_unit==='kg'&&Number(raw.capacity_kg)>Number(vehicle.capacity))fail('La capacidad propuesta supera la capacidad registrada.');
    if(vehicle.capacity_unit!=='kg'&&(typeof raw.capacity_kg_source!=='string'||!raw.capacity_kg_source.trim()))fail('La conversión a capacidad kg necesita fuente explícita; no se asume densidad.');
    const allowed=['capacity_kg','capacity_kg_source','start_index','end_index','shift_s','cost_per_km','cost_per_hour','fixed_cost','emission_kgco2e_per_km','emission_factor_source'];
    vehicles.push({id:String(vehicle.vehicle_id),vehicle_id:vehicle.vehicle_id,name:vehicle.name,resource_snapshot:{capacity:vehicle.capacity,capacity_unit:vehicle.capacity_unit,status:vehicle.status},...Object.fromEntries(allowed.filter(key=>raw[key]!==undefined).map(key=>[key,raw[key]]))});
   }
   return{nodes,vehicles};
  });
  let matrix=input.matrix;
  if(input.matrix_source==='osrm'){
   const endpoint=env.SOI_OSRM_DRIVING_URL||(env.NODE_ENV!=='production'?'https://router.project-osrm.org':null);if(!endpoint)fail('Configura un proveedor OSRM autorizado para obtener la matriz vial.',503);
   const url=new URL(`/table/v1/driving/${prepared.nodes.map(node=>node.coordinates.join(',')).join(';')}`,endpoint);url.searchParams.set('annotations','distance,duration');
   const response=await fetchImpl(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Backstage-SOI/3.1'}});if(!response.ok)fail('El proveedor de matriz vial no está disponible.',503);
   const text=await response.text();if(text.length>3000000)fail('La matriz vial supera 3 MB.',413);let result;try{result=JSON.parse(text);}catch{fail('La matriz vial no es JSON válido.',503);}if(result.code!=='Ok')fail('El proveedor no puede conectar todos los puntos.',422);
   matrix={node_ids:prepared.nodes.map(node=>node.id),distance_m:result.distances,duration_s:result.durations,source:{name:'OSRM driving table',url:url.origin,data_kind:'estimated',data_type:'EXTERNAL_API',queried_at:new Date().toISOString(),traffic:'not_live'}};
  }else{
   object(matrix);object(matrix.source);if(typeof matrix.source.name!=='string'||!matrix.source.name.trim())fail('Declara la fuente de la matriz.');
   if(!Array.isArray(matrix.node_ids)||JSON.stringify(matrix.node_ids.map(String))!==JSON.stringify(prepared.nodes.map(node=>node.id)))fail('node_ids debe coincidir exactamente con el orden de los activos seleccionados.');
   if(matrix.source.data_kind&&!['measured','estimated','simulated'].includes(matrix.source.data_kind))fail('Naturaleza de matriz no admitida.');
   matrix={node_ids:matrix.node_ids.map(String),distance_m:matrix.distance_m,duration_s:matrix.duration_s,source:{name:matrix.source.name,data_kind:matrix.source.data_kind||'estimated',verification:'ORGANIZATION_DECLARED_NOT_INDEPENDENTLY_VERIFIED'}};
  }
  const payload={operation:'optimize_routes',...prepared,matrix,...Object.fromEntries(['objective','horizon_s','time_limit_s','currency'].filter(key=>input[key]!==undefined).map(key=>[key,input[key]]))};
  if(Buffer.byteLength(JSON.stringify(payload))>4000000)fail('El escenario supera 4 MB.',413);return evidence.normalize(payload,config);
 }
 async function execute(context,kind,name,payload,options={}){
  const spec=sanitary.definition(kind);const projectId=options.projectId==null?null:identifier(options.projectId);const requestHash=hash({version:'soi-scientific-1.0.0',payload,...(projectId?{analysis_run_id:projectId}:{})});
  const initial=await infrastructure.withMongoTransaction(async(store,session)=>{
   const currentConfig=await sanitary.capability(context,spec.capability,store,session);
   if(payload.rule_context&&hash(evidence.configuration(currentConfig))!==payload.rule_context.configuration_sha256)fail('La configuración de negocio cambió; prepara un escenario nuevo.',409);
   if(projectId&&!await store.collection('analysis_runs').findOne({...sanitary.scope(context),analysis_run_id:projectId},{session}))fail('Proyecto no encontrado.',404);
   if(payload.rule_context)await lockConfiguration(store,session,context,currentConfig);
   const existing=await store.collection(spec.collection).findOne({...sanitary.scope(context),request_hash:requestHash},{session});
   if(existing){
    if(!options.retry)return{record:existing,existing:true};
    const expired=existing.state==='RUNNING'&&existing.lease_until&&new Date(existing.lease_until)<new Date();
    if((!['FAILED','CANCELLED','NO_SOLUTION_FOUND'].includes(existing.state)&&!expired)||(existing.attempts||1)>=3||existing.revision!==options.expectedRevision)fail('La ejecución no admite reintento o cambió de revisión.',409);
    const record=await store.collection(spec.collection).findOneAndUpdate({...sanitary.scope(context),record_id:existing.record_id,revision:existing.revision},{$set:{state:'RUNNING',lease_until:new Date(Date.now()+60000),updated_at:new Date()},$inc:{revision:1,attempts:1},$unset:{error:'',result:'',analysis:''}},{session,returnDocument:'after',includeResultMetadata:false});if(!record)fail('Conflicto al reintentar.',409);await sanitary.event(store,session,context,`${kind}.retried`,record.record_id,record.revision);return{record,existing:false};
   }
   const record={...sanitary.scope(context),record_id:await infrastructure.nextId(spec.collection,session),name,operation:payload.operation,input:payload,request_hash:requestHash,analysis_run_id:projectId,state:'RUNNING',attempts:1,lease_until:new Date(Date.now()+60000),revision:1,created_by:context.userId,created_at:new Date(),updated_at:new Date()};
   await store.collection(spec.collection).insertOne(record,{session});await sanitary.event(store,session,context,`${kind}.started`,record.record_id,1);return{record,existing:false};
  });
  if(initial.existing)return clean(initial.record);
  const filter={...sanitary.scope(context),record_id:initial.record.record_id,state:'RUNNING',revision:initial.record.revision};
  const controller=new AbortController(),cancel=()=>controller.abort();if(options.signal?.aborted)controller.abort();options.signal?.addEventListener('abort',cancel,{once:true});
  let checking=false;const poll=setInterval(async()=>{if(checking)return;checking=true;try{if(!await(await db()).collection(spec.collection).findOne(filter))controller.abort();}catch{controller.abort();}finally{checking=false;}},1000);
  try{
   const result=await runner(payload,{...options,signal:controller.signal,organizationId:context.organizationId});if(Buffer.byteLength(JSON.stringify(result))>8000000)fail('El resultado supera 8 MB.',413);
   return await infrastructure.withMongoTransaction(async(store,session)=>{
    const state=kind==='optimization-scenarios'?(result.result.feasible?'PROPOSED':result.result.status?.startsWith('INFEASIBLE')?'INFEASIBLE':'NO_SOLUTION_FOUND'):'COMPLETED';
    const analysis=kind==='optimization-scenarios'&&payload.rule_context?evidence.build(payload,result):null;
    const record=await store.collection(spec.collection).findOneAndUpdate(filter,{$set:{state,result,...(analysis?{analysis}:{}),updated_at:new Date(),algorithm_version:result.version},$inc:{revision:1},$unset:{lease_until:''}},{session,returnDocument:'after',includeResultMetadata:false});if(!record)fail('La ejecución cambió concurrentemente.',409);
    if(analysis&&projectId){const linked=await store.collection('analysis_runs').updateOne({...sanitary.scope(context),analysis_run_id:projectId},{$addToSet:{'metadata.spatial_evidence':{kind:'optimization',record_id:record.record_id,manifest_sha256:analysis.manifest_sha256}},$set:{updated_at:new Date()}},{session});if(linked.matchedCount!==1)fail('Proyecto no encontrado.',404);}
    await sanitary.event(store,session,context,`${kind}.completed`,record.record_id,record.revision);return clean(record);
   });
  }catch(error){await(await db()).collection(spec.collection).updateOne(filter,{$set:{state:'FAILED',error:error.statusCode?error.message:'El proceso científico no pudo completarse.',updated_at:new Date()},$inc:{revision:1},$unset:{lease_until:''}});throw error;}
  finally{clearInterval(poll);options.signal?.removeEventListener('abort',cancel);}
 }
 async function retry(context,kind,recordId,input){
  sanitary.writer(context);if(!['optimization-scenarios','prediction-runs'].includes(kind))fail('Tipo de ejecución inválido.');const record=await sanitary.get(context,kind,recordId);
  if(kind==='optimization-scenarios')await infrastructure.withMongoTransaction(async(store,session)=>{for(const item of record.input.nodes){const asset=await scopedReference(store,session,context,'soi_assets','location_id',item.asset_id,'Punto');if(asset.geometry?.type!=='Point'||hash(asset.geometry.coordinates)!==hash(item.coordinates))fail('Los puntos cambiaron: crea un nuevo escenario.',409);}for(const item of record.input.vehicles){const vehicle=await scopedReference(store,session,context,'soi_vehicles','vehicle_id',item.vehicle_id,'Vehículo');if(vehicle.status!=='available'||vehicle.capacity_unit==='kg'&&item.capacity_kg>vehicle.capacity)fail('Los vehículos cambiaron: crea un nuevo escenario.',409);}});
  return execute(context,kind,record.name,record.input,{retry:true,expectedRevision:identifier(input.revision),projectId:record.analysis_run_id});
 }
 async function cancel(context,kind,recordId,input){
  sanitary.writer(context);if(!['optimization-scenarios','prediction-runs'].includes(kind))fail('Tipo de ejecución inválido.');const spec=sanitary.definition(kind);
  return infrastructure.withMongoTransaction(async(store,session)=>{await sanitary.capability(context,spec.capability,store,session);const record=await store.collection(spec.collection).findOneAndUpdate({...sanitary.scope(context),record_id:identifier(recordId),revision:identifier(input.revision),state:'RUNNING'},{$set:{state:'CANCELLED',cancelled_by:context.userId,updated_at:new Date()},$inc:{revision:1},$unset:{lease_until:''}},{session,returnDocument:'after',includeResultMetadata:false});if(!record)fail('La ejecución no puede cancelarse o cambió de revisión.',409);await sanitary.event(store,session,context,`${kind}.cancelled`,record.record_id,record.revision);return clean(record);});
 }
 async function optimize(context,input,options){const payload=await prepareOptimization(context,input);return execute(context,'optimization-scenarios',input.name.trim(),payload,{...options,projectId:input.analysis_run_id});}
 async function verify(context,id){return evidence.verify(await sanitary.get(context,'optimization-scenarios',id));}
 async function exportScenario(context,id){const snapshot=await sanitary.get(context,'optimization-scenarios',id);return{format:'backstage-optimization-export-1',snapshot,verification:evidence.verify(snapshot)};}
 async function reproduce(context,id,options={}){
  sanitary.writer(context);await sanitary.capability(context,'optimization');const record=await sanitary.get(context,'optimization-scenarios',id);
  const verification=evidence.verify(record);if(!verification.verified)fail('El escenario no tiene evidencia verificable para repetirlo.',409);
  const result=await runner(record.input,{...options,organizationId:context.organizationId});const validation=evidence.validateSolution(record.input,result);
  const output={original_record_id:record.record_id,original_manifest_sha256:record.analysis.manifest_sha256,snapshot_modified:false,exact_result_matches:hash(evidence.semanticResult(result))===hash(evidence.semanticResult(record.result)),solution_validation:validation,result,note:'Se repiten entradas congeladas con búsqueda acotada; no se exige la misma ruta ni se aprueba o despacha una operación.'};
  output.result_sha256=hash(evidence.semanticResult(result));
  output.replay_event_id=await infrastructure.withMongoTransaction(async(store,session)=>{
   const eventId=await infrastructure.nextId('soi_domain_events',session);
   await store.collection('soi_domain_events').insertOne({...sanitary.scope(context),event_id:eventId,event_key:`optimization.reproduced:${record.record_id}:${eventId}`,type:'optimization.reproduced',resource_id:record.record_id,revision:record.revision,actor_user_id:context.userId,created_at:new Date(),metadata:{original_manifest_sha256:record.analysis.manifest_sha256,input_sha256:record.analysis.input_sha256,result_sha256:output.result_sha256,solver_version:result.result.solver_version||null,solution_valid:validation.valid,exact_result_matches:output.exact_result_matches}},{session});
   return eventId;
  });return output;
 }
 async function approve(context,scenarioId,input){
  sanitary.writer(context,true);return infrastructure.withMongoTransaction(async(store,session)=>{
   await sanitary.capability(context,'optimization',store,session);const filter={...sanitary.scope(context),record_id:identifier(scenarioId),revision:identifier(input.revision),state:'PROPOSED'};
   const scenario=await store.collection('soi_optimization_scenarios').findOne(filter,{session});if(!scenario)fail('La propuesta cambió o no puede aprobarse.',409);
   if(scenario.input.rule_context){const config=await sanitary.capability(context,'optimization',store,session);if(hash(evidence.configuration(config))!==scenario.input.rule_context.configuration_sha256)fail('La configuración de negocio cambió; reoptimiza antes de aprobar.',409);await lockConfiguration(store,session,context,config);}
   if((scenario.analysis||scenario.input.rule_context)&&!evidence.verify(scenario).verified)fail('La evidencia o solución no coincide; revisa y reoptimiza.',409);
   for(const item of scenario.input.vehicles){const vehicle=await scopedReference(store,session,context,'soi_vehicles','vehicle_id',item.vehicle_id,'Vehículo');if(vehicle.status!=='available'||vehicle.capacity_unit==='kg'&&item.capacity_kg>vehicle.capacity||item.resource_snapshot&&(vehicle.capacity_unit!==item.resource_snapshot.capacity_unit||vehicle.capacity!==item.resource_snapshot.capacity))fail('Un vehículo cambió o ya no está disponible; reoptimiza.',409);}
   for(const item of scenario.input.nodes){const asset=await scopedReference(store,session,context,'soi_assets','location_id',item.asset_id,'Activo');if(asset.geometry?.type!=='Point'||hash(asset.geometry.coordinates)!==hash(item.coordinates))fail('La ubicación de un punto cambió; reoptimiza antes de aprobar.',409);}
   if(scenario.analysis_run_id)await require('./businessRules.service').createBusinessRulesService(infrastructure).assertFreshnessIn(store,session,context,scenario.analysis_run_id);
   const record=await store.collection('soi_optimization_scenarios').findOneAndUpdate(filter,{$set:{state:'APPROVED',approved_at:new Date(),approved_by:context.userId},$inc:{revision:1}},{session,returnDocument:'after',includeResultMetadata:false});
   await sanitary.event(store,session,context,'optimization.approved',record.record_id,record.revision);return clean(record);
  });
 }
 async function predict(context,input,options){
  object(input);sanitary.writer(context);await sanitary.capability(context,'predictive');
  if(!['forecast','anomalies'].includes(input.operation)||typeof input.name!=='string'||!input.name.trim()||input.name.length>200)fail('Declara nombre y operación forecast/anomalies.');
  let history=input.history,unit=input.unit,source=input.source;
  if(!input.sensor_id){object(source);if(typeof unit!=='string'||!unit.trim()||unit.length>64||typeof source.name!=='string'||!source.name.trim()||source.name.length>1000||!['measured','estimated','simulated'].includes(source.data_kind))fail('La serie importada requiere unidad, fuente y naturaleza measured/estimated/simulated.');source={name:source.name.trim(),data_kind:source.data_kind,verification:'ORGANIZATION_DECLARED_NOT_INDEPENDENTLY_VERIFIED'};}
  if(input.sensor_id){
   await sanitary.capability(context,'monitoring');const store=await db();const sensor=await store.collection('soi_sensors').findOne({...sanitary.scope(context),record_id:identifier(input.sensor_id)});if(!sensor)fail('Sensor no disponible.',404);
   const rows=await store.collection('soi_measurements').find({...sanitary.scope(context),sensor_id:sensor.record_id,data_kind:'measured',quality:{$ne:'invalid'},voided_at:{$exists:false}}).sort({observed_at:1}).limit(1001).toArray();if(rows.length>1000)fail('Acota la serie a 1000 observaciones.',413);
   history=rows.map(row=>({time:new Date(row.observed_at).toISOString(),value:row.value}));unit=sensor.unit;source={name:`SOI sensor ${sensor.record_id}`,data_kind:'measured',verification:'ORGANIZATION_DECLARED',version:hash(rows.map(row=>[row.record_id,row.observed_at,row.value]))};
  }
  const payload={operation:input.operation,history,unit,source,...Object.fromEntries(['horizon','lags','ridge_alpha','allow_exploratory','threshold'].filter(key=>input[key]!==undefined).map(key=>[key,input[key]]))};
  return execute(context,'prediction-runs',input.name.trim(),payload,options);
 }
 async function compare(context,scenarioId,executionId){
  const scenario=await sanitary.get(context,'optimization-scenarios',scenarioId),execution=await sanitary.get(context,'route-executions',executionId);
  const proposed=scenario.result?.result?.routes?.find(route=>String(route.vehicle_id)===String(execution.vehicle_id));if(!proposed)fail('El escenario no incluye el vehículo ejecutado.',409);
  const delta=(value,baseline)=>baseline>0&&value!=null?100*(value-baseline)/baseline:null;
  return{planned:{distance_m:execution.planned_distance_m},executed:{distance_m:execution.distance_m,duration_s:execution.duration_s,fuel_l:execution.fuel_l,data_kind:execution.data_kind,source:execution.source,served:execution.served_asset_ids,omitted:execution.omitted_asset_ids,compliance_percent:execution.compliance_percent},proposed:{distance_m:proposed.distance_m,duration_s:proposed.duration_s,estimated_cost:proposed.cost,estimated_kgco2e:proposed.estimated_kgco2e},difference_percent:{proposed_vs_executed_distance:delta(proposed.distance_m,execution.distance_m),proposed_vs_executed_duration:delta(proposed.duration_s,execution.duration_s),executed_vs_planned_distance:delta(execution.distance_m,execution.planned_distance_m)},interpretation:'Las diferencias propuestas son proyecciones; no acreditan ahorros obtenidos ni resultados de ejecución.'};
 }
 async function dashboard(context,query={},storeOverride,session){
  const store=storeOverride||await db();const config=await store.collection('soi_configuration').findOne(sanitary.scope(context),{session});const capabilities=config?.capabilities||['assets','operations'];
  const output={calculated_at:new Date().toISOString(),organization_id:context.organizationId,capabilities,filters:{from:query.from||null,until:query.until||null},metrics:{},sensor_status:[],limitations:[]};
  const rows=async(kind,dateField)=>{const spec=sanitary.definition(kind);if(!capabilities.includes(spec.capability))return[];const filter={...sanitary.scope(context),voided_at:{$exists:false}};if(dateField&&(query.from||query.until))filter[dateField]={...(query.from?{$gte:timestamp(query.from,'from')}:{}),...(query.until?{$lt:timestamp(query.until,'until')}:{})};
   const result=await store.collection(spec.collection).find(filter,{session}).limit(5001).toArray();if(result.length>5000)fail('El informe supera 5000 registros por dominio; acota fechas.',413);return result;};
  const movements=await rows('waste-movements','occurred_at');const mass={measured:0,estimated:0,simulated:0};const cost={};
  for(const item of movements.filter(row=>row.status==='completed')){if(item.quantity_kg!=null)mass[item.data_kind]+=item.quantity_kg;else output.limitations.push('Un movimiento de volumen se excluye de los totales de masa; no se asume densidad.');if(item.cost!=null){const key=`${item.currency}:${item.data_kind}`;cost[key]=(cost[key]||0)+item.cost;}}
  output.metrics.waste_mass_kg_by_kind=mass;output.metrics.declared_cost_by_currency_and_kind=cost;
  const carbon=await rows('carbon-entries','occurred_at');const emissions={};for(const entry of carbon){const key=`scope_${entry.scope}:${entry.calculation.result_kind}`;emissions[key]=(emissions[key]||0)+entry.kgco2e;}
  output.metrics.emissions_kgco2e_by_scope_and_kind=emissions;
  const alerts=await rows('alerts');output.metrics.open_alerts=alerts.filter(row=>['open','acknowledged'].includes(row.status)).length;
  const sensors=await rows('sensors');for(const sensor of sensors)output.sensor_status.push({record_id:sensor.record_id,name:sensor.name,variable:sensor.variable,unit:sensor.unit,latest_value:sensor.latest_value??null,data_kind:sensor.latest_data_kind||null,observed_at:sensor.latest_observed_at||null,connection_status:sensor.status!=='active'?sensor.status:!sensor.latest_observed_at?'NO_MEASUREMENTS':Date.now()-new Date(sensor.latest_observed_at).getTime()>sensor.expected_interval_s*2000?'STALE':'RECENT'});
  const inspections=await rows('inspections','occurred_at');output.metrics.sanitation_inspections=inspections.length;
  const networks=await rows('networks');output.metrics.maintenance_due_networks=networks.filter(row=>row.maintenance_due_at&&new Date(row.maintenance_due_at)<new Date()).length;
  output.limitations=[...new Set([...output.limitations,'Las fuentes y factores son declarados; los indicadores no certifican cumplimiento regulatorio.','Sin telemetría autorizada no se afirma ubicación de flota en vivo.'])];return output;
 }
 async function report(context,input={}){
  sanitary.writer(context);await sanitary.capability(context,'reporting');if(typeof input.name!=='string'||!input.name.trim()||input.name.length>200)fail('El informe requiere nombre.');
  return infrastructure.withMongoTransaction(async(store,session)=>{const snapshot=await dashboard(context,input,store,session);const record={...sanitary.scope(context),record_id:await infrastructure.nextId('soi_sanitary_reports',session),name:input.name.trim(),snapshot,snapshot_sha256:hash(snapshot),created_at:new Date(),created_by:context.userId,revision:1};await store.collection('soi_sanitary_reports').insertOne(record,{session});await sanitary.event(store,session,context,'report.created',record.record_id,1);return clean(record);});
 }
 async function climate(context,input){
  sanitary.writer(context);await sanitary.capability(context,'climate');object(input);const store=await db();const route=await store.collection('soi_route_plans').findOne({...sanitary.scope(context),route_plan_id:identifier(input.route_plan_id)});if(!route)fail('Ruta no disponible.',404);
  const threshold=Number(input.daily_rain_threshold_mm);if(!Number.isFinite(threshold)||threshold<0||threshold>1000)fail('Declara un umbral diario de lluvia entre 0 y 1000 mm.');
  const points=route.coordinates||route.result?.requestedCoordinates;if(!Array.isArray(points)||points.length<2)fail('La ruta no contiene puntos de consulta.',409);
  const chosen=[points[0],points[Math.floor(points.length/2)],points.at(-1)].filter((point,i,all)=>all.findIndex(candidate=>JSON.stringify(candidate)===JSON.stringify(point))===i);
  const samples=[];for(const point of chosen){try{const result=await weather(point[1],point[0]);const unit=result.dailyUnits?.precipitation_sum;if(result.status!=='available'||unit!=='mm')throw new Error('WEATHER_UNAVAILABLE');
    const days=(result.daily?.time||[]).map((date,index)=>({date,precipitation_mm:result.daily.precipitation_sum?.[index]??null}));
    samples.push({coordinates:point,status:'available',source:result.source,valid_at:result.validAt,queried_at:result.fetchedAt,current:result.current,current_units:result.units,daily:days,threshold_exceeded:days.some(day=>typeof day.precipitation_mm==='number'&&day.precipitation_mm>=threshold),data_kind:'forecast'});
   }catch{samples.push({coordinates:point,status:'unavailable',threshold_exceeded:null});}}
  return infrastructure.withMongoTransaction(async(transactionDb,session)=>{const record={...sanitary.scope(context),record_id:await infrastructure.nextId('soi_climate_assessments',session),name:`Clima · ${route.name}`,route_plan_id:route.route_plan_id,operation_id:route.operation_id||null,status:samples.every(sample=>sample.status==='unavailable')?'unavailable':samples.some(sample=>sample.status==='unavailable')?'partial':'available',daily_rain_threshold_mm:threshold,samples,potentially_affected:samples.some(sample=>sample.threshold_exceeded===true),created_by:context.userId,created_at:new Date(),revision:1,interpretation:'Exposición operacional muestreada con pronóstico y umbral declarado. No es alerta meteorológica oficial, modelo hidráulico ni predicción de inundación.'};
   await transactionDb.collection('soi_climate_assessments').insertOne(record,{session});await sanitary.event(transactionDb,session,context,'climate.assessed',record.record_id,1);return clean(record);});
 }
 async function coverage(context,input){
  await sanitary.capability(context,'assets');await sanitary.capability(context,'operations');object(input);const store=await db();
  const zone=await store.collection('soi_assets').findOne({...sanitary.scope(context),location_id:identifier(input.zone_asset_id),'metadata.archived':{$ne:true}});if(!zone||!['Polygon','MultiPolygon'].includes(zone.geometry?.type))fail('Selecciona una zona poligonal de esta organización.',404);
  const execution=await sanitary.get(context,'route-executions',input.execution_id);const {pointInPolygon}=require('../spatial/core');
  const polygons=zone.geometry.type==='Polygon'?[zone.geometry.coordinates]:zone.geometry.coordinates;
  const assets=await store.collection('soi_assets').find({...sanitary.scope(context),'metadata.archived':{$ne:true}}).limit(5001).toArray();if(assets.length>5000)fail('La consulta de cobertura supera 5000 activos.',413);
  const points=assets.filter(asset=>asset.geometry?.type==='Point').filter(asset=>{const p={lng:asset.geometry.coordinates[0],lat:asset.geometry.coordinates[1]};return polygons.some(polygon=>pointInPolygon(p,polygon[0])&&!polygon.slice(1).some(hole=>pointInPolygon(p,hole)));});
  const served=new Set(execution.served_asset_ids);const count=points.filter(asset=>served.has(asset.location_id)).length;
  return{zone_id:zone.location_id,execution_id:execution.record_id,inventory_points:points.length,served_points:count,coverage_percent:points.length?100*count/points.length:null,data_kind:execution.data_kind,geojson:{type:'FeatureCollection',features:[{type:'Feature',id:`zone:${zone.location_id}`,geometry:zone.geometry,properties:{name:zone.name}},...points.map(asset=>({type:'Feature',id:asset.location_id,geometry:asset.geometry,properties:{name:asset.name,served:served.has(asset.location_id)}}))]},limitation:'Cobertura del inventario puntual registrado en la zona; no representa cobertura poblacional ni áreas de servicio por tiempo de viaje.'};
 }
 return{optimize,prepareOptimization,approve,verify,exportScenario,reproduce,predict,compare,dashboard,report,climate,coverage,retry,cancel};
}
module.exports={createSanitaryAnalytics,service:createSanitaryAnalytics()};
