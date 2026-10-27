const test=require('node:test'),assert=require('node:assert/strict');
const {runComputationalLoop}=require('../workers/computationalLoop');
test('worker retries transient failures with bounded backoff, recovers and never logs the exception body',async()=>{
 let calls=0,stop=false;const delays=[],logs=[];
 await runComputationalLoop({processNext:async()=>{calls++;if(calls<=7)throw Error('must-not-log-private-diagnostic');if(calls===8)return 101;return null;},dispatch:async()=>null,stopping:()=>stop,sleep:async ms=>{delays.push(ms);if(calls===9)stop=true;},write:row=>logs.push(row)});
 assert.deepEqual(delays,[1000,2000,4000,8000,16000,30000,30000,1000]);assert.equal(logs.filter(r=>r.event==='bco.worker.finished_attempt').length,1);assert(!JSON.stringify(logs).includes('must-not-log-private-diagnostic'));
});
test('one-shot worker fails visibly and a dispatcher failure does not erase an already committed job',async()=>{
 await assert.rejects(runComputationalLoop({processNext:async()=>{throw Error('controlled failure');},dispatch:async()=>null,once:true}),/controlled failure/);
 const committed=[101],logs=[];let stop=false;
 await runComputationalLoop({processNext:async()=>committed.shift()||null,dispatch:async()=>{throw Error('controlled sink');},write:r=>logs.push(r),sleep:async()=>{stop=true;},stopping:()=>stop});assert.equal(committed.length,0);assert.equal(logs[0].analytics_job_id,101);assert.equal(logs[1].event,'bco.worker.retry');
});
