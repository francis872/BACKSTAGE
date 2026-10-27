const crypto=require('node:crypto');
const C=require('../domain/computationalContract');
const {appendPlatformAudit}=require('../services/platformAudit.service');
const {currentActor}=require('../services/resourceAuthorization.service');
const KIND='bco.workflow',LEASE_MS=45000;
function createComputationalRepository(infrastructure){
 const infra=()=>infrastructure||require('../infrastructure/platformMongo');
 const transaction=work=>infra().withMongoTransaction(work);
 const database=()=>infra().getMongoDatabase();
 const actor=currentActor;
 const filter=(org,id)=>({kind:KIND,organization_id:C.identifier(org),analytics_job_id:C.identifier(id)});
 async function get(db,session,org,id,now=Date.now()){const row=await db.collection('analytics_jobs').findOne({...filter(org,id),archived:{$ne:true},expires_at:{$gt:new Date(now)}},{session});if(!row)C.fail('Ejecución no encontrada.',404);return row;}
 async function save(db,session,row,fields,now){const result=await db.collection('analytics_jobs').updateOne({...filter(row.organization_id,row.analytics_job_id),revision:row.revision},{$set:{...fields,updated_at:new Date(now)},$inc:{revision:1}},{session});if(result.matchedCount!==1)C.fail('La ejecución cambió; vuelve a consultarla.',409);return {...row,...fields,updated_at:new Date(now),revision:row.revision+1};}
 async function event(db,session,row,type,now,{actorId=row.created_by,actorType='user'}={}){
  const allowed=['created','updated','queued','running','completed','failed','cancelled','timed_out','retry_pending','archived','defense_approved'];if(!allowed.includes(type))throw Error('Unregistered computational event');
  const labels={created:'creado',updated:'actualizado',queued:'en cola',retry_pending:'pendiente de reintento',running:'en ejecución',completed:'completado',failed:'fallido',cancelled:'cancelado',timed_out:'tiempo agotado',archived:'archivado',defense_approved:'propuesta revisada'};
  const event={operational_event_id:await infra().nextId('operational_events',session),organization_id:row.organization_id,analysis_run_id:row.project_id||null,actor_user_id:actorId,event_type:`bco.workflow.${type}`,event_version:1,correlation_id:row.correlation_id,severity:['failed','timed_out'].includes(type)?'warning':'info',title:`Cálculo ${labels[type]}`,payload:{analytics_job_id:row.analytics_job_id,revision:row.revision,input_sha256:row.input_sha256,actor_type:actorType},created_at:new Date(now),resolved_at:null,outbox:{state:'PENDING',attempts:0,next_attempt_at:new Date(now),delivery_id:crypto.randomUUID()}};
  await db.collection('operational_events').insertOne(event,{session});
  await appendPlatformAudit(infra(),db,session,{organizationId:row.organization_id,userId:actorId},event.event_type,'analytics_jobs',row.analytics_job_id,{revision:row.revision,input_sha256:row.input_sha256,correlation_id:row.correlation_id,actor_type:actorType,requested_by_user_id:row.created_by});return event;
 }
 async function lock(db,session,key,owner,now){
  const row=await db.collection('soi_provider_locks').findOne({_id:key},{session});if(row?.lease_until>new Date(now))return false;
  if(row){const updated=await db.collection('soi_provider_locks').updateOne({_id:key,lease_until:{$lte:new Date(now)}},{$set:{owner,lease_until:new Date(now+LEASE_MS)}},{session});return updated.matchedCount===1;}
  await db.collection('soi_provider_locks').insertOne({_id:key,owner,lease_until:new Date(now+LEASE_MS)},{session});return true;
 }
 async function claim({organizationId,jobId,recoveryBackoffMs=0,now:clock=Date.now}={}){
  C.integer(recoveryBackoffMs,0,60000,'Backoff de recuperación');
  const currentTime=()=>typeof clock==='function'?clock():clock;const initial=currentTime();
  const db=await database();const candidates=await db.collection('analytics_jobs').find({kind:KIND,archived:{$ne:true},expires_at:{$gt:new Date(initial)},...(organizationId?{organization_id:C.identifier(organizationId)}:{}),...(jobId?{analytics_job_id:C.identifier(jobId)}:{}),$or:[{status:'QUEUED'},{status:'RETRY_PENDING',next_attempt_at:{$lte:new Date(initial)}},{status:'RUNNING',lease_until:{$lte:new Date(initial)}}]},{projection:{organization_id:1,analytics_job_id:1}}).sort({priority:-1,created_at:1}).limit(20).toArray();
  for(const candidate of candidates){try{const claimed=await transaction(async(store,session)=>{
   const now=currentTime();
   const row=await get(store,session,candidate.organization_id,candidate.analytics_job_id,now);if(!(row.status==='QUEUED'||row.status==='RETRY_PENDING'&&row.next_attempt_at<=new Date(now)||row.status==='RUNNING'&&row.lease_until<=new Date(now)))return null;
   if(row.attempts>=3){const failed=await save(store,session,row,{status:'FAILED',tasks:row.tasks.map(t=>t.state==='COMPLETED'?t:{...t,state:'CANCELLED',error:{code:'ATTEMPTS_EXHAUSTED'}}),error:{code:'ATTEMPTS_EXHAUSTED'},worker_owner:null,lease_until:null,completed_at:new Date(now)},now);await event(store,session,failed,'failed',now,{actorType:'worker_on_behalf_of_creator'});return null;}
   if(row.status==='RUNNING'&&recoveryBackoffMs){const delayed=await save(store,session,row,{status:'RETRY_PENDING',next_attempt_at:new Date(now+Math.min(60000,recoveryBackoffMs*2**Math.max(0,row.attempts-1))),worker_owner:null,lease_until:null,error:{code:'EXPIRED_EXECUTION_LEASE'}},now);await event(store,session,delayed,'retry_pending',now,{actorType:'worker_recovery'});return null;}
   const owner=crypto.randomUUID();let slot=null;
   for(let i=0;i<2;i++){if(await lock(store,session,`bco:slot:${i}`,owner,now)){slot=i;break;}}if(slot===null)return null;
   if(!await lock(store,session,`bco:organization:${row.organization_id}`,owner,now))C.fail('Organización ocupada.',429);
   const tasks=row.tasks.map(t=>t.state==='COMPLETED'?t:{...t,state:'PENDING',result:null,error:null});
   const running=await save(store,session,row,{status:'RUNNING',attempts:row.attempts+1,worker_owner:owner,slot,lease_until:new Date(now+LEASE_MS),tasks,started_at:row.started_at||new Date(now)},now);await event(store,session,running,'running',now,{actorType:'worker_on_behalf_of_creator'});return running;
  });if(claimed)return claimed;}catch(error){if(error.code===11000||error.statusCode===429||error.statusCode===409||error.statusCode===404)continue;throw error;}}
  return null;
 }
 async function renew(row,clock=Date.now){return transaction(async(db,session)=>{
  const now=typeof clock==='function'?clock():clock;
  const current=await db.collection('analytics_jobs').findOne({...filter(row.organization_id,row.analytics_job_id),status:'RUNNING',worker_owner:row.worker_owner,lease_until:{$gt:new Date(now)},expires_at:{$gt:new Date(now)}},{session,projection:{analytics_job_id:1}});if(!current)return false;
  C.authorize('create',await actor(db,session,{organizationId:row.organization_id,userId:row.created_by}));
  for(const key of[`bco:slot:${row.slot}`,`bco:organization:${row.organization_id}`]){const r=await db.collection('soi_provider_locks').updateOne({_id:key,owner:row.worker_owner,lease_until:{$gt:new Date(now)}},{$set:{lease_until:new Date(now+LEASE_MS)}},{session});if(r.matchedCount!==1)C.fail('Se perdió el lease de ejecución.',409);}
  await db.collection('analytics_jobs').updateOne({...filter(row.organization_id,row.analytics_job_id),worker_owner:row.worker_owner},{$set:{lease_until:new Date(now+LEASE_MS)}},{session});return true;
 });}
 async function stillRunning(row,clock=Date.now){const now=typeof clock==='function'?clock():clock;return Boolean(await(await database()).collection('analytics_jobs').findOne({...filter(row.organization_id,row.analytics_job_id),status:'RUNNING',worker_owner:row.worker_owner,expires_at:{$gt:new Date(now)},lease_until:{$gt:new Date(now)}},{projection:{analytics_job_id:1}}));}
 async function release(row,now){const db=await database();for(const key of[`bco:slot:${row.slot}`,`bco:organization:${row.organization_id}`])await db.collection('soi_provider_locks').updateOne({_id:key,owner:row.worker_owner},{$set:{owner:null,lease_until:new Date(now)}});}
 return {infra,transaction,database,actor,filter,get,save,event,claim,renew,stillRunning,release};
}
module.exports={createComputationalRepository,KIND,LEASE_MS};
