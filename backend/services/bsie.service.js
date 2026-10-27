const { spawn }=require('node:child_process');
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const ApiError=require('../utils/ApiError');
const ENGINE=path.resolve(__dirname,'../../bsie/engine.py');
const localPython=path.resolve(__dirname,'../../.venv-bsie',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const OPERATIONS=['validate','weights','recommend','moran','local_moran','gi_star','kde','temporal','regression'];
const active=new Map();let activeCount=0;
const id=value=>{if(!['string','number'].includes(typeof value)||!Number.isSafeInteger(Number(value))||Number(value)<=0)throw new ApiError(400,'Identificador inválido.');return Number(value);};
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
function requestHash(payload){return crypto.createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');}
function validateRequest(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||!OPERATIONS.includes(payload.operation))throw new ApiError(400,'Operación BSIE inválida.');
 if(Buffer.byteLength(JSON.stringify(payload))>4000000)throw new ApiError(413,'BSIE admite solicitudes de hasta 4 MB.');
 return payload;
}
function executePython(payload,options={}){validateRequest(payload);return executeEngine(payload,options,ENGINE);}
function executeSoiPython(payload,options={}){if(!payload||!['optimize_routes','forecast','anomalies'].includes(payload.operation)||Buffer.byteLength(JSON.stringify(payload))>4000000)throw new ApiError(400,'Solicitud científica sanitaria inválida.');return executeEngine(payload,options,path.resolve(__dirname,'../../sanitary/engine.py'));}
function executeEngine(payload,{signal,organizationId='worker',timeoutMs=30000}={},entry=ENGINE){
 if(activeCount>=2||active.has(String(organizationId)))throw new ApiError(429,'Capacidad BSIE ocupada; espera o utiliza un trabajo en cola.');
 if(process.env.SOI_SCIENCE_RPC_URL){
  activeCount++;active.set(String(organizationId),true);
  return require('./scientificRpc.service').executeRemote(entry===ENGINE?'bsie':'sanitary',payload,{signal,organizationId,timeoutMs}).finally(()=>{activeCount--;active.delete(String(organizationId));});
 }
 const python=process.env.BSIE_PYTHON||(fs.existsSync(localPython)?localPython:'python');
 return new Promise((resolve,reject)=>{
  let settled=false,stdout='',stderr='';
  activeCount++;active.set(String(organizationId),true);
  const child=spawn(python,[entry],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1',OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',MKL_NUM_THREADS:'1',PROJ_NETWORK:'OFF'}});
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);activeCount--;active.delete(String(organizationId));if(error)reject(error);else resolve(result);};
  const cancel=()=>{child.kill();finish(new ApiError(409,'Análisis cancelado.'));};
  const timer=setTimeout(()=>{child.kill();finish(new ApiError(408,'BSIE superó el límite de 30 segundos. Reduce datos o permutaciones.'));},timeoutMs);
  if(signal?.aborted)return cancel();signal?.addEventListener('abort',cancel,{once:true});
  child.on('error',()=>finish(new ApiError(503,'Python BSIE no está disponible. Instala bsie/requirements.txt y configura BSIE_PYTHON.')));
  child.stdout.on('data',chunk=>{stdout+=chunk;if(Buffer.byteLength(stdout)>16000000){child.kill();finish(new ApiError(413,'El resultado BSIE supera 16 MB.'));}});
  child.stderr.on('data',chunk=>{if(stderr.length<32000)stderr+=chunk;});
  child.stdin.on('error',()=>{});
  child.on('close',code=>{if(settled)return;let output;try{output=JSON.parse(stdout);}catch{return finish(new ApiError(503,'El entorno científico no devolvió un resultado válido. Verifica sus dependencias.'));}if(code!==0||!output.ok)return finish(new ApiError(422,output.error||'La validación científica rechazó el análisis.'));finish(null,output.result);});
  child.stdin.end(JSON.stringify(payload));
 });
}
function createBsieService(infrastructure=require('../infrastructure/platformMongo'),runner=executePython){
 const scope=context=>({organization_id:id(context.organizationId)});
 const writer=context=>{scope(context);if(!['admin','analyst'].includes(context.role))throw new ApiError(403,'El análisis requiere rol de analista o administrador.');};
 const db=infrastructure.getMongoDatabase,clean=infrastructure.cleanDocument;
 async function prepare(context,input){
  writer(context);if(!input||typeof input!=='object'||Array.isArray(input))throw new ApiError(400,'Solicitud inválida.');
  const payload=structuredClone(input);delete payload.organization_id;delete payload.user_id;
  if(payload.dataset){
   const kind=payload.dataset.kind;if(!['assets','incidents'].includes(kind))throw new ApiError(400,'Dataset permitido: assets o incidents.');
   const store=await db();const config=await store.collection('soi_configuration').findOne(scope(context));
   if(!(config?.capabilities||['assets','operations']).includes(kind))throw new ApiError(409,'La capacidad del dataset está deshabilitada.');
   const records=await store.collection(kind==='assets'?'soi_assets':'soi_incidents').find({...scope(context),'metadata.archived':{$ne:true}}).sort({[kind==='assets'?'location_id':'incident_id']:1}).limit(1001).toArray();
   if(records.length>1000)throw new ApiError(413,'Acota el dataset a un máximo de 1000 observaciones.');
   payload.data={type:'FeatureCollection',features:records.map(row=>({type:'Feature',id:String(row.location_id||row.incident_id),geometry:row.geometry||row.metadata?.geometry,properties:{capacity:row.capacity??null,...row.metadata?.metrics}}))};
   payload.source={name:`SOI ${kind}`,version:requestHash(records.map(row=>[row.location_id||row.incident_id,row.updated_at||row.created_at])),type:'ORGANIZATION_PROVIDED',verified:false};delete payload.dataset;
  }
  validateRequest(payload);return payload;
 }
 async function compute(context,input,options={}){
  const payload=await prepare(context,input);const hash=requestHash({algorithm_version:'bsie-1.1.0',payload});
  if(payload.operation==='weights'){
   const cached=await(await db()).collection('bsie_weights').findOne({...scope(context),request_hash:hash,expires_at:{$gt:new Date()}});
   if(cached)return{...cached.result,cache:{hit:true,request_hash:hash}};
  }
  const result={...await runner(payload,{...options,organizationId:context.organizationId}),analysis_id:crypto.randomUUID(),executed_at:new Date().toISOString()};
  if(payload.operation==='weights')await infrastructure.withMongoTransaction(async(store,session)=>store.collection('bsie_weights').updateOne({...scope(context),request_hash:hash},{$set:{result,expires_at:new Date(Date.now()+7*86400000)}},{upsert:true,session}));
  return result;
 }
 async function enqueue(context,input){
  const payload=await prepare(context,input),hash=requestHash({algorithm_version:'bsie-1.1.0',payload});
  return infrastructure.withMongoTransaction(async(store,session)=>{
   const filter={...scope(context),request_hash:hash};const existing=await store.collection('bsie_jobs').findOne(filter,{session});if(existing&&existing.expires_at>new Date())return publicJob(existing);
   if(existing)await store.collection('bsie_jobs').deleteMany({...filter,expires_at:{$lte:new Date()}},{session});
   const pending=await store.collection('bsie_jobs').countDocuments({...scope(context),state:{$in:['QUEUED','RUNNING']}},{session});if(pending>=3)throw new ApiError(429,'Máximo tres trabajos pendientes por organización.');
   const job={...filter,job_id:await infrastructure.nextId('bsie_jobs',session),created_by:id(context.userId),input:payload,state:'QUEUED',attempts:0,created_at:new Date(),updated_at:new Date(),expires_at:new Date(Date.now()+30*86400000),algorithm_version:'bsie-1.1.0'};
   await store.collection('bsie_jobs').insertOne(job,{session});return publicJob(job);
  });
 }
 function publicJob(job){const{input,_id,...value}=job;return value;}
 async function getJob(context,jobId){const row=await(await db()).collection('bsie_jobs').findOne({...scope(context),job_id:id(jobId),expires_at:{$gt:new Date()}});if(!row)throw new ApiError(404,'Análisis no disponible en esta organización.');return publicJob(row);}
 async function list(context){return(await(await db()).collection('bsie_jobs').find({...scope(context),expires_at:{$gt:new Date()}},{projection:{input:0,result:0}}).sort({job_id:-1}).limit(100).toArray()).map(row=>{const {result,...job}=publicJob(row);return job;});}
 async function cancel(context,jobId){writer(context);const row=await(await db()).collection('bsie_jobs').findOneAndUpdate({...scope(context),job_id:id(jobId),expires_at:{$gt:new Date()},state:{$in:['QUEUED','RUNNING']}},{$set:{state:'CANCELLED',updated_at:new Date()}},{returnDocument:'after',includeResultMetadata:false});if(!row)throw new ApiError(409,'El trabajo no puede cancelarse.');return publicJob(row);}
 async function retry(context,jobId){writer(context);const row=await(await db()).collection('bsie_jobs').findOneAndUpdate({...scope(context),job_id:id(jobId),expires_at:{$gt:new Date()},state:{$in:['FAILED','CANCELLED']},attempts:{$lt:3}},{$set:{state:'QUEUED',updated_at:new Date()},$unset:{error:'',result:'',lease_until:'',worker_id:''}},{returnDocument:'after',includeResultMetadata:false});if(!row)throw new ApiError(409,'El trabajo no admite reintento.');return publicJob(row);}
 async function processNext({organizationId,jobId}={}){
  const store=await db(),worker=crypto.randomUUID(),now=new Date();
  const claimScope=organizationId==null?{}:{organization_id:id(organizationId)};if(jobId!=null){if(organizationId==null)throw new ApiError(400,'Un trabajo específico requiere organización.');claimScope.job_id=id(jobId);}
  await store.collection('bsie_jobs').updateMany({...claimScope,state:'RUNNING',lease_until:{$lt:now},attempts:{$gte:3}},{$set:{state:'FAILED',error:'Se agotaron tres intentos de ejecución.',updated_at:now},$unset:{lease_until:'',worker_id:''}});
  const job=await store.collection('bsie_jobs').findOneAndUpdate({...claimScope,expires_at:{$gt:now},attempts:{$lt:3},$or:[{state:'QUEUED'},{state:'RUNNING',lease_until:{$lt:now}}]},{$set:{state:'RUNNING',worker_id:worker,lease_until:new Date(Date.now()+60000),updated_at:now},$inc:{attempts:1}},{sort:{created_at:1},returnDocument:'after',includeResultMetadata:false});
  if(!job)return null;const filter={job_id:job.job_id,organization_id:job.organization_id,state:'RUNNING',worker_id:worker};
  const controller=new AbortController();let checking=false;const timer=setInterval(async()=>{if(checking)return;checking=true;try{const current=await store.collection('bsie_jobs').findOne(filter);if(!current)controller.abort();}catch{controller.abort();}finally{checking=false;}},1000);
  try{const result={...await runner(job.input,{signal:controller.signal,organizationId:job.organization_id}),analysis_id:job.job_id,executed_at:new Date().toISOString()};if(Buffer.byteLength(JSON.stringify(result))>8000000)throw new ApiError(413,'Resultado demasiado grande para persistir; reduce períodos, datos o resolución.');await store.collection('bsie_jobs').updateOne(filter,{$set:{state:'COMPLETED',result,updated_at:new Date()},$unset:{lease_until:'',worker_id:''}});}
  catch(error){await store.collection('bsie_jobs').updateOne(filter,{$set:{state:'FAILED',error:error.statusCode?error.message:'El entorno científico no pudo ejecutar el análisis.',updated_at:new Date()},$unset:{lease_until:'',worker_id:''}});}
  finally{clearInterval(timer);}return job.job_id;
 }
 return{compute,enqueue,getJob,list,cancel,retry,processNext,prepare};
}
module.exports={createBsieService,executePython,executeSoiPython,requestHash,OPERATIONS,service:createBsieService()};
