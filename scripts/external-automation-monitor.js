// Portable monitor for an independent host. No Vercel/Atlas SDK or local worker.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {transition,DEFAULTS}=require('../backend/domain/monitorState');
function evaluate(snapshot,{now=Date.now(),maximumDelayMs=120000,maximumRunningMs=180000}={}){
 if(!snapshot||!Array.isArray(snapshot.jobs)||!Array.isArray(snapshot.planned_cases)||!snapshot.planned_cases.length)return{healthy:false,issues:['execution_status_missing']};
 const issues=[];
 for(const plan of snapshot.planned_cases){
  const due=Date.parse(plan.scheduled_for);if(!Number.isFinite(due)){issues.push('invalid_planned_time');continue;}
  const job=snapshot.jobs.find(j=>j.case_id===plan.case_id);
  if(!job){if(now>due+maximumDelayMs)issues.push('expected_execution_missing');continue;}
  const expected=plan.case_id==='workflow-timeout'?'TIMED_OUT':'COMPLETED';
  if(['FAILED','CANCELLED','TIMED_OUT'].includes(job.status)&&job.status!==expected)issues.push(job.attempts>=2?'repeated_job_failure':'job_failure');
  if(['PENDING','QUEUED','RETRY_PENDING'].includes(job.status)&&now>due+maximumDelayMs)issues.push('execution_delayed');
  if(job.status==='RUNNING'&&(!Number.isFinite(Date.parse(job.started_at))||now-Date.parse(job.started_at)>maximumRunningMs))issues.push('execution_stuck');
 }
 return{healthy:!issues.length,issues:[...new Set(issues)]};
}
function httpsUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('HTTPS URL without embedded credentials required');return u;}
async function run({env=process.env,fetchImpl=fetch,now=Date.now}={}){
 const url=httpsUrl(env.EXTERNAL_MONITOR_STATUS_URL),directory=env.EXTERNAL_MONITOR_STATE_DIRECTORY;
 if(url.pathname!=='/api/status'||!directory||!env.EXTERNAL_MONITOR_STATUS_TOKEN)throw Error('Explicit monitor configuration required');
 const filename=path.join(directory,'state.json');fs.mkdirSync(directory,{recursive:true});const previous=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename,'utf8')):{};
 const write=value=>{const temporary=filename+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(temporary,filename);};
 let samples;
 try{
  const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${env.EXTERNAL_MONITOR_STATUS_TOKEN}`,...(env.EXTERNAL_MONITOR_VERCEL_BYPASS?{'x-vercel-protection-bypass':env.EXTERNAL_MONITOR_VERCEL_BYPASS}:{})}});
  const text=await response.text();if(Buffer.byteLength(text)>1000000)throw Error('Monitor response exceeds budget');
  if(!response.ok)throw Error('Endpoint unavailable');const execution=evaluate(JSON.parse(text),{now:now()});
  samples=[{component:'http',healthy:true,status:'reachable'},{component:'execution',healthy:execution.healthy,status:execution.healthy?'on_schedule':execution.issues.join(',')}];
 }catch{samples=[{component:'http',healthy:false,status:'unreachable_or_invalid'},{component:'execution',healthy:false,status:'cannot_verify_execution'}];}
 const checked=new Date(now()).toISOString(),changed=transition(previous,samples,DEFAULTS,checked);
 const alerts=[...(previous.alerts||[]),...changed.events.map(event=>({...event,id:crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex'),state:'PENDING',attempts:0,next_attempt_at:checked}))].slice(-100);
 const state={checked_at:checked,incidents:changed.incidents,alerts,samples,recipient_role:'admin'};write(state);
 const configured=Boolean(env.EXTERNAL_MONITOR_WEBHOOK_URL&&env.EXTERNAL_MONITOR_WEBHOOK_TOKEN);
 if(configured){const webhook=httpsUrl(env.EXTERNAL_MONITOR_WEBHOOK_URL);
  for(const alert of alerts.filter(a=>a.state==='PENDING'&&Date.parse(a.next_attempt_at)<=now()).slice(0,5)){
   alert.attempts++;
   try{const r=await fetchImpl(webhook,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${env.EXTERNAL_MONITOR_WEBHOOK_TOKEN}`,'Content-Type':'application/json','Idempotency-Key':alert.id},body:JSON.stringify({id:alert.id,component:alert.component,event:alert.event,at:alert.at,severity:alert.severity,recipient_role:'admin'})});if(!r.ok)throw Error('Notification rejected');alert.state='ACCEPTED_BY_WEBHOOK';}
   catch{alert.state=alert.attempts>=5?'FAILED':'PENDING';alert.next_attempt_at=new Date(now()+Math.min(3600000,30000*2**alert.attempts)).toISOString();}
   write(state);
  }
 }
 return{checked_at:checked,samples,open_incidents:Object.values(state.incidents).filter(i=>i.open).length,notification_configured:configured,pending_alerts:alerts.filter(a=>a.state==='PENDING').length,administrator_receipt_verified:false};
}
if(require.main===module)run().then(result=>{console.log(JSON.stringify(result));if(result.samples.some(s=>!s.healthy))process.exitCode=1;}).catch(()=>{console.error(JSON.stringify({event:'external_monitor.failed',code:'INVALID_MONITOR_CONFIGURATION_OR_STATE'}));process.exitCode=1;});
module.exports={evaluate,run};
