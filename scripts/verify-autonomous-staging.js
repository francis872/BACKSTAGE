// Read-only observer. It never schedules, claims or executes a job.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
async function run(){
 const {state,database,originalAliases,cli}=require('./automation-staging');
 const report={checked_at:new Date().toISOString(),mode:'read_only_observer_of_deployed_vercel_daemons',run_id:state.run_id,production_changes:false,local_worker_started:false,physical_pc_powered_off_verified:false,checks:[]};
 let mongo;
 const check=(name,detail={})=>report.checks.push({name,passed:true,...detail});
 try{
  const connection=await database();mongo=connection.mongo;const db=connection.db;assert.notEqual(db.databaseName,state.original_database);
  const marker=await db.collection('soi_schema_versions').findOne({_id:'automation-ownership'});assert.equal(marker.run_id,state.run_id);
  check('dedicated_staging_database_ownership_and_original_production_unchanged',{production_aliases:await originalAliases()});
  const base=`https://${state.deployment.url}/api/status`,headers={'x-vercel-protection-bypass':state.bypass};
  const denied=await fetch(base,{headers,redirect:'manual',signal:AbortSignal.timeout(15000)});assert.equal(denied.status,401);
  const response=await fetch(base,{headers:{...headers,Authorization:`Bearer ${state.cron_secret}`},redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);const status=await response.json();assert.equal(status.run_id,state.run_id);
  check('deployed_status_endpoint_denies_missing_secret_and_returns_only_owned_test_jobs');
  const daemon=await cli(['list']);fs.writeFileSync(path.join(root,'.vercel/automation-daemon-verification-private.json'),JSON.stringify(daemon,null,2),{mode:0o600});
  const rows=await db.collection('analytics_jobs').find({kind:'bco.workflow',organization_id:state.organization_id,'automation_schedule.run_id':state.run_id}).sort({analytics_job_id:1}).toArray();
  const earlierFile=path.join(root,'docs/evidence/automation-staging-execution.json'),earlier=fs.existsSync(earlierFile)?JSON.parse(fs.readFileSync(earlierFile,'utf8')):{};
  report.deployment_id=earlier.initial_execution_deployment_id||earlier.deployment_id||state.deployment.id;report.initial_execution_deployment_id=report.deployment_id;report.observed_deployment_id=state.deployment.id;report.vercel_project_id=state.project.id;
  report.planned_pc_off_execution=status.planned_cases?.find(p=>p.case_id==='pc-off-observation')||null;
  report.jobs=rows.map(r=>({id:r.analytics_job_id,case_id:r.automation_schedule.case_id,status:r.status,attempts:r.attempts,scheduled_for:r.automation_schedule.scheduled_for,programmed_at:r.automation_schedule.programmed_at,trigger:r.automation_schedule.trigger,started_at:r.started_at||null,completed_at:r.completed_at||null,duration_ms:r.duration_ms??null,execution_instances:(r.execution_contexts||[]).map(x=>x.instance_id),result_sha256:r.result_sha256||null}));
  const cases=['known-risk','interruption-recovery','workflow-timeout','known-moran'],byCase=Object.fromEntries(rows.map(r=>[r.automation_schedule.case_id,r]));
  if(!cases.every(id=>byCase[id]&&['COMPLETED','TIMED_OUT','FAILED'].includes(byCase[id].status))){report.status='pending_cloud_schedule';return report;}
  for(const name of cases){const row=byCase[name];assert.equal(row.created_by,state.user_id);assert.equal(row.automation_schedule.trigger,'deployed_daemon_clock');assert(new Date(row.automation_schedule.programmed_at)<new Date(row.automation_schedule.scheduled_for));assert(new Date(row.started_at)>=new Date(row.automation_schedule.scheduled_for));assert(row.automation_schedule.idempotency_replay_verified);assert.equal(rows.filter(r=>r.automation_schedule.case_id===name).length,1);assert(row.execution_contexts?.every(x=>x.source==='vercel_daemon'&&x.region==='iad1'));}
  assert.equal(byCase['known-risk'].status,'COMPLETED');assert.equal(byCase['known-risk'].tasks[0].result.result.risk,.125);
  check('cloud_clock_scheduled_known_risk_without_local_execution',{expected_risk:.125});
  const recovered=byCase['interruption-recovery'];assert.equal(recovered.status,'COMPLETED');assert.equal(recovered.attempts,2);assert.equal(new Set(recovered.execution_contexts.map(x=>x.instance_id)).size,2);
  const retryEvents=await db.collection('operational_events').countDocuments({organization_id:state.organization_id,event_type:'bco.workflow.retry_pending','payload.analytics_job_id':recovered.analytics_job_id});assert.equal(retryEvents,1);
  check('real_deployed_process_termination_expired_lease_persisted_backoff_and_new_instance_recovery',{attempts:2,retry_pending_events:retryEvents});
  assert.equal(byCase['workflow-timeout'].status,'TIMED_OUT');check('actual_workflow_timeout_is_terminal');
  assert.equal(byCase['known-moran'].status,'COMPLETED');assert(Math.abs(byCase['known-moran'].tasks[0].result.result.result.statistic+1/3)<1e-12);check('unchanged_python_engine_runs_inside_deployed_container',{expected_complete_graph_moran:-1/3});
  for(const name of ['known-risk','interruption-recovery','known-moran'])assert.equal(await db.collection('operational_events').countDocuments({organization_id:state.organization_id,event_type:'bco.workflow.completed','payload.analytics_job_id':byCase[name].analytics_job_id}),1);
  check('repeated_scheduler_invocations_preserve_one_job_and_one_completion_fact_per_case');
  const audit=await require('../backend/services/mongoAudit.service').createMongoAuditService(mongo).verifyAuditChain(state.organization_id);assert.equal(audit.valid,true);check('canonical_audit_chain_valid');
  const {service}=require('../backend/services/computationalOrchestrator.service');for(const name of ['known-risk','interruption-recovery','known-moran'])assert.equal((await service.verify({organizationId:state.organization_id,userId:state.user_id},byCase[name].analytics_job_id)).historical_integrity,true);
  check('completed_evidence_input_result_and_manifest_hashes_verify');
  report.status='passed';
 }catch(error){report.status='failed';report.failure={name:error.name,code:error.code||error.statusCode||null};process.exitCode=1;}
 finally{
  await mongo?.closeMongoConnection();
  const file=path.join(root,'docs/evidence/automation-staging-execution.json');if(fs.existsSync(file))fs.copyFileSync(file,file.replace('.json',`-${Date.now()}.json`));
  fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
 return report;
}
if(require.main===module)run();module.exports={run};
