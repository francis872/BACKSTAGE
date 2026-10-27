// Process supervision belongs to the host; transient store failures are retried here.
async function runComputationalLoop({processNext,dispatch,once=false,stopping=()=>false,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),write=event=>console.log(JSON.stringify(event))}){
 let failures=0;
 do{try{
  const started=performance.now(),job=await processNext();if(job)write({event:'bco.worker.finished_attempt',analytics_job_id:job,duration_ms:Math.round(performance.now()-started)});
  for(let i=0;i<10&&!stopping();i++)if(!await dispatch())break;
  failures=0;if(once)break;if(!job)await sleep(1000);
 }catch(error){if(once)throw error;failures++;const delay=Math.min(30000,1000*2**Math.min(failures-1,5));write({event:'bco.worker.retry',code:'WORKER_OR_STORE_UNAVAILABLE',retry_after_ms:delay});await sleep(delay);}
 }while(!stopping());
}
module.exports={runComputationalLoop};
