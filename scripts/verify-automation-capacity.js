const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 const {state,database,originalAliases}=require('./automation-staging'),{mongo,db}=await database();
 const report={started_at:new Date().toISOString(),run_id:state.run_id,scope:'bounded_owned_staging_capacity_not_production_sla',local_worker_started:false,production_changes:false};
 const {service}=require('../backend/services/computationalOrchestrator.service');let foreign,created=[];
 try{
  foreign=await mongo.withMongoTransaction(async(store,session)=>{
   const org=await store.collection('identity_organizations').findOne({automation_foreign_fixture:state.run_id},{session});if(org){const user=await store.collection('identity_users').findOne({automation_foreign_fixture:state.run_id},{session});return{organizationId:org.organization_id,userId:user.user_id};}
   const organizationId=await mongo.nextId('identity_organizations',session),userId=await mongo.nextId('identity_users',session);
   await store.collection('identity_organizations').insertOne({organization_id:organizationId,name:`SIMULATED FOREIGN FIXTURE ${state.run_id}`,slug:`${state.run_id}-foreign`,status:'active',automation_foreign_fixture:state.run_id},{session});
   await store.collection('identity_users').insertOne({user_id:userId,name:'Isolated foreign service fixture',email:`foreign-${state.run_id}@example.invalid`,status:'active',account_type:'service',password_hash:require('../backend/auth').createPasswordHash(crypto.randomBytes(48).toString('base64url')),automation_foreign_fixture:state.run_id},{session});
   await store.collection('identity_memberships').insertOne({organization_id:organizationId,user_id:userId,role:'analyst'},{session});return{organizationId,userId};
  });
  const marker=crypto.randomBytes(6).toString('hex'),input=require('../backend/services/automationSchedule.service').workflow('capacity-foreign-simulated');
  const results=await Promise.allSettled([0,1,2,3].map(i=>service.create(foreign,input,`${state.run_id}:bounded-${marker}-${i}`)));
  created=results.filter(r=>r.status==='fulfilled').map(r=>r.value.run);const denied=results.filter(r=>r.status==='rejected');
  assert.equal(created.length,3);assert.equal(denied.length,1);assert.equal(denied[0].reason.statusCode,429);report.concurrent_creation={requests:4,created:3,rejected_by_pending_budget:1};
  for(const job of created)await service.mutate(foreign,job.analytics_job_id,'queue',{revision:job.revision});
  await assert.rejects(service.get({organizationId:state.organization_id,userId:state.user_id},created[0].analytics_job_id),{statusCode:404});
  await assert.rejects(service.get({organizationId:foreign.organizationId,userId:state.user_id},created[0].analytics_job_id),{statusCode:403});
  const started=Date.now(),latencies=[];
  for(let batch=0;batch<5;batch++)await Promise.all([0,1,2,3].map(async()=>{const at=performance.now(),r=await fetch(`https://${state.deployment.url}/api/status`,{headers:{Authorization:`Bearer ${state.cron_secret}`,'x-vercel-protection-bypass':state.bypass},redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);assert.equal((await r.json()).run_id,state.run_id);latencies.push(performance.now()-at);}));
  if(Date.now()-started<6000)await pause(6000-(Date.now()-started));
  for(const job of created)assert.equal((await service.get(foreign,job.analytics_job_id)).status,'QUEUED');
  report.organization_isolation={cross_organization_read:404,spoofed_membership:403,foreign_jobs_executed:0,foreign_jobs_observed_queued:3,observation_ms:Date.now()-started};
  latencies.sort((a,b)=>a-b);report.http_reads={requests:20,concurrency:4,succeeded:20,p50_ms:latencies[Math.ceil(.5*latencies.length)-1],p95_ms:latencies[Math.ceil(.95*latencies.length)-1],maximum_ms:latencies.at(-1)};
  let sample;for(let i=0;i<20;i++){sample=await db.collection('analytics_jobs').findOne({organization_id:state.organization_id,'automation_schedule.run_id':state.run_id,'automation_schedule.case_id':'capacity-risk'});if(sample?.last_attempt_resource_sample)break;await pause(3000);}
  assert.equal(sample?.status,'COMPLETED');assert.equal(sample.tasks[0].result.result.risk,.125);assert(sample.last_attempt_resource_sample.rss_peak_sampled_bytes>0);report.deployed_resource_sample=sample.last_attempt_resource_sample;
  await originalAliases();report.status='passed';
 }catch(error){report.status='failed';report.failure={name:error.name,code:error.code||error.statusCode||null};process.exitCode=1;}
 finally{
  try{for(const job of created){const current=await service.get(foreign,job.analytics_job_id);if(['PENDING','QUEUED','RUNNING','RETRY_PENDING'].includes(current.status))await service.mutate(foreign,job.analytics_job_id,'cancel',{revision:current.revision});}report.owned_load_jobs_cancelled=created.length;}
  catch{report.cleanup_needs_review=true;report.status='failed';process.exitCode=1;}
  await mongo.closeMongoConnection();report.completed_at=new Date().toISOString();const p=path.join(root,'docs/evidence/automation-capacity.json');if(fs.existsSync(p))fs.copyFileSync(p,p.replace('.json',`-${Date.now()}.json`));fs.writeFileSync(p,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
}
if(require.main===module){if(process.argv.includes('--apply'))run();else console.log(JSON.stringify({mode:'plan_only',scope:'own_new_atlas_staging_only',http_requests:20,concurrency:4,pending_jobs_budget_probe:4,local_worker_started:false,production_changes:false}));}
module.exports={run};
