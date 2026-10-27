const test=require('node:test'),assert=require('node:assert/strict');
process.env.JWT_SECRET='isolated-bco-regression-signing-secret';
const {fixture}=require('./helpers/soiMongoMemoryFixture');
const {createComputationalOrchestrator}=require('../services/computationalOrchestrator.service');
const {createComputationalOutbox}=require('../services/computationalOutbox.service');
const registry=require('../infrastructure/analytics/computationalRegistry');
const {execute}=require('../services/algorithmRuntime.service');
const C=require('./computationalContract');
const {setup,definition,queued}=require('./helpers/computationalFixture');

test('BCO rejects cycles, unknown versions/algorithms, injected attributes and unbounded contracts before writes',async()=>{
 const s=setup();const cyclic=definition(3);cyclic.tasks[0].depends_on=['task2'];const unknown=definition();unknown.tasks[0].algorithm='uploaded-code';const wrongVersion=definition();wrongVersion.tasks[0].version='invented';
 for(const input of[cyclic,unknown,wrongVersion,{...definition(),organization_id:20},{...definition(),priority:6},{...definition(),tasks:[]},{...definition(),timeout_ms:Infinity}])await assert.rejects(s.service.create(s.owner,input,'invalid-fixture-key'));
 assert.equal(s.f.data().analytics_jobs?.length||0,0);assert.equal(s.service.catalog().unavailable.includes('grey_wolf_optimizer'),true);
});
test('creation is idempotent and CRUD uses fresh role, owner, state, revision and tenant attributes',async()=>{
 const s=setup(),a=await s.service.create(s.owner,definition(),'idempotent-fixture-key'),b=await s.service.create(s.owner,definition(),'idempotent-fixture-key');assert.equal(a.created,true);assert.equal(b.created,false);assert.equal(a.run.analytics_job_id,b.run.analytics_job_id);assert.equal(s.f.data().analytics_jobs.length,1);
 await assert.rejects(s.service.create(s.owner,{...definition(),name:'changed'},'idempotent-fixture-key'),{statusCode:409});
 await assert.rejects(s.service.create(s.viewer,definition(),'viewer-fixture-key'),{statusCode:403});
 await assert.rejects(s.service.get(s.other,a.run.analytics_job_id),{statusCode:404});
 await assert.rejects(s.service.mutate(s.analyst,a.run.analytics_job_id,'update',{revision:0,workflow:definition()}),{statusCode:403});
 const updated=await s.service.mutate(s.owner,a.run.analytics_job_id,'update',{revision:0,workflow:{...definition(),name:'Reviewed'}});assert.equal(updated.revision,1);
 await assert.rejects(s.service.mutate(s.owner,a.run.analytics_job_id,'queue',{revision:0}),{statusCode:409});
 const q=await s.service.mutate(s.owner,a.run.analytics_job_id,'queue',{revision:1});assert.equal(q.status,'QUEUED');await assert.rejects(s.service.mutate(s.owner,a.run.analytics_job_id,'update',{revision:q.revision,workflow:definition()}),{statusCode:409});
 await s.infra.withMongoTransaction((db,session)=>db.collection('identity_memberships').updateOne({user_id:1,organization_id:10},{$set:{role:'viewer'}},{session}));
 await assert.rejects(s.service.mutate(s.owner,a.run.analytics_job_id,'cancel',{revision:q.revision}),{statusCode:403});
});
test('worker schedules dependency-ready tasks in bounded parallel batches and preserves reproducible results',async()=>{
 const trace=[];let running=0,peak=0;const s=setup({runner:async task=>{trace.push(`start:${task.id}`);peak=Math.max(peak,++running);await new Promise(r=>setTimeout(r,10));running--;trace.push(`end:${task.id}`);return {algorithm:task.algorithm,version:task.version,result:{risk:.125}};}});
 const run=await queued(s,s.owner,definition(3));assert.equal(run.status,'QUEUED');assert.deepEqual(trace,[],'HTTP registration cannot execute algorithms');
 await s.service.processNext();const done=await s.service.get(s.owner,run.analytics_job_id);assert.equal(done.status,'COMPLETED');assert.equal(peak,2);assert(trace.indexOf('start:task2')>trace.indexOf('end:task0'));assert(trace.indexOf('start:task2')>trace.indexOf('end:task1'));
 assert(done.tasks.every(t=>t.state==='COMPLETED'&&t.result.result.risk===.125&&/^[a-f0-9]{64}$/.test(t.result_sha256)));assert.match(done.result_sha256,/^[a-f0-9]{64}$/);assert(!('worker_owner'in done));assert(!JSON.stringify(s.f.data().soi_audit_events).includes('vulnerability'));
});
test('reviewed JavaScript algorithms execute in the real isolated runtime and retain deterministic math',async()=>{
 const task={id:'risk',algorithm:'risk.components',version:registry.get('risk.components').version,parameters:{threat:.5,exposure:.5,vulnerability:.5}};
 const a=await execute(task),b=await execute(task);assert.equal(a.result.risk,.125);assert.deepEqual(a,b);
 const controller=new AbortController();controller.abort();await assert.rejects(execute(task,{signal:controller.signal}),{statusCode:409});
});
test('cancellation fences running work; timeouts and explicit retries never overwrite the original result',async()=>{
 let began;const started=new Promise(r=>{began=r;});const s=setup({runner:async()=>{began();return new Promise(()=>{});}}),run=await queued(s);
 const processing=s.service.processNext();await started;const current=await s.service.get(s.owner,run.analytics_job_id);await s.service.mutate(s.owner,run.analytics_job_id,'cancel',{revision:current.revision});await processing;assert.equal((await s.service.get(s.owner,run.analytics_job_id)).status,'CANCELLED');
 const cancelled=await s.service.get(s.owner,run.analytics_job_id),retry=await s.service.retry(s.owner,run.analytics_job_id,{revision:cancelled.revision},'explicit-retry-fixture');assert.notEqual(retry.run.analytics_job_id,run.analytics_job_id);assert.equal(retry.run.retry_of,run.analytics_job_id);
 const timed=setup({runner:()=>new Promise(()=>{})}),short=await queued(timed,timed.owner,{...definition(),timeout_ms:100});await timed.service.processNext();assert.equal((await timed.service.get(timed.owner,short.analytics_job_id)).status,'TIMED_OUT');
});
test('global and organization leases cap work, recover crashes and fence stale workers',async()=>{
 const s=setup({runner:async()=>({result:{value:1}})});const one=await queued(s),two=await queued(s,s.other,definition(),'second-org-fixture'),third=await queued(s,{organizationId:30,userId:6},definition(),'third-org-fixture');
 const first=await s.service.repository.claim({organizationId:10,now:s.now()}),second=await s.service.repository.claim({organizationId:20,now:s.now()});assert(first&&second);assert.equal(await s.service.repository.claim({organizationId:30,now:s.now()}),null);
 s.advance(45001);await s.service.processNext({organizationId:10});const done=await s.service.get(s.owner,one.analytics_job_id);assert.equal(done.status,'COMPLETED');assert.equal(done.attempts,2);
 const stale=await s.f.options.database.collection('analytics_jobs').updateOne({analytics_job_id:one.analytics_job_id,status:'RUNNING',worker_owner:first.worker_owner},{$set:{status:'FAILED'}});assert.equal(stale.matchedCount,0);
 assert.equal((await s.service.get({organizationId:30,userId:6},third.analytics_job_id)).status,'QUEUED');assert.equal(two.status,'QUEUED');
});
test('an audit failure rolls back job and outbox; expiry is enforced before TTL and replay cannot reveal expired data',async()=>{
 const s=setup();const db=s.f.options.database,collection=db.collection.bind(db);db.collection=name=>{const c=collection(name);if(name==='soi_audit_events')c.insertOne=async()=>{throw Error('controlled audit failure');};return c;};
 await assert.rejects(s.service.create(s.owner,definition(),'rollback-fixture-key'),/audit failure/);assert.equal(s.f.data().analytics_jobs?.length||0,0);assert.equal(s.f.data().operational_events?.length||0,0);db.collection=collection;
 const run=await s.service.create(s.owner,{...definition(),retention_days:1},'expired-fixture-key');s.advance(86400001);await assert.rejects(s.service.get(s.owner,run.run.analytics_job_id),{statusCode:404});assert.equal((await s.service.list(s.owner)).data.length,0);await assert.rejects(s.service.create(s.owner,{...definition(),retention_days:1},'expired-fixture-key'),{statusCode:410});
});
test('outbox retries use stable delivery IDs, no duplicate business writes, and exhausted crashed deliveries stop',async()=>{
 const s=setup();await s.service.create(s.owner,definition(),'outbox-fixture-key');const deliveries=[];let fail=true;const outbox=createComputationalOutbox({infrastructure:s.infra,now:s.now,publish:async event=>{deliveries.push(event.delivery_id);if(fail)throw Error('controlled sink unavailable');}});
 await outbox.dispatch();assert.equal(s.f.data().operational_events[0].outbox.state,'PENDING');fail=false;s.advance(2100);await outbox.dispatch();assert.equal(s.f.data().operational_events[0].outbox.state,'PUBLISHED');assert.equal(deliveries[0],deliveries[1]);assert.equal(s.f.data().analytics_jobs.length,1);
 await s.f.options.database.collection('operational_events').updateOne({operational_event_id:s.f.data().operational_events[0].operational_event_id},{$set:{'outbox.state':'DELIVERING','outbox.attempts':5,'outbox.lease_until':new Date(0)}});await outbox.dispatch();assert.equal(s.f.data().operational_events[0].outbox.state,'FAILED');
});

