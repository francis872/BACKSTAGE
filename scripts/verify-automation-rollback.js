const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 const {state,guard,database,cli,originalAliases}=require('./automation-staging'),{api}=require('./staging-vercel');guard();
 const capacity=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/automation-capacity.json'),'utf8'));assert.equal(capacity.status,'passed');
 const current=state.deployment.id,deployments=(await api(`/v6/deployments?projectId=${state.project.id}&target=production&limit=10`)).deployments;
 const currentIndex=deployments.findIndex(d=>d.uid===current);assert(currentIndex>=0);
 const previous=deployments.slice(currentIndex+1).find(d=>[d.state,d.readyState].includes('READY'))?.uid;assert(previous,'Hobby requires an immediately preceding production deployment');
 assert.notEqual(previous,current);for(const id of [previous,current])assert.equal((await api(`/v13/deployments/${id}`)).projectId,state.project.id);
 const report={started_at:new Date().toISOString(),run_id:state.run_id,scope:'owned_automation_project_only',previous_deployment:previous,current_deployment:current,production_changes:false,checks:[]};
 const {mongo,db}=await database();let rolledBack=false;
 const jobsHash=async()=>crypto.createHash('sha256').update(JSON.stringify(await db.collection('analytics_jobs').find({}).sort({analytics_job_id:1}).toArray())).digest('hex');
 async function deploymentCommand(action,id){
  const executable=path.join(root,'.vercel/automation-tools/node_modules/vercel/dist/index.js');
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[executable,action,id,'--yes','--timeout','2m','--scope','franciscogloopez-8505s-projects'],{cwd:path.join(root,state.source),windowsHide:true,shell:false});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.once('error',reject);child.once('close',code=>{fs.writeFileSync(path.join(root,`.vercel/automation-${action}-private.log`),output,{mode:0o600});code===0?resolve():reject(Error(`Owned ${action} failed`));});});
 }
 async function confirm(id){
  for(let i=0;i<20;i++){const project=await api(`/v9/projects/${state.project.id}`);if(project.targets?.production?.id===id){const r=await fetch(`https://${state.project.name}.vercel.app/api/status`,{headers:{Authorization:`Bearer ${state.cron_secret}`,'x-vercel-protection-bypass':state.bypass},redirect:'error',signal:AbortSignal.timeout(10000)});if(r.status===200&&(await r.json()).run_id===state.run_id)return;}await pause(2000);}throw Error('Owned deployment did not become healthy');
 }
 try{
  const before=await jobsHash(),envBefore=(await api(`/v10/projects/${state.project.id}/env`)).envs.map(e=>e.key).sort();
  const source=JSON.parse(fs.readFileSync(path.join(root,state.source,'vercel.json'),'utf8'));assert(!source.crons?.length);
  await cli(['scale','bco-acceptance','--reset']);report.checks.push({name:'explicitly_cleared_daemon_scaling_override',passed:true});
  await deploymentCommand('rollback',previous);rolledBack=true;await confirm(previous);assert.equal(await jobsHash(),before);report.checks.push({name:'previous_code_deployment_healthy_and_job_snapshots_unchanged',passed:true});
  await deploymentCommand('promote',current);rolledBack=false;await confirm(current);assert.equal(await jobsHash(),before);
  assert.deepEqual((await api(`/v10/projects/${state.project.id}/env`)).envs.map(e=>e.key).sort(),envBefore);
  const list=await cli(['list']),daemon=list.daemons.find(d=>d.name==='bco-acceptance');assert.equal(daemon.instances.desired,2);
  report.checks.push({name:'current_code_restored_environment_key_names_and_two_requested_daemons_verified',passed:true});
  report.checks.push({name:'schedule_is_persisted_in_atlas_native_cron_not_used_or_assumed_rolled_back',passed:true});
  report.persisted_jobs_sha256=before;await originalAliases();report.status='passed';
 }catch(error){report.status='failed';report.failure={name:error.name,code:error.code||error.status||null};process.exitCode=1;}
 finally{
  if(rolledBack)try{await deploymentCommand('promote',current);await confirm(current);}catch{report.current_deployment_restoration_needs_review=true;}
  await mongo.closeMongoConnection();report.completed_at=new Date().toISOString();const p=path.join(root,'docs/evidence/automation-rollback.json');if(fs.existsSync(p))fs.copyFileSync(p,p.replace('.json',`-${Date.now()}.json`));fs.writeFileSync(p,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
}
if(require.main===module){if(process.argv.includes('--apply'))run();else console.log(JSON.stringify({mode:'plan_only',scope:'owned_staging_project',actions:['clear_scaling_override','rollback_verified_owned_deployment','verify_data','restore_current_deployment'],production_changes:false}));}
module.exports={run};
