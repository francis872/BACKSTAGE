const test=require('node:test');
const assert=require('node:assert/strict');
process.env.JWT_SECRET='bsie-http-test-secret-only';
const {fixture}=require('./helpers/soiMongoMemoryFixture');
const {createBsieService,executePython,requestHash}=require('../services/bsie.service');
const {createMongoAuditService}=require('../services/soiMongoAudit.service');
const context={organizationId:7,userId:12,role:'analyst'};
function setup(seed={},runner=async payload=>({operation:payload.operation,result:{statistic:.5,geojson:{type:'FeatureCollection',features:[]}}})){
 const memory=fixture(seed);const infrastructure={getMongoDatabase:async()=>memory.options.database,withMongoTransaction:memory.options.transaction,nextId:memory.options.nextId,cleanDocument:row=>row};
 return{memory,infrastructure,service:createBsieService(infrastructure,runner)};
}
const input={operation:'moran',variable:'value',data:{type:'FeatureCollection',features:[0,1,2,3].map((i)=>({type:'Feature',id:String(i),geometry:{type:'Point',coordinates:[-74+i*.001,4]},properties:{value:i}}))},weights:{method:'knn',k:1},permutations:19};

test('BSIE jobs persist scoped results, deduplicate, export and deny other tenants',async()=>{
 const {service,memory}=setup();const job=await service.enqueue(context,{...input,organization_id:999,user_id:999});
 assert.equal(job.organization_id,7);assert.equal(job.created_by,12);assert.equal(job.input,undefined);
 assert.equal((await service.enqueue(context,input)).job_id,job.job_id);
 assert.equal((await service.list({...context,organizationId:99})).length,0);
 await assert.rejects(service.getJob({...context,organizationId:99},job.job_id),{statusCode:404});
 await assert.rejects(service.enqueue({...context,role:'viewer'},input),{statusCode:403});
 await service.processNext();assert.equal((await service.getJob(context,job.job_id)).state,'COMPLETED');
 assert.equal(memory.data().bsie_jobs[0].input.organization_id,undefined);
 assert.equal(await service.processNext(),null);
 memory.data().bsie_jobs[0].expires_at=new Date(0);
 await assert.rejects(service.getJob(context,job.job_id),{statusCode:404});
 const repeated=await service.enqueue(context,input);assert.notEqual(repeated.job_id,job.job_id);assert.equal(repeated.state,'QUEUED');
});

test('BSIE cancellation, retries, errors and crashed final lease are bounded',async()=>{
 const {service,memory}=setup({},async()=>{throw new Error('private path or environment details');});
 const job=await service.enqueue(context,input);await service.cancel(context,job.job_id);
 assert.equal(await service.processNext(),null);
 await service.retry(context,job.job_id);await service.processNext();
 assert.equal((await service.getJob(context,job.job_id)).state,'FAILED');
 assert.doesNotMatch((await service.getJob(context,job.job_id)).error,/private path/);
 memory.data().bsie_jobs[0].attempts=3;memory.data().bsie_jobs[0].state='RUNNING';memory.data().bsie_jobs[0].lease_until=new Date(0);
 await service.processNext();assert.equal((await service.getJob(context,job.job_id)).state,'FAILED');
 await assert.rejects(service.retry(context,job.job_id),{statusCode:409});
});

test('BSIE datasets and weight caches use current organization and exact immutable input',async()=>{
 let calls=0;const {service}=setup({soi_configuration:[{organization_id:7,capabilities:['assets']}],soi_assets:[{organization_id:7,location_id:1,capacity:5,geometry:input.data.features[0].geometry},{organization_id:99,location_id:2,capacity:999,geometry:input.data.features[1].geometry}]},async payload=>{calls++;return{operation:payload.operation};});
 const payload=await service.prepare(context,{operation:'weights',dataset:{kind:'assets'}});
 assert.equal(payload.data.features.length,1);assert.equal(payload.data.features[0].properties.capacity,5);
 await service.compute(context,{...input,operation:'weights'});await service.compute(context,{...input,operation:'weights'});assert.equal(calls,1);
 await service.compute({...context,organizationId:99},{...input,operation:'weights'});assert.equal(calls,2);
 assert.equal(requestHash({b:2,a:1}),requestHash({a:1,b:2}));
});