test('completed runs retain integrity, can repeat with a new key and detect changed snapshots',async()=>{
 const s=setup({runner:async()=>({result:{value:1}})}),run=await queued(s);await s.service.processNext();const done=await s.service.get(s.owner,run.analytics_job_id);const verified=await s.service.verify(s.owner,run.analytics_job_id);assert.equal(verified.historical_integrity,true);assert.equal(verified.current_engines_match,true);assert.equal(verified.numeric_execution_repeated,false);
 const repeated=await s.service.retry(s.owner,run.analytics_job_id,{revision:done.revision},'repeat-completed-fixture',{repeat:true});assert.equal(repeated.run.repeat_of,run.analytics_job_id);assert.equal(repeated.run.status,'PENDING');
 await s.f.options.database.collection('analytics_jobs').updateOne({analytics_job_id:run.analytics_job_id},{$set:{'tasks.0.result.result.value':999}});assert.equal((await s.service.verify(s.owner,run.analytics_job_id)).historical_integrity,false);
});
test('workers recheck current writer permission and preserve failed tasks instead of inventing a completion',async()=>{
 let calls=0;const s=setup({runner:async()=>{calls++;return {result:{value:1}};}}),run=await queued(s);await s.f.options.database.collection('identity_memberships').updateOne({organization_id:10,user_id:1},{$set:{role:'viewer'}});await s.service.processNext();assert.equal(calls,0);assert.equal((await s.service.get(s.owner,run.analytics_job_id)).status,'FAILED');
 const f=setup({runner:async()=>{throw new (require('../utils/ApiError'))(422,'Controlled invalid input');}}),bad=await queued(f);await f.service.processNext();const failed=await f.service.get(f.owner,bad.analytics_job_id);assert.equal(failed.status,'FAILED');assert.equal(failed.tasks[0].state,'FAILED');assert.equal(failed.tasks[0].error.message,'Controlled invalid input');
});
test('position workflows enforce retention and owner privacy even for same-organization viewers',async()=>{
 const s=setup(),input={name:'Private trajectory fixture',retention_days:1,tasks:[{id:'positions',algorithm:'perception.positions',parameters:{}}]};const missing={...input};delete missing.retention_days;await assert.rejects(s.service.create(s.owner,missing,'retention-fixture-key'),{statusCode:400});const run=(await s.service.create(s.owner,input,'position-privacy-fixture')).run;await assert.rejects(s.service.get(s.viewer,run.analytics_job_id),{statusCode:404});assert.equal((await s.service.list(s.viewer)).data.length,0);assert.equal((await s.service.list(s.owner)).data.length,1);
});
test('a defense proposal requires another current administrator and the exact reviewed result hash',async()=>{
 const s=setup({runner:async()=>({result:{proposal_only:true,autonomous_changes:false}})}),input={name:'Defense fixture',tasks:[{id:'defense',algorithm:'defense.evaluate',parameters:{}}]},run=await queued(s,s.owner,input);await s.service.processNext();const done=await s.service.get(s.owner,run.analytics_job_id);
 await assert.rejects(s.service.mutate(s.owner,run.analytics_job_id,'approve',{revision:done.revision,result_sha256:done.result_sha256,reason:'Review'}),{statusCode:403});
 await assert.rejects(s.service.mutate({organizationId:10,userId:2},run.analytics_job_id,'approve',{revision:done.revision,result_sha256:'0'.repeat(64),reason:'Review'}),{statusCode:409});
 const approved=await s.service.mutate({organizationId:10,userId:2},run.analytics_job_id,'approve',{revision:done.revision,result_sha256:done.result_sha256,reason:'Controlled evaluation reviewed'});assert.equal(approved.defense_approval.applied_to_sensitive_policy,false);assert.equal(approved.defense_approval.approved_by,2);assert.equal(s.f.data().soi_audit_events.find(e=>e.action==='bco.workflow.defense_approved').user_id,2);
});
test('scheduler respects the existing Python runner one-per-organization limit',async()=>{
 let python=0,peak=0;const s=setup({runner:async task=>{const isPython=task.algorithm.startsWith('bsie.');if(isPython)peak=Math.max(peak,++python);await new Promise(r=>setTimeout(r,10));if(isPython)python--;return {result:{fixture:true}};}}),input={name:'Two Python tasks fixture',tasks:[{id:'one',algorithm:'bsie.moran',parameters:{}},{id:'two',algorithm:'bsie.weights',parameters:{}},{id:'three',algorithm:'risk.components',parameters:{threat:.5,exposure:.5,vulnerability:.5}}]};const run=await queued(s,s.owner,input);await s.service.processNext();assert.equal(peak,1);assert.equal((await s.service.get(s.owner,run.analytics_job_id)).status,'COMPLETED');
});
test('final commit drains an in-flight renewal and prevents heartbeat write contention',async()=>{
 const s=setup({heartbeatMs:5,runner:async()=>{await new Promise(r=>setTimeout(r,15));return {result:{fixture:true}};}});let active=false,renewals=0;
 const originalRenew=s.service.repository.renew,originalSave=s.service.repository.save;
 s.service.repository.renew=async(...args)=>{active=true;renewals++;await new Promise(r=>setTimeout(r,30));try{return await originalRenew(...args);}finally{active=false;}};
 s.service.repository.save=async(...args)=>{if(args[3].status==='COMPLETED')assert.equal(active,false,'A renewal cannot write while the final transaction commits');return originalSave(...args);};
 const run=await queued(s);await s.service.processNext();assert(renewals>=1);assert.equal((await s.service.get(s.owner,run.analytics_job_id)).status,'COMPLETED');
});
