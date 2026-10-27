// Cloud-only acceptance entrypoint. No HTTP input can request a process termination.
const crypto=require('node:crypto'),{setTimeout:delay}=require('node:timers/promises');
const mongo=require('../infrastructure/platformMongo');
const {service}=require('../services/computationalOrchestrator.service');
const {createAutomationSchedule}=require('../services/automationSchedule.service');
async function main(){
 const schedule=createAutomationSchedule({orchestrator:service,infrastructure:mongo,instanceId:crypto.randomUUID()});
 if(!process.env.VERCEL_OIDC_TOKEN_FILE||process.env.VERCEL_REGION!=='iad1')throw Error('This staging harness requires a deployed Vercel daemon');
 const stop=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>stop.abort());
 let failures=0;
 while(!stop.signal.aborted){
  try{
   await schedule.tick();
   const cpuStart=process.cpuUsage(),rssBefore=process.memoryUsage().rss;let rssPeak=rssBefore;
   const memoryTimer=setInterval(()=>{rssPeak=Math.max(rssPeak,process.memoryUsage().rss);},250);
   let id;try{id=await service.processNext({organizationId:schedule.scope.organizationId,recoveryBackoffMs:5000,onClaim:async job=>{
    if(await schedule.observeClaim(job)){console.log(JSON.stringify({event:'automation.staging_process_interruption',analytics_job_id:job.analytics_job_id,attempt:job.attempts}));process.kill(process.pid,'SIGKILL');}
   }});}finally{clearInterval(memoryTimer);}
   if(id){const cpu=process.cpuUsage(cpuStart),rssAfter=process.memoryUsage().rss;await schedule.recordResources(id,{scope:'node_process_including_worker_threads_excluding_python_child',cpu_user_us:cpu.user,cpu_system_us:cpu.system,rss_before_bytes:rssBefore,rss_after_bytes:rssAfter,rss_peak_sampled_bytes:Math.max(rssPeak,rssAfter),sampling_interval_ms:250,absolute_peak:false});}
   if(id)console.log(JSON.stringify({event:'automation.cloud_attempt_finished',analytics_job_id:id}));
   failures=0;
  }catch{failures++;console.error(JSON.stringify({event:'automation.worker_retry',code:'AUTOMATION_OR_STORE_UNAVAILABLE',consecutive_failures:failures}));}
  try{await delay(Math.min(30000,5000*2**Math.min(failures,3)),undefined,{signal:stop.signal});}catch{break;}
 }
}
if(require.main===module)main().catch(()=>{console.error(JSON.stringify({event:'automation.failed',code:'INVALID_AUTOMATION_ENVIRONMENT'}));process.exitCode=1;}).finally(mongo.closeMongoConnection);
module.exports={main};
