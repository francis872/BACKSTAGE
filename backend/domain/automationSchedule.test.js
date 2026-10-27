const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./helpers/computationalFixture');
const {createAutomationSchedule,configuration,CASES}=require('../services/automationSchedule.service');
const {authorized}=require('../controllers/automationControl.controller');
function fixture(){
 const s=setup({runner:async()=>({result:{risk:.125}})});
 const user=s.f.data().identity_users.find(u=>u.user_id===3);user.account_type='service';
 const env={BACKSTAGE_RUNTIME_ENV:'staging',BACKSTAGE_AUTOMATION_ENABLED:'true',BCO_AUTOMATION_RUN_ID:'auto-20261025000000-1234abcd',MONGODB_DB:'backstage_auto_1234abcd',BCO_SERVICE_ORGANIZATION_ID:'10',BCO_SERVICE_USER_ID:'3',BCO_INJECT_STAGING_TERMINATION:'true'};
 const schedule=createAutomationSchedule({orchestrator:s.service,infrastructure:s.infra,env,now:s.now,instanceId:'unit-instance'});
 return {...s,env,schedule};
}
test('finite deployed scheduler records planned times and reuses BCO without duplicate jobs or secret-bearing payloads',async()=>{
 const s=fixture();assert.equal((await s.schedule.tick()).length,0);s.advance(15000);
 assert.equal((await s.schedule.tick()).length,1);await s.schedule.tick();
 assert.equal(s.f.data().analytics_jobs.length,1);const row=s.f.data().analytics_jobs[0];assert.equal(row.status,'QUEUED');assert(row.automation_schedule.scheduled_for);assert(row.automation_schedule.idempotency_replay_verified);
 await s.service.processNext({organizationId:10,onClaim:job=>s.schedule.observeClaim(job)});assert.equal(s.f.data().analytics_jobs[0].status,'COMPLETED');
 assert.equal(s.f.data().analytics_jobs[0].execution_contexts[0].instance_id,'unit-instance');assert.equal(CASES.length,6);
 const plan=s.f.data().soi_provider_locks.find(r=>r.kind==='finite_staging_schedule');assert(plan.planned_cases.find(p=>p.case_id==='pc-off-observation').scheduled_for>s.f.data().analytics_jobs[0].automation_schedule.scheduled_for);
 assert(!JSON.stringify(row).includes('CRON_SECRET'));
});
test('automation refuses production, a shared database and a revoked/interactive service identity',async()=>{
 const s=fixture();assert.throws(()=>configuration({...s.env,BACKSTAGE_RUNTIME_ENV:'production'}));assert.throws(()=>configuration({...s.env,MONGODB_DB:'backstage_spatial'}));
 s.f.data().identity_memberships.find(m=>m.user_id===3).role='viewer';await assert.rejects(s.schedule.tick(),{statusCode:403});
 assert(!s.f.data().analytics_jobs?.length);
});
test('expired execution becomes RETRY_PENDING, waits for its backoff, and completes with a new fenced attempt',async()=>{
 const s=fixture();await s.schedule.tick();s.advance(45000);await s.schedule.tick();
 const recovery=s.f.data().analytics_jobs.find(r=>r.automation_schedule.case_id==='interruption-recovery');
 const job=await s.service.repository.claim({organizationId:10,jobId:recovery.analytics_job_id,now:s.now});assert(job);
 assert.equal(await s.schedule.observeClaim(job),true);s.advance(46000);
 assert.equal(await s.service.processNext({organizationId:10,jobId:job.analytics_job_id,recoveryBackoffMs:5000}),null);
 assert.equal(s.f.data().analytics_jobs.find(r=>r.analytics_job_id===job.analytics_job_id).status,'RETRY_PENDING');
 assert.equal(await s.service.processNext({organizationId:10,jobId:job.analytics_job_id,recoveryBackoffMs:5000}),null);
 s.advance(5001);await s.service.processNext({organizationId:10,jobId:job.analytics_job_id,recoveryBackoffMs:5000,onClaim:r=>s.schedule.observeClaim(r)});
 const done=s.f.data().analytics_jobs.find(r=>r.analytics_job_id===job.analytics_job_id);assert.equal(done.status,'COMPLETED');assert.equal(done.attempts,2);assert.equal(done.execution_contexts.length,2);
 assert.equal(s.f.data().operational_events.filter(e=>e.event_type==='bco.workflow.completed'&&e.payload.analytics_job_id===job.analytics_job_id).length,1);
});
test('scheduled diagnostic endpoint compares the complete secret and denies missing or malformed credentials',()=>{
 const secret='isolated-testing-secret-that-is-long-enough';assert(authorized({headers:{authorization:`Bearer ${secret}`}},secret));
 for(const value of [undefined,'Bearer wrong',`Basic ${secret}`,`Bearer ${secret} `])assert(!authorized({headers:{authorization:value}},secret));
 assert(!authorized({headers:{authorization:'Bearer short'}},'short'));
});
