// Bounded staging verification, not a stress/DoS test or a production capacity certificate.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {MongoClient,BSON}=require('mongodb');
const {state,root}=require('../../scripts/staging-vercel');
const mongo=require('../infrastructure/platformMongo');
const {consumeBucket}=require('../middleware/atlasRateLimiter');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function parallel(total,concurrency,work){let next=0;const result=[];await Promise.all(Array.from({length:concurrency},async()=>{for(;;){const i=next++;if(i>=total)return;result[i]=await work(i);}}));return result;}
function timings(rows){const sorted=rows.map(r=>r.duration_ms).sort((a,b)=>a-b);return{requests:rows.length,successes:rows.filter(r=>r.status===200).length,p50_ms:sorted[Math.ceil(sorted.length*.5)-1],p95_ms:sorted[Math.ceil(sorted.length*.95)-1],max_ms:sorted.at(-1)};}
async function run(){
 const runId=`readiness-load-${new Date().toISOString().replace(/\D/g,'').slice(0,14)}-${crypto.randomBytes(6).toString('hex')}`;
 const directory=path.join(root,'.vercel',runId);fs.mkdirSync(directory,{recursive:true});
 const report={run_id:runId,started_at:new Date().toISOString(),scope:'protected_staging_bounded_load_security_and_recovery',maximum_http_concurrency:10,checks:[],production_capacity_certified:false,real_atlas_outage_injected:false};
 let db,account,reader;const technicalKeys=[];
 const marker=`BACKSTAGE LOAD TEST ${runId}`;
 const check=(name,detail={})=>{report.checks.push({name,passed:true,...detail});console.log(JSON.stringify({stage:name}));};
 async function request(route,{type='web',body,raw,method=body||raw?'POST':'GET',session=account?.session,expected=200}={}){
  const p=state.projects[type];assert.equal(p.name,`backstage-staging-${type}`);assert.equal(p.deployment.target,'preview');
  const headers={'x-vercel-protection-bypass':p.bypass,'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`,'X-Organization-Id':String(session.user.organization_id)}:{})};
  const started=performance.now(),res=await fetch(`https://${p.deployment.url.replace(/^https:\/\//,'')}${type==='web'?'/api':''}${route}`,{method,headers,redirect:'error',signal:AbortSignal.timeout(20000),...(body||raw?{body:raw||JSON.stringify(body)}:{})});
  const text=await res.text();let value;try{value=JSON.parse(text)}catch{value=null;}
  if(expected!=null)assert.equal(res.status,expected,`${method} ${route} unexpected status`);
  return{status:res.status,value,duration_ms:Math.round(performance.now()-started),retry_after:res.headers.get('retry-after'),request_id:res.headers.get('x-request-id')};
 }
 const keyFor=(namespace,email)=>`auth-rate:${namespace}:${crypto.createHmac('sha256',state.jwt_secret).update(email.trim().toLowerCase()).digest('hex')}`;
 try{
  db=await mongo.getMongoDatabase();assert.equal(crypto.createHash('sha256').update(`${process.env.MONGODB_URI}\n${db.databaseName}`).digest('hex'),state.target_fingerprint);
  const email=`${runId}@example.invalid`,invalidEmail=`${runId}-invalid@example.invalid`;
  technicalKeys.push(keyFor('register',email),keyFor('login',invalidEmail),`readiness-rate:${runId}`);
  account={name:marker,organization_name:marker,email,password:crypto.randomBytes(24).toString('base64url')};
  fs.writeFileSync(path.join(directory,'ownership.json'),JSON.stringify({run_id:runId,marker,email,technical_keys:technicalKeys}),{mode:0o600});
  account.session=(await request('/auth/register',{session:null,body:account,expected:201})).value;
  fs.writeFileSync(path.join(directory,'account.json'),JSON.stringify(account),{mode:0o600});
  const org=account.session.user.organization_id,user=account.session.user.user_id;
  fs.writeFileSync(path.join(directory,'ownership.json'),JSON.stringify({run_id:runId,marker,email,organization_id:org,user_id:user,technical_keys:technicalKeys}),{mode:0o600});
  report.load=[];
  for(const[concurrency,total]of[[1,12],[5,25],[10,40]]){
   const rows=await parallel(total,concurrency,()=>request('/health',{session:null}));assert(rows.every(r=>r.value?.mongodb==='healthy'&&r.request_id));
   const stats=timings(rows);report.load.push({route:'web_proxy_health',concurrency,...stats});assert(stats.p95_ms<5000,'Technical staging p95 budget of 5s exceeded');
  }
  const reads=await parallel(25,5,i=>request(i%2?'/assets?limit=20':'/analysis?limit=20'));
  assert(reads.every(r=>r.request_id));report.load.push({route:'authenticated_own_tenant_reads',concurrency:5,...timings(reads)});
  check('bounded_proxy_and_authenticated_load_without_http_errors',{requests:102,observations:report.load});
  const created=await parallel(8,4,i=>request('/analysis/projects',{body:{project_name:`${marker} project ${i}`},expected:201}));
  const ids=created.map(r=>r.value.analysis_run_id);assert.equal(new Set(ids).size,8);assert.equal(await db.collection('analysis_runs').countDocuments({organization_id:org}),8);
  check('concurrent_project_writes_have_unique_ids_and_independent_persistence',{writes:8,concurrency:4});
  const policy=(await request('/operations/business-rules')).value;
  const payload={revision:policy.revision,sla_hours:{...policy.rules.sla_hours,probability_pending:36},source_max_age_hours:policy.rules.source_max_age_hours,exception_max_hours:policy.rules.exception_max_hours};
  const conflict=await parallel(2,2,()=>request('/operations/business-rules',{method:'PUT',body:payload,expected:null}));assert.deepEqual(conflict.map(r=>r.status).sort(),[200,409]);
  check('concurrent_policy_edit_detects_stale_revision_in_real_atlas_transaction');
  reader=new MongoClient(process.env.MONGODB_URI,{...require('../infrastructure/mongoDns').configureMongoDns(),maxPoolSize:5,serverSelectionTimeoutMS:15000});await reader.connect();
  const bucket=technicalKeys[2];
  const values=await parallel(25,5,i=>consumeBucket(i%2?db:reader.db(db.databaseName),bucket,10000));assert.deepEqual(values.map(v=>v.count).sort((a,b)=>a-b),Array.from({length:25},(_,i)=>i+1));
  await db.collection('soi_provider_locks').updateOne({_id:bucket},{$set:{reset_at:new Date(0)}});assert.equal((await consumeBucket(reader.db(db.databaseName),bucket,10000)).count,1);
  const before=await db.collection('soi_provider_locks').findOne({_id:bucket});
  await assert.rejects(mongo.withMongoTransaction(async(store,session)=>{await store.collection('soi_provider_locks').updateOne({_id:bucket},{$set:{count:999}},{session});throw Error('intentional rollback');}),/intentional rollback/);
  assert.deepEqual(await reader.db(db.databaseName).collection('soi_provider_locks').findOne({_id:bucket}),before);
  check('cross_client_atomic_limiter_window_reset_and_transaction_rollback');
  const attempts=await parallel(12,4,i=>request('/auth/login',{type:i%2?'api':'web',session:null,body:{email:i%2?invalidEmail.toUpperCase():invalidEmail,password:'invalid-password-only'},expected:null}));
  assert.equal(attempts.filter(r=>r.status===401).length,10);assert.equal(attempts.filter(r=>r.status===429).length,2);assert(attempts.filter(r=>r.status===429).every(r=>r.retry_after));
  check('hosted_api_and_proxy_share_account_budget_10_denials_then_2_rate_limits_with_retry_after');
  await request('/auth/login',{session:null,body:{email:{$ne:null},password:'invalid-only'},expected:400});
  await request('/assets',{raw:'{"broken":',expected:400});
  await request('/analytics/gis',{body:{coordinates:Array.from({length:101},(_,i)=>[i*.001,0]),source:{name:marker,data_type:'SIMULATED'}},expected:400});
  await request('/analytics/gis',{body:{source:{name:'x'.repeat(210000),data_type:'SIMULATED'},coordinates:[[0,0],[1,0]]},expected:413});
  check('structured_identity_injection_malformed_json_node_cap_and_payload_limits_rejected');
  const unreachable=new MongoClient('mongodb://127.0.0.1:9',{serverSelectionTimeoutMS:500,connectTimeoutMS:500});try{await assert.rejects(unreachable.connect());}finally{await unreachable.close();}
  await db.command({ping:1});await request('/health',{session:null});
  check('separate_client_connection_failure_bounded_and_live_service_remains_healthy',{real_service_outage:false});
  await db.collection('identity_memberships').deleteOne({organization_id:org,user_id:user});await request('/assets',{expected:403});
  check('revoked_membership_denies_existing_token_after_load');
  report.status='passed';
 }catch(error){report.status='failed';report.failure={name:error.name,code:error.code||null,message:error.message.slice(0,220)};process.exitCode=1;}
 finally{
  try{
   if(account?.session&&db){
    await pause(3000);const org=account.session.user.organization_id,user=account.session.user.user_id;
    assert.equal((await db.collection('identity_organizations').findOne({organization_id:org})).name,marker);assert.equal((await db.collection('identity_users').findOne({user_id:user})).email,account.email);
    assert.equal(await db.collection('identity_memberships').countDocuments({user_id:user,organization_id:{$ne:org}}),0);
    const names=(await db.listCollections({},{nameOnly:true}).toArray()).map(c=>c.name);
    const filters=Object.fromEntries(names.map(name=>[name,name==='identity_users'?{user_id:user}:name==='soi_audit_heads'?{_id:`organization:${org}`}:{organization_id:org}]));
    const snapshot={run_id:runId,collections:{}};for(const name of names){const rows=await db.collection(name).find(filters[name]).toArray();if(rows.length)snapshot.collections[name]=rows;}
    const raw=BSON.serialize(snapshot);fs.writeFileSync(path.join(directory,'owned-test-records.bson'),raw,{mode:0o600});
    await mongo.withMongoTransaction(async(store,session)=>{for(const name of Object.keys(snapshot.collections))await store.collection(name).deleteMany(filters[name],{session});});
    for(const name of names)assert.equal(await db.collection(name).countDocuments(filters[name]),0);
    report.cleanup={owned_tenant_rows_remaining:0,operational_documents_deleted:false,shared_counters_preserved:true,global_security_traces_preserved:true,private_backup_sha256:crypto.createHash('sha256').update(raw).digest('hex')};
   }
   if(db){for(const key of technicalKeys){assert(key.startsWith('auth-rate:')||key===`readiness-rate:${runId}`);await db.collection('soi_provider_locks').deleteOne({_id:key});}report.owned_technical_buckets_remaining=await db.collection('soi_provider_locks').countDocuments({_id:{$in:technicalKeys}});assert.equal(report.owned_technical_buckets_remaining,0);}
  }catch(error){report.cleanup={passed:false,code:error.code||error.name};report.status='failed';process.exitCode=1;}
  await reader?.close();await mongo.closeMongoConnection();report.finished_at=new Date().toISOString();fs.writeFileSync(path.join(directory,'validation-report.json'),JSON.stringify(report,null,2),{mode:0o600});fs.writeFileSync(path.join(root,'docs/backstage-2.0/evidence/readiness-load-security.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
}
if(require.main===module){if(process.argv.includes('--apply')&&process.argv.includes('--test-environment'))run().catch(e=>{console.error(JSON.stringify({failed:true,name:e.name,code:e.code}));process.exitCode=1});else console.log(JSON.stringify({mode:'plan_only',maximum_http_concurrency:10,target:'authorized_protected_staging_and_new_test_tenant',cleanup:'only_run_owned_rows_and_technical_buckets',real_atlas_outage:false}));}
module.exports={parallel,timings};
