// Explicit opt-in against the test environment authorized by the user.
// Creates one uniquely named verification tenant and removes only its records.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const infra=require('../infrastructure/soiMongo');
const baseArgument=process.argv.indexOf('--base-url');
const remoteBase=baseArgument>=0?process.argv[baseArgument+1]:null;
if(baseArgument>=0&&(!remoteBase||!/^https:\/\/[^/]+\.vercel\.app\/?$/.test(remoteBase)))throw new Error('Explicit HTTPS Vercel API URL required.');
const evidence=path.resolve(__dirname,remoteBase?'../../docs/evidence/soi-cloud-live.json':'../../docs/evidence/soi-mongo-live.json');
const runId=crypto.randomUUID(),name=`SOI VERIFICATION ONLY ${runId}`,email=`soi-verification-${runId}@example.invalid`;
const report={mode:'isolated_test_tenant_on_real_mongodb',run_id:runId,started_at:new Date().toISOString(),checks:[],gps_provider_tested:false,existing_records_modified:false};
if(remoteBase){report.mode='remote_api_with_local_owned_test_tenant_and_real_mongodb';report.api=remoteBase;}
let organizationId,userId,server,stage='authorization';
async function main(){
 if(!process.argv.includes('--test-environment'))throw new Error('EXPLICIT_TEST_ENVIRONMENT_REQUIRED');
 const db=await infra.getMongoDatabase();const hello=await db.command({hello:1});assert.ok(hello.setName||hello.msg==='isdbgrid');
 report.replica_set=true;stage='identity';
 const {service:identity}=require('../services/mongoIdentity.service');
 const password=crypto.randomBytes(24).toString('base64url');
 const registered=await identity.register({name:'Isolated verification user',email,password,organization_name:name});
 organizationId=registered.user.organization_id;userId=registered.user.user_id;
 let login=await identity.login({email,password});assert.equal(login.user.organization_id,organizationId);
 let base=remoteBase?.replace(/\/$/,'');
 if(base){const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.status,200,'Remote API must authenticate the locally owned test tenant before any remote writes.');login=await response.json();assert.equal(login.user.organization_id,organizationId);report.same_database_verified_by_login=true;}
 const express=require('express'),app=express();app.use(express.json());
 app.use('/soi/bsie',require('../routes/bsie.routes'));app.use('/soi/fleet',require('../routes/soiFleet.routes'));app.use('/soi/sanitary',require('../routes/soiSanitary.routes'));app.use('/soi',require('../routes/soi.routes'));
 app.use((error,req,res,next)=>res.status(error.statusCode||500).json({error:error.message}));
 if(!base){server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;}
 const call=async(url,body,method=body===undefined?'GET':'POST',extra={})=>{
  const response=await fetch(base+url,{method,headers:{Authorization:`Bearer ${login.token}`,'Content-Type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const json=await response.json();if(!response.ok){const error=new Error('LIVE_HTTP_CHECK_FAILED');error.statusCode=response.status;throw error;}return json;
 };
 report.checks.push('registration_login_and_current_membership');stage='core';
 await call('/soi/configuration',{sector:'general',capabilities:['assets','operations','fleet','incidents','imports','trips','crews','service_orders',...require('../soi/sanitary.contract').CAPABILITIES]},'PUT');
 const assets=[];
 for(let i=0;i<4;i++)assets.push((await call('/soi/assets',{name:`VERIFICATION ONLY asset ${i}`,longitude:-74+i*.001,latitude:4,capacity:i+1,external_id:`${runId}:${i}`,metadata:{validation_run_id:runId}})).data);
 assert.equal((await call('/soi/assets')).data.length,4);
 const crew=(await call('/soi/crews',{name:'VERIFICATION ONLY crew',member_user_ids:[userId]})).data;
 const operation=(await call('/soi/operations',{name:'VERIFICATION ONLY operation',operation_type:'test_only',crew_id:crew.crew_id})).data;
 await call(`/soi/operations/${operation.operation_id}/assets`,{asset_ids:assets.map(row=>row.location_id)},'PUT');
 assert.equal((await call(`/soi/operations/${operation.operation_id}/assets`)).data.asset_ids.length,4);
 const order=(await call('/soi/service-orders',{name:'VERIFICATION ONLY order',operation_id:operation.operation_id,crew_id:crew.crew_id,asset_ids:[assets[0].location_id]})).data;
 for(const status of ['assigned','in_progress','completed'])assert.equal((await call(`/soi/service-orders/${order.service_order_id}`,{status},'PATCH')).data.status,status);
 report.checks.push('assets_crews_operation_assignment_and_completed_service_order');
 const denied=await fetch(`${base}/soi/assets`,{headers:{Authorization:`Bearer ${login.token}`,'x-organization-id':String(organizationId+1000000)}});assert.equal(denied.status,403);
 report.checks.push('http_cross_organization_denied');stage='imports';
 const upload={format:'csv',source:{name:`VERIFICATION ONLY ${runId}`},content:`name,longitude,latitude,capacity,external_id\nVERIFICATION ONLY imported, -73.99,4,9,${runId}:import`};
 const preview=(await call('/soi/imports/preview',upload)).data;assert.equal(preview.valid,true);
 await call('/soi/imports/commit',{...upload,preview_hash:preview.preview_hash});assert.equal((await call('/soi/assets')).data.length,5);
 report.checks.push('csv_preview_and_atomic_commit');stage='rollback';
 const rollbackId=crypto.randomUUID();
 await assert.rejects(infra.withMongoTransaction(async(store,session)=>{await store.collection('soi_incidents').insertOne({organization_id:organizationId,incident_id:await infra.nextId('soi_incidents',session),validation_run_id:rollbackId},{session});throw new Error('INTENTIONAL_ROLLBACK');}),/INTENTIONAL_ROLLBACK/);
 assert.equal(await db.collection('soi_incidents').countDocuments({organization_id:organizationId,validation_run_id:rollbackId}),0);
 report.checks.push('real_transaction_rollback');stage='bsie';
 const input={operation:'local_moran',dataset:{kind:'assets'},variable:'capacity',weights:{method:'knn',k:2},permutations:19,seed:42};
 const job=(await call('/soi/bsie/jobs',input)).data;
 assert.equal((await call('/soi/bsie/jobs',input)).data.job_id,job.job_id);
 const {service:bsie}=require('../services/bsie.service');await bsie.processNext({organizationId,jobId:job.job_id});
 const completed=(await call(`/soi/bsie/jobs/${job.job_id}`)).data;assert.equal(completed.state,'COMPLETED');assert.equal(completed.result.result.observations.length,5);
 assert.equal((await call(`/soi/bsie/jobs/${job.job_id}/export`)).type,'FeatureCollection');
 const weightsInput={...input,operation:'weights'};await call('/soi/bsie/weights',weightsInput);assert.equal((await call('/soi/bsie/weights',weightsInput)).data.cache.hit,true);
 report.checks.push('python_worker_real_persistence_idempotency_export_and_weight_cache');stage='fleet';
 await call('/soi/vehicles',{name:'VERIFICATION ONLY vehicle without GPS',plate:`TEST-${runId.slice(0,8)}`,capacity:1});
 assert.equal((await call('/soi/fleet/status')).data[0].transmission_status,'NO_AUTHORIZED_TRANSMISSION');
 report.checks.push('fleet_truthful_no_provider_state');stage='sanitary';
 await require('./verify-soi-sanitary-live')({call,assets,order,report,runId});stage='audit';
 const {createMongoAuditService}=require('../services/soiMongoAudit.service');const audit=createMongoAuditService();
 await audit.logAuditEvent({organization_id:organizationId,user_id:userId,action:'verify',resource_type:'test_only',request_method:'POST',request_path:'/isolated-validation',status_code:200,metadata:{validation_run_id:runId}});
 const integrity=await audit.verifyAuditChain(organizationId);if(!integrity.valid){const error=new Error('LIVE_AUDIT_CHAIN_FAILED');error.diagnostic=integrity;throw error;}report.checks.push('persisted_audit_chain');stage='ttl';
 for(const collection of ['soi_trips','soi_trip_points','soi_vehicle_positions','bsie_jobs','bsie_weights'])assert.ok((await db.collection(collection).indexes()).some(index=>index.key.expires_at===1&&index.expireAfterSeconds===0));
 report.checks.push('server_ttl_index_configuration');report.ttl_sweep='not_waited';
 // Verify actual TTL on one already expired point, scoped to this disposable tenant.
 const pointId=await infra.withMongoTransaction(async(store,session)=>{const id=await infra.nextId('soi_trip_points',session);await store.collection('soi_trip_points').insertOne({point_id:id,organization_id:organizationId,user_id:userId,trip_id:-id,recorded_at:new Date(0),expires_at:new Date(0),validation_run_id:runId,source:'SIMULATED_VERIFICATION_ONLY'},{session});return id;});
 const until=Date.now()+90000;
 while(Date.now()<until){if(!await db.collection('soi_trip_points').findOne({point_id:pointId,organization_id:organizationId})){report.ttl_sweep='observed_server_deletion';report.checks.push('actual_server_ttl_deletion');break;}await new Promise(resolve=>setTimeout(resolve,5000));}
 if(report.ttl_sweep!=='observed_server_deletion')report.ttl_sweep='not_observed_within_90_seconds';
 report.status='passed';
}
async function cleanup(){
 if(!organizationId)return;const db=await infra.getMongoDatabase();
 const owner=await db.collection('identity_organizations').findOne({organization_id:organizationId,name});
 if(!owner)throw new Error('CLEANUP_OWNERSHIP_CHECK_FAILED');
 const memberships=await db.collection('identity_memberships').find({user_id:userId}).toArray();
 if(memberships.some(row=>row.organization_id!==organizationId))throw new Error('CLEANUP_UNEXPECTED_MEMBERSHIP');
 for(const collection of Object.keys(infra.INDEXES))if(!['identity_users','identity_organizations','soi_counters','soi_audit_heads'].includes(collection))await db.collection(collection).deleteMany({organization_id:organizationId});
 await db.collection('soi_audit_heads').deleteMany({_id:`organization:${organizationId}`});
 await db.collection('identity_users').deleteMany({user_id:userId,email});
 await db.collection('identity_organizations').deleteMany({organization_id:organizationId,name});
 report.cleanup='removed_only_verification_tenant_records';
}
main().catch(error=>{report.status='failed';report.failure={stage,code:error.statusCode||error.code||error.name,diagnostic:error.diagnostic||null,reason:error.statusCode||error.message?.startsWith('LIVE_')?error.message:undefined};process.exitCode=1;}).finally(async()=>{
 try{await cleanup();}catch(error){report.cleanup='failed_ownership_or_connection_check';process.exitCode=1;}
 server?.close();await infra.closeMongoConnection();report.finished_at=new Date().toISOString();fs.mkdirSync(path.dirname(evidence),{recursive:true});fs.writeFileSync(evidence,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});