test('BSIE authenticated HTTP uses fresh role and supports queued result export',async t=>{
 const express=require('express'),{createToken}=require('../auth'),{resolveMembership}=require('../services/organization.service');
 const {createBsieRouter}=require('../routes/bsie.routes');const {service}=setup();let role='viewer';
 const app=express();app.use(express.json());app.use('/bsie',createBsieRouter(service,{organizationService:{getUserMemberships:async()=>[{organization_id:7,role}],resolveMembership}}));
 app.use((error,req,res,next)=>res.status(error.statusCode||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');t.after(()=>server.close());await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/bsie`;
 const headers={Authorization:`Bearer ${createToken({user_id:12,organization_id:7,role:'admin'})}`,'Content-Type':'application/json'};
 assert.equal((await fetch(`${base}/methods`)).status,401);
 assert.equal((await fetch(`${base}/moran`,{method:'POST',headers,body:JSON.stringify(input)})).status,403);
 role='analyst';const response=await fetch(`${base}/jobs`,{method:'POST',headers,body:JSON.stringify(input)});assert.equal(response.status,202);const job=(await response.json()).data;
 await service.processNext();const exported=await fetch(`${base}/jobs/${job.job_id}/export`,{headers});assert.equal(exported.status,200);assert.equal((await exported.json()).type,'FeatureCollection');
 const previous=process.env.BSIE_REQUEST_WORKER;process.env.BSIE_REQUEST_WORKER='true';
 try{const inline=await fetch(`${base}/jobs`,{method:'POST',headers,body:JSON.stringify({...input,seed:847})});assert.equal(inline.status,202);const created=(await inline.json()).data;assert.equal((await service.getJob(context,created.job_id)).state,'COMPLETED');}
 finally{if(previous===undefined)delete process.env.BSIE_REQUEST_WORKER;else process.env.BSIE_REQUEST_WORKER=previous;}
 assert.equal((await fetch(`${base}/jobs/${job.job_id}`,{headers:{...headers,'x-organization-id':'99'}})).status,403);
});

test('Mongo audit chain detects content tampering and deletion of its final event',async()=>{
 const{memory,infrastructure}=setup();const audit=createMongoAuditService(infrastructure);
 const entry={organization_id:7,user_id:12,action:'create',resource_type:'soi',request_method:'POST',request_path:'/soi/assets',status_code:201,metadata:{test:true}};
 await audit.logAuditEvent(entry);await audit.logAuditEvent(entry);await audit.logAuditEvent({...entry,organization_id:99});
 assert.equal((await audit.listAuditLogs({organizationId:7})).length,2);
 assert.equal((await audit.verifyAuditChain(7)).valid,true);
 const original=memory.data().soi_audit_events[0].action;memory.data().soi_audit_events[0].action='modified';assert.equal((await audit.verifyAuditChain(7)).valid,false);memory.data().soi_audit_events[0].action=original;
 const timestamp=memory.data().soi_audit_events[0].created_at;memory.data().soi_audit_events[0].created_at=new Date(0);assert.equal((await audit.verifyAuditChain(7)).valid,false);memory.data().soi_audit_events[0].created_at=timestamp;
 memory.data().soi_audit_events.splice(1,1);assert.equal((await audit.verifyAuditChain(7)).valid,false);
});

test('Mongo audit hashes survive actual BSON serialization of optional request metadata',async()=>{
 const{infrastructure}=setup();const audit=createMongoAuditService(infrastructure);
 const row=await audit.logAuditEvent({organization_id:7,user_id:12,action:'create',resource_type:'soi',request_method:'POST',request_path:'/soi/imports/preview',status_code:200,metadata:{preview_hash:undefined,source:{name:'fixture',optional:undefined},values:[undefined,1]}});
 assert.equal(Object.hasOwn(row.metadata,'preview_hash'),false);assert.deepEqual(row.metadata.values,[null,1]);
 const{BSON}=require('mongodb'),{hashEntry}=require('../services/soiMongoAudit.service');const persisted=BSON.deserialize(BSON.serialize(row));
 assert.equal(hashEntry(persisted,persisted.prev_hash),persisted.event_hash);assert.equal((await audit.verifyAuditChain(7)).valid,true);
});

test('Node invokes real Python engine without blocking the event loop',async()=>{
 let timerFired=false;setTimeout(()=>{timerFired=true;},0);
 const result=await executePython(input,{organizationId:'test-node-python'});
 assert.equal(result.operation,'moran');assert.equal(Number.isFinite(result.result.statistic),true);assert.equal(timerFired,true);
 assert(result.result.interpretation.includes('autocorrelación'));assert(!JSON.stringify(result).includes('\uFFFD'));
});
