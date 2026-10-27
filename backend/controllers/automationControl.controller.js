const crypto=require('node:crypto');
function authorized(req,secret){const actual=req.headers.authorization;if(typeof secret!=='string'||secret.length<32||typeof actual!=='string')return false;const a=Buffer.from(actual),b=Buffer.from(`Bearer ${secret}`);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
async function status(req,res){
 if(req.method!=='GET'){res.statusCode=405;return res.end();}
 if(!authorized(req,process.env.CRON_SECRET)){res.statusCode=401;return res.end(JSON.stringify({error:'Autenticación requerida.'}));}
 try{
  const mongo=require('../infrastructure/platformMongo'),{configuration}=require('../services/automationSchedule.service'),scope=configuration(process.env),db=await mongo.getMongoDatabase();
  const actor=await require('../services/resourceAuthorization.service').currentActor(db,undefined,scope);
  if(actor.role!=='analyst')throw Error('Service role changed');
  const rows=await db.collection('analytics_jobs').find({kind:'bco.workflow',organization_id:scope.organizationId,'automation_schedule.run_id':scope.runId}).sort({analytics_job_id:1}).limit(20).toArray();
  const plan=await db.collection('soi_provider_locks').findOne({_id:`automation:schedule:${scope.runId}`});
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify({scope:'isolated_automation_staging',run_id:scope.runId,checked_at:new Date(),planned_cases:plan?.planned_cases||[],jobs:rows.map(r=>({id:r.analytics_job_id,case_id:r.automation_schedule.case_id,scheduled_for:r.automation_schedule.scheduled_for,programmed_at:r.automation_schedule.programmed_at,status:r.status,attempts:r.attempts,started_at:r.started_at||null,completed_at:r.completed_at||null,duration_ms:r.duration_ms??null,error_code:r.error?.code||null,idempotency_replay_verified:r.automation_schedule.idempotency_replay_verified,execution_contexts:r.execution_contexts||[],results:r.tasks.filter(t=>t.state==='COMPLETED').map(t=>({algorithm:t.algorithm,input_sha256:t.input_sha256,result_sha256:t.result_sha256,result:t.result?.result})),result_sha256:r.result_sha256||null}))}));
 }catch{res.statusCode=503;res.end(JSON.stringify({error:'La comprobación de automatización no está disponible.'}));}
}
async function functionExpiry(req,res){
 if(req.method!=='GET'){res.statusCode=405;return res.end();}
 if(!authorized(req,process.env.CRON_SECRET)){res.statusCode=401;return res.end(JSON.stringify({error:'Autenticación requerida.'}));}
 try{
  const mongo=require('../infrastructure/platformMongo'),{createAutomationSchedule,workflow}=require('../services/automationSchedule.service'),{service}=require('../services/computationalOrchestrator.service');
  const schedule=createAutomationSchedule({orchestrator:service,infrastructure:mongo}),scope=schedule.scope;
  const created=await service.create(scope,workflow('function-expiry-recovery'),`${scope.runId}:function-expiry-recovery`);
  if(!created.created){res.statusCode=409;return res.end(JSON.stringify({error:'La prueba de vencimiento ya fue registrada.'}));}
  const row=await service.repository.transaction(async(db,session)=>{const current=await service.repository.get(db,session,scope.organizationId,created.run.analytics_job_id,Date.now());return service.repository.save(db,session,current,{automation_schedule:{run_id:scope.runId,case_id:'function-expiry-recovery',scheduled_for:new Date(),programmed_at:new Date(),trigger:'controlled_function_timeout_probe',data_kind:'SIMULATED_OWNED_TEST_FIXTURE'}},Date.now());});
  await service.mutate(scope,row.analytics_job_id,'queue',{revision:row.revision});
  const claimed=await service.repository.claim({organizationId:scope.organizationId,jobId:row.analytics_job_id});
  if(!claimed){res.statusCode=409;return res.end(JSON.stringify({error:'Otro worker adquirió la prueba; no se fuerza el vencimiento.'}));}
  await schedule.observeClaim(claimed,{source:'vercel_function_timeout_probe'});
  // Intentional staging-only probe: Vercel must terminate this function at maxDuration.
  await new Promise(()=>{});
 }catch{res.statusCode=503;res.end(JSON.stringify({error:'No se pudo preparar la prueba de vencimiento.'}));}
}
module.exports={authorized,status,functionExpiry};
