// Finite, explicitly marked staging acceptance harness around the existing BCO.
const C=require('../domain/computationalContract');
const {appendPlatformAudit}=require('./platformAudit.service');
const CASES=Object.freeze([{id:'known-risk',offset_ms:0},{id:'interruption-recovery',offset_ms:30000},{id:'workflow-timeout',offset_ms:90000},{id:'known-moran',offset_ms:120000},{id:'pc-off-observation',offset_ms:3600000},{id:'capacity-risk',offset_ms:180000}]);
function configuration(env){
 if(env.BACKSTAGE_RUNTIME_ENV!=='staging'||env.BACKSTAGE_AUTOMATION_ENABLED!=='true')throw Error('Automation acceptance is restricted to staging');
 if(!/^auto-\d{14}-[a-f0-9]{8}$/.test(env.BCO_AUTOMATION_RUN_ID||''))throw Error('Invalid automation run');
 if(env.MONGODB_DB!==`backstage_auto_${env.BCO_AUTOMATION_RUN_ID.slice(-8)}`)throw Error('Automation requires its isolated database');
 return {runId:env.BCO_AUTOMATION_RUN_ID,organizationId:C.identifier(env.BCO_SERVICE_ORGANIZATION_ID),userId:C.identifier(env.BCO_SERVICE_USER_ID),database:env.MONGODB_DB};
}
function workflow(caseId){
 const risk={id:'risk',algorithm:'risk.components',parameters:{threat:.5,exposure:.5,vulnerability:.5}};
 const result={name:`SIMULATED AUTONOMY ${caseId}`,retention_days:1,timeout_ms:caseId==='workflow-timeout'?100:120000,tasks:[risk]};
 if(caseId==='known-moran')result.tasks=[{id:'moran',algorithm:'bsie.moran',parameters:{data:{type:'FeatureCollection',features:[[0,0],[.01,0],[0,.01],[.01,.01]].map((coordinates,i)=>({type:'Feature',id:String(i+1),geometry:{type:'Point',coordinates},properties:{value:i+1}}))},source:{name:'SIMULATED autonomous acceptance; not physical observations',type:'SIMULATED',verified:false},variable:'value',weights:{method:'distance_band',distance_m:100000},permutations:19,seed:42}}];
 return result;
}
function createAutomationSchedule({orchestrator,infrastructure,env=process.env,now=Date.now,instanceId=require('node:crypto').randomUUID()}={}){
 const scope=configuration(env),repo=orchestrator.repository;
 async function actor(db,session){
  if(db.databaseName&&db.databaseName!==scope.database)throw Error('Unexpected automation database');
  const a=await repo.actor(db,session,scope),user=await db.collection('identity_users').findOne({user_id:scope.userId},{session});
  if(a.role!=='analyst'||user?.account_type!=='service')C.fail('La automatización requiere su identidad de servicio analista vigente.',403);
  return a;
 }
 async function tick(){
  const db=await infrastructure.getMongoDatabase();await actor(db);
  const key=`automation:schedule:${scope.runId}`,state=await db.collection('soi_provider_locks').findOneAndUpdate({_id:key},{$setOnInsert:{kind:'finite_staging_schedule',run_id:scope.runId,organization_id:scope.organizationId,created_at:new Date(now()),starts_at:new Date(now()+15000),created_by_instance:instanceId,jobs:{},maximum_jobs:CASES.length}},{upsert:true,returnDocument:'after',includeResultMetadata:false});
  if(!state.planned_cases||state.maximum_jobs<CASES.length){
   const previous=state.planned_cases||[];
   state.planned_cases=CASES.map(item=>previous.find(p=>p.case_id===item.id)||{case_id:item.id,scheduled_for:new Date(Math.max(new Date(state.starts_at).getTime()+item.offset_ms,state.jobs?.[item.id]?0:now()+15000)),programmed_at:state.jobs?.[item.id]?state.created_at:new Date(now())});
   await db.collection('soi_provider_locks').updateOne({_id:key,run_id:scope.runId},{$set:{planned_cases:state.planned_cases,maximum_jobs:CASES.length,schedule_version:2}});
  }
  const scheduled=[];
  for(const item of CASES){
   const planned=new Date(state.planned_cases.find(p=>p.case_id===item.id).scheduled_for);
   if(planned>new Date(now()))continue;
   if(state.jobs?.[item.id]){const existing=await orchestrator.get(scope,state.jobs[item.id]);if(existing.status!=='PENDING')continue;}
   const input=workflow(item.id),requestKey=`${scope.runId}:${item.id}`,created=await orchestrator.create(scope,input,requestKey),replay=await orchestrator.create(scope,input,requestKey);
   if(created.run.analytics_job_id!==replay.run.analytics_job_id||replay.created)throw Error('Automation idempotency failed');
   let row=await repo.transaction(async(store,session)=>{
    await actor(store,session);const current=await repo.get(store,session,scope.organizationId,created.run.analytics_job_id,now());
    const metadata={run_id:scope.runId,case_id:item.id,scheduled_for:planned,programmed_at:state.planned_cases.find(p=>p.case_id===item.id).programmed_at,trigger:'deployed_daemon_clock',data_kind:'SIMULATED_OWNED_TEST_FIXTURE',idempotency_replay_verified:true};
    if(current.automation_schedule){if(current.automation_schedule.run_id!==scope.runId||current.automation_schedule.case_id!==item.id)throw Error('Schedule ownership conflict');return current;}
    const saved=await repo.save(store,session,current,{automation_schedule:metadata},now());await repo.event(store,session,saved,'updated',now(),{actorType:'staging_service_scheduler'});return saved;
   });
   if(row.status==='PENDING')try{row=await orchestrator.mutate(scope,row.analytics_job_id,'queue',{revision:row.revision});}catch(error){if(error.statusCode!==409)throw error;}
   await db.collection('soi_provider_locks').updateOne({_id:key},{$set:{[`jobs.${item.id}`]:row.analytics_job_id,last_tick_at:new Date(now())}});
   scheduled.push(row.analytics_job_id);
  }
  return scheduled;
 }
 async function observeClaim(job,{source='vercel_daemon'}={}){
  if(!['vercel_daemon','vercel_function_timeout_probe'].includes(source))throw Error('Invalid execution source');
  if(job.organization_id!==scope.organizationId||job.created_by!==scope.userId||job.automation_schedule?.run_id!==scope.runId)throw Error('Worker cannot acquire a foreign acceptance job');
  const context={instance_id:instanceId,attempt:job.attempts,observed_at:new Date(now()),region:env.VERCEL_REGION||null,deployment_marker:env.BCO_DEPLOYMENT_MARKER||null,source,process_id:process.pid};
  await repo.transaction(async(db,session)=>{
   await actor(db,session);const current=await repo.get(db,session,scope.organizationId,job.analytics_job_id,now());if(current.worker_owner!==job.worker_owner||current.status!=='RUNNING')C.fail('El worker perdió el lease.',409);
   const history=current.execution_contexts||[];if(history.some(x=>x.attempt===job.attempts))return;
   await repo.save(db,session,current,{execution_contexts:[...history,context].slice(-3)},now());
   await appendPlatformAudit(infrastructure,db,session,scope,'automation.execution_observed','analytics_jobs',job.analytics_job_id,{run_id:scope.runId,case_id:job.automation_schedule.case_id,...context});
  });
  return job.automation_schedule.case_id==='interruption-recovery'&&job.attempts===1&&env.BCO_INJECT_STAGING_TERMINATION==='true';
 }
 async function recordResources(id,measurement){
  await repo.transaction(async(db,session)=>{await actor(db,session);const row=await repo.get(db,session,scope.organizationId,id,now());if(row.created_by!==scope.userId||row.automation_schedule?.run_id!==scope.runId)throw Error('Foreign measurement target');
   await repo.save(db,session,row,{last_attempt_resource_sample:measurement},now());
   await appendPlatformAudit(infrastructure,db,session,scope,'automation.resources_sampled','analytics_jobs',id,measurement);
  });
 }
 return {tick,observeClaim,recordResources,scope};
}
module.exports={CASES,configuration,workflow,createAutomationSchedule};
