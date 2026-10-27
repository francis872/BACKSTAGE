const ApiError=require('../utils/ApiError');
const {createSanitaryService,identifier}=require('./soiSanitary.service');
const {createFleetService}=require('./soiFleet.service');
const fail=(message,status=400)=>{throw new ApiError(status,message);};
function createSanitaryIntegrations(infrastructure=require('../infrastructure/soiMongo'),{env=process.env,fetchImpl=fetch,now=Date.now,fleet}={}){
 const sanitary=createSanitaryService(infrastructure);
 const fleetService=fleet||createFleetService();
 function configured(context,integration){
  const key=integration.configuration_key;if(!/^SOI_CONNECTOR_[A-Z0-9_]+$/.test(key)||key.endsWith('_TOKEN'))fail('La clave de conexión debe identificar una configuración SOI_CONNECTOR del servidor.');
  if(!env[key])return null;let value;try{value=JSON.parse(env[key]);}catch{fail('La configuración del conector no es válida.',503);}
  if(Number(value.organization_id)!==Number(context.organizationId)||value.provider!==integration.provider)fail('La configuración no está autorizada para esta organización.',403);
  let url;try{url=new URL(value.url);}catch{fail('El endpoint autorizado no es válido.',503);}
  if(url.protocol!=='https:'||url.username||url.password)fail('La conexión requiere HTTPS y credenciales separadas.',503);
  if(integration.provider==='industrial_readonly'&&value.read_only_authorized!==true)fail('El adaptador industrial necesita autorización explícita de lectura.',403);
  if(value.token_env&&!/^SOI_CONNECTOR_[A-Z0-9_]+_TOKEN$/.test(value.token_env))fail('Referencia de secreto no permitida.',503);
  const token=value.token_env?env[value.token_env]:null;if(value.token_env&&!token)return null;
  return{...value,url,token};
 }
 async function status(context,integrationId){const integration=await sanitary.get(context,'integrations',integrationId);const config=configured(context,integration);return{record_id:integration.record_id,provider:integration.provider,status:integration.status==='disabled'?'disabled':config?(integration.last_sync_at?'last_sync_succeeded':'configured_not_yet_verified'):'not_configured',last_sync_at:integration.last_sync_at||null,last_result:integration.last_result||null,read_only:true,live_connection_verified:!!config&&integration.status!=='disabled'&&!!integration.last_sync_at};}
 async function sync(context,integrationId){
  sanitary.writer(context,true);const integration=await sanitary.get(context,'integrations',integrationId);if(integration.status==='disabled')fail('La integración está desactivada.',409);
  const config=configured(context,integration);if(!config)fail('Faltan endpoint o credenciales autorizadas del conector.',503);
  const url=integration.provider==='traccar'?new URL('/api/positions',config.url):config.url;
  let response;try{response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json',...(config.token?{Authorization:`Bearer ${config.token}`}:{})}});}catch{fail('El proveedor no respondió a la consulta de solo lectura.',503);}
  if(!response.ok)fail('El proveedor rechazó la consulta o no está disponible.',503);if(Number(response.headers?.get?.('content-length')||0)>3000000)fail('La respuesta del conector supera 3 MB.',413);
  const text=await response.text();if(text.length>3000000)fail('La respuesta del conector supera 3 MB.',413);let payload;try{payload=JSON.parse(text);}catch{fail('El proveedor no devolvió JSON válido.',503);}
  const result={accepted:0,skipped:0,provider:integration.provider,read_only:true,skipped_reasons:{},queried_at:new Date(now()).toISOString()};
  const skip=reason=>{result.skipped++;result.skipped_reasons[reason]=(result.skipped_reasons[reason]||0)+1;};
  if(integration.provider==='traccar'){
   await sanitary.capability(context,'fleet');if(!Array.isArray(payload)||payload.length>1000)fail('Formato Traccar inválido o superior a 1000 posiciones.',422);
   if(!config.fleet_source_id||!config.device_map||typeof config.device_map!=='object')fail('Mapea dispositivos y una fuente de flota autorizada.',503);
   for(const row of payload){
    if(!row||typeof row!=='object'||!['number','string'].includes(typeof row.id)||!String(row.id)){skip('invalid_event_id');continue;}
    const vehicleId=config.device_map[String(row.deviceId)];if(!vehicleId){skip('unmapped_device');continue;}
    const date=row.fixTime||row.deviceTime;const accuracy=row.accuracy??row.attributes?.accuracy;
    if(row.valid===false||!Number.isFinite(accuracy)||accuracy<=0||accuracy>100){skip('unknown_or_invalid_accuracy');continue;}
    if(!Number.isFinite(Date.parse(date))||Math.abs(now()-Date.parse(date))>60000){skip('stale_position');continue;}
    const position={event_id:`traccar:${row.id}`,longitude:row.longitude,latitude:row.latitude,accuracy_m:accuracy,recorded_at:date,...(Number.isFinite(row.speed)&&row.speed>=0?{speed_mps:row.speed*.514444444}:{}) ,...(Number.isFinite(row.course)?{heading_deg:row.course}:{}),...(typeof row.attributes?.ignition==='boolean'?{ignition:row.attributes.ignition}:{})};
    await fleetService.ingest(context.organizationId,context.userId,identifier(vehicleId),{source_id:identifier(config.fleet_source_id),consent:true,positions:[position]});result.accepted++;
   }
  }else{
   await sanitary.capability(context,'monitoring');const records=payload.observations;if(!Array.isArray(records)||records.length>1000)fail('El contrato requiere observations con máximo 1000 lecturas.',422);
   if(!config.sensor_map||typeof config.sensor_map!=='object')fail('Configura el mapeo de sensores del conector.',503);
   for(const row of records){if(!row||typeof row!=='object'||typeof row.event_id!=='string'||!row.event_id.trim())fail('Cada lectura del conector requiere un event_id válido.',422);const sensorId=config.sensor_map[String(row.sensor_key)];if(!sensorId){skip('unmapped_sensor');continue;}
    await sanitary.create(context,'measurements',{event_id:`${integration.record_id}:${row.event_id}`,sensor_id:identifier(sensorId),value:row.value,unit:row.unit,observed_at:row.observed_at,data_kind:row.data_kind,source:integration.name,method:row.method,quality:row.quality||'unassessed'});result.accepted++;
   }
  }
  const store=await infrastructure.getMongoDatabase();await store.collection('soi_sanitary_integrations').updateOne({...sanitary.scope(context),record_id:integration.record_id},{$set:{last_sync_at:new Date(now()),last_result:result,updated_at:new Date()},$inc:{revision:1}});return result;
 }
 return{status,sync};
}
module.exports={createSanitaryIntegrations,service:createSanitaryIntegrations()};
