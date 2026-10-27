// Controlled failure injection in the owned staging project only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 const {state,guard,database,cli,originalAliases}=require('./automation-staging');guard();
 const accepted=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/automation-staging-execution.json'),'utf8'));assert.equal(accepted.status,'passed');assert.equal(accepted.run_id,state.run_id);
 const report={started_at:new Date().toISOString(),run_id:state.run_id,deployment_id:state.deployment.id,mode:'actual_owned_vercel_function_timeout_and_cloud_recovery',local_worker_started:false,production_changes:false};let mongo,scaledDown=false;
 try{
  await cli(['scale','bco-acceptance','iad1=0']);scaledDown=true;
  let drained=false;for(let i=0;i<20;i++){const list=await cli(['list']),daemon=list.daemons.find(d=>d.name==='bco-acceptance');if(daemon.instances.total===0&&daemon.instances.desired===0){drained=true;break;}await pause(3000);}assert(drained,'Owned daemon did not drain');
  const started=performance.now(),response=await fetch(`https://${state.deployment.url}/api/expiry`,{headers:{Authorization:`Bearer ${state.cron_secret}`,'x-vercel-protection-bypass':state.bypass},redirect:'error',signal:AbortSignal.timeout(90000)});
  report.function_http_status=response.status;report.function_error_code=response.headers.get('x-vercel-error');report.observed_request_ms=Math.round(performance.now()-started);await response.arrayBuffer();assert.equal(response.status,504);assert.equal(report.function_error_code,'FUNCTION_INVOCATION_TIMEOUT');
  const connection=await database();mongo=connection.mongo;const db=connection.db;
  const initial=await db.collection('analytics_jobs').findOne({organization_id:state.organization_id,'automation_schedule.run_id':state.run_id,'automation_schedule.case_id':'function-expiry-recovery'});assert(initial);assert.equal(initial.status,'RUNNING');assert.equal(initial.attempts,1);report.job_id=initial.analytics_job_id;
  await cli(['scale','bco-acceptance','iad1=2']);scaledDown=false;
  let final;for(let i=0;i<40;i++){final=await db.collection('analytics_jobs').findOne({organization_id:state.organization_id,analytics_job_id:initial.analytics_job_id});if(final.status==='COMPLETED')break;await pause(3000);}
  assert.equal(final.status,'COMPLETED');assert.equal(final.attempts,2);assert.equal(final.tasks[0].result.result.risk,.125);assert.equal(final.execution_contexts[0].source,'vercel_function_timeout_probe');assert.equal(final.execution_contexts[1].source,'vercel_daemon');
  assert.equal(await db.collection('operational_events').countDocuments({organization_id:state.organization_id,'payload.analytics_job_id':final.analytics_job_id,event_type:'bco.workflow.completed'}),1);
  report.recovery={status:final.status,attempts:final.attempts,sources:final.execution_contexts.map(x=>x.source),completion_facts:1,known_risk:.125};await originalAliases();report.status='passed';
 }catch(error){report.status='failed';report.failure={name:error.name,code:error.code||null};process.exitCode=1;}
 finally{
  if(scaledDown)try{await cli(['scale','bco-acceptance','iad1=2']);}catch{report.restart_needs_review=true;}
  await mongo?.closeMongoConnection();report.completed_at=new Date().toISOString();const p=path.join(root,'docs/evidence/automation-function-expiry.json');if(fs.existsSync(p))fs.copyFileSync(p,p.replace('.json',`-${Date.now()}.json`));fs.writeFileSync(p,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
}
if(require.main===module){if(process.argv.includes('--apply'))run();else console.log(JSON.stringify({mode:'plan_only',owned_staging_only:true,injection:'30-second function deadline',source_database:'owned automation database',local_worker:false,production_changes:false}));}
module.exports={run};
