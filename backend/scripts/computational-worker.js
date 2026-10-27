// Explicit worker process, never called inside an HTTP request.
const {service}=require('../services/computationalOrchestrator.service');
const outbox=require('../services/computationalOutbox.service').service;
const {closeMongoConnection}=require('../infrastructure/platformMongo');
const {runComputationalLoop}=require('../workers/computationalLoop');
let stopping=false;for(const signal of['SIGINT','SIGTERM'])process.once(signal,()=>{stopping=true;});
async function main(){
 require('../domain/deploymentTarget').assertRuntimeTarget(process.env);
 const at=process.argv.indexOf('--organization'),organizationId=at>=0?Number(process.argv[at+1]):undefined;
 if(at>=0&&(!Number.isSafeInteger(organizationId)||organizationId<=0))throw Error('Invalid organization');
 let heartbeatTimer,heartbeatBusy=false,heartbeatPending=Promise.resolve();
 if(process.env.BACKSTAGE_RUNTIME_ENV){
  const heartbeat=require('../services/workerHeartbeat.service').createWorkerHeartbeat({database:require('../infrastructure/platformMongo').getMongoDatabase});
  await heartbeat.pulse();
  heartbeatTimer=setInterval(()=>{if(heartbeatBusy)return;heartbeatBusy=true;heartbeatPending=heartbeat.pulse().catch(()=>{console.error(JSON.stringify({event:'bco.worker.heartbeat_failed',code:'WORKER_OR_STORE_UNAVAILABLE'}));}).finally(()=>{heartbeatBusy=false;});},15000);
 }
 try{await runComputationalLoop({processNext:()=>service.processNext({organizationId}),dispatch:()=>outbox.dispatch({organizationId}),once:process.argv.includes('--once'),stopping:()=>stopping});}
 finally{clearInterval(heartbeatTimer);await heartbeatPending;}
}
if(require.main===module)main().catch(()=>{console.error(JSON.stringify({event:'bco.worker.failed',code:'WORKER_OR_STORE_UNAVAILABLE'}));process.exitCode=1;}).finally(closeMongoConnection);
