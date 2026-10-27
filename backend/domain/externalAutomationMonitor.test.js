const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {evaluate,run}=require('../../scripts/external-automation-monitor');
const now=Date.parse('2026-10-25T20:00:00Z'),due=new Date(now-300000).toISOString();
test('independent monitor distinguishes HTTP health from missing, delayed, stuck and repeatedly failed jobs',()=>{
 assert.deepEqual(evaluate({jobs:[],planned_cases:[{case_id:'a',scheduled_for:due}]},{now}).issues,['expected_execution_missing']);
 for(const [status,extra,issue]of [['QUEUED',{},'execution_delayed'],['RUNNING',{started_at:due},'execution_stuck'],['FAILED',{attempts:3},'repeated_job_failure']])assert(evaluate({planned_cases:[{case_id:'a',scheduled_for:due}],jobs:[{case_id:'a',status,...extra}]},{now}).issues.includes(issue));
 assert(evaluate({planned_cases:[{case_id:'workflow-timeout',scheduled_for:due}],jobs:[{case_id:'workflow-timeout',status:'TIMED_OUT'}]},{now}).healthy);
});
test('independent monitor retains an outage across new processes without contacting an unconfigured channel',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'backstage-external-monitor-'));t.after(()=>{for(const name of fs.readdirSync(directory))fs.unlinkSync(path.join(directory,name));fs.rmdirSync(directory);});
 const env={EXTERNAL_MONITOR_STATUS_URL:'https://example.invalid/api/status',EXTERNAL_MONITOR_STATUS_TOKEN:'isolated-secret',EXTERNAL_MONITOR_STATE_DIRECTORY:directory};let calls=0;
 const fetchImpl=async()=>{calls++;throw Error('controlled Vercel outage fixture');};
 await run({env,fetchImpl,now:()=>now});const failed=await run({env,fetchImpl,now:()=>now+60000});
 assert.equal(failed.open_incidents,2);assert.equal(failed.notification_configured,false);assert.equal(failed.administrator_receipt_verified,false);assert.equal(calls,2);
 const state=JSON.parse(fs.readFileSync(path.join(directory,'state.json'),'utf8'));assert.equal(state.alerts.length,2);assert(!JSON.stringify(state).includes('isolated-secret'));
});
