// Opt-in real protected staging + authorized Atlas test. Only newly owned accounts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {state,root,api}=require('../../scripts/staging-vercel');
const {request,browser}=require('./verify-staging');
const {ownedFilters,COLLECTIONS}=require('./verify-platform-core-atlas');
async function run(){
 const mongo=require('../infrastructure/platformMongo'),{BSON}=require('mongodb');
 const {createAccountSecurityService}=require('../services/accountSecurity.service');
 const runId=`atlas-core-${new Date().toISOString().replace(/\D/g,'').slice(0,14)}-${crypto.randomBytes(6).toString('hex')}`;
 const marker=`BACKSTAGE AUTH TEST ${runId}`,directory=path.join(root,'.vercel',`staging-${runId}`);fs.mkdirSync(directory,{recursive:true});
 const previous=path.join(root,'docs/evidence/account-security-live.json');if(fs.existsSync(previous)){const old=JSON.parse(fs.readFileSync(previous,'utf8'));fs.copyFileSync(previous,path.join(root,`docs/evidence/account-security-live-${old.run_id}.json`));}
 const ownership={run_id:runId,organization_ids:[],user_ids:[],organizations:{},users:{}},accounts=[];
 const report={run_id:runId,started_at:new Date().toISOString(),mode:'real_protected_staging_atlas_controlled_mail_transport',api_interception:false,real_email_delivery:false,production_changes:false,checks:[]};
 let db,b,stage='preflight';
 const save=()=>{fs.writeFileSync(path.join(directory,'accounts-private.json'),JSON.stringify(accounts,null,2),{mode:0o600});fs.writeFileSync(path.join(directory,'ownership.json'),JSON.stringify(ownership,null,2),{mode:0o600});};
 const check=name=>{report.checks.push({name,passed:true});console.log(JSON.stringify({stage:name}));};
 const context=account=>{const p=JSON.parse(Buffer.from(account.session.token.split('.')[1],'base64url'));return {user_id:account.session.user.user_id,session_version:p.sv??0,session_id:p.jti||null};};
 try{
  for(const type of['api','web']){assert.equal(state.projects[type].deployment.target,'preview');assert.equal(state.projects[type].deployment.readyState,'READY');assert.equal(state.projects[type].name,`backstage-staging-${type}`);}
  db=await mongo.getMongoDatabase();report.target_fingerprint=crypto.createHash('sha256').update(`${process.env.MONGODB_URI}\n${db.databaseName}`).digest('hex');assert.equal(report.target_fingerprint,state.target_fingerprint);
  report.deployments=Object.fromEntries(['api','web'].map(type=>[type,state.projects[type].deployment]));
  const production=JSON.parse(fs.readFileSync(path.join(root,'.vercel/production-release-private.json'),'utf8'));
  for(const type of['api','web']){const alias=await api(`/v4/aliases/${production.projects[type].domain}`);assert.equal(alias.deploymentId,production.projects[type].deployment.id);}
  check('staging_target_fingerprint_and_original_production_unchanged');
  for(const type of['api','web']){const cap=await request('/auth/capabilities',{type});assert.equal(cap.value.password_recovery_email,false);assert.equal(cap.value.email_verification,false);}
  check('missing_email_provider_truthfully_reported_through_api_and_proxy');
  stage='registration';
  const owner={email:`${runId}-auth@example.invalid`,password:crypto.randomBytes(24).toString('base64url'),name:marker,organization_name:marker};accounts.push(owner);save();
  owner.session=(await request('/auth/register',{body:owner,expected:201})).value;const original={...owner.session.user};ownership.organization_ids.push(original.organization_id);ownership.user_ids.push(original.user_id);ownership.organizations[original.organization_id]=marker;ownership.users[original.user_id]=owner.email;save();
  for(const email of[owner.email,`${runId}-unknown@example.invalid`]){const r=await request('/auth/forgot-password',{body:{email},expected:503});assert.equal(r.value.code,'AUTH_EMAIL_UNAVAILABLE');}
  assert.equal((await request('/auth/reset-password',{body:{token:'x'.repeat(43),password:'unused-fixture-password'},expected:410})).status,410);
  check('known_and_unknown_recovery_unavailable_and_invalid_link_rejected');
  stage='browser_change';b=await browser('account-security',directory);await b.navigate('/login');await b.until("!!document.getElementById('login-email')");await b.set('#login-email',owner.email);await b.set('#login-password',owner.password);await b.evaluate("document.getElementById('login-email').closest('form').requestSubmit();true");await b.until("!!localStorage.getItem('backstage_token') && !!document.querySelector('.origin-topbar')");await b.navigate('/dashboard?page=profile');await b.until("!!document.getElementById('security-current-password')");
  await b.evaluate("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Cambiar mi contraseña').click();true");
  const beforeChange=owner.session,newPassword=crypto.randomBytes(24).toString('base64url');
  await b.set('#security-current-password',owner.password);await b.set('#security-new-password',newPassword);await b.set('#security-confirm-password',newPassword);await b.evaluate("document.getElementById('security-current-password').closest('form').requestSubmit();true");await b.until("!!document.getElementById('login-password') && !localStorage.getItem('backstage_token')");
  owner.password=newPassword;save();
  for(const route of['/auth/me','/auth/sessions','/analysis'])await request(route,{session:beforeChange,expected:401});
  owner.session=(await request('/auth/login',{body:{email:owner.email,password:owner.password}})).value;save();assert.equal(owner.session.user.user_id,original.user_id);assert.equal(owner.session.user.organization_id,original.organization_id);assert.equal(owner.session.user.role,original.role);
  check('real_browser_password_change_revokes_old_token_and_preserves_identity_and_permissions');
  stage='controlled_verification';
  const messages=[],security=createAccountSecurityService(mongo,{mailer:{configured:()=>true,send:async message=>{messages.push(message);return {accepted:true};}}});
  const verification=await security.requestVerification(context(owner));await verification.dispatch();const verifyToken=messages.at(-1).token;
  assert(!JSON.stringify(await db.collection('identity_users').findOne({user_id:original.user_id})).includes(verifyToken));
  await request('/auth/reset-password',{body:{token:verifyToken,password:crypto.randomBytes(24).toString('base64url')},expected:410});await request('/auth/verify-email',{body:{token:verifyToken}});await request('/auth/verify-email',{body:{token:verifyToken},expected:410});assert.equal((await request('/auth/me',{session:owner.session})).value.email_verified,true);
  check('controlled_verification_token_is_hashed_single_use_and_purpose_bound_in_real_atlas');
  stage='controlled_reset';
  const reset=await security.requestReset({email:owner.email});await reset.dispatch();const token=messages.at(-1).token;assert(!JSON.stringify(await db.collection('identity_users').findOne({user_id:original.user_id})).includes(token));
  const resetPassword=crypto.randomBytes(24).toString('base64url'),resetSession=owner.session;
  const results=await Promise.all([1,2].map(()=>request('/auth/reset-password',{body:{token,password:resetPassword},expected:null})));assert.deepEqual(results.map(r=>r.status).sort(),[200,410]);owner.password=resetPassword;save();
  await request('/auth/me',{session:resetSession,expected:401});owner.session=(await request('/auth/login',{body:{email:owner.email,password:owner.password}})).value;save();assert.equal(owner.session.user.user_id,original.user_id);assert.equal(owner.session.user.role,original.role);
  check('concurrent_real_atlas_reset_consumes_once_and_revokes_previous_sessions');
  stage='sessions';const second=(await request('/auth/login',{body:{email:owner.email,password:owner.password}})).value;
  const sessions=(await request('/auth/sessions',{session:owner.session})).value;assert(sessions.data.length>=2);const current=sessions.data.find(r=>r.current);assert(current);await request(`/auth/sessions/${current.id}`,{session:second,method:'DELETE'});await request('/auth/me',{session:owner.session,expected:401});await request('/auth/me',{session:second});
  await request('/auth/sessions/revoke-all',{session:second,body:{current_password:owner.password}});await request('/auth/me',{session:second,expected:401});check('single_session_revocation_preserves_other_access_and_revoke_all_closes_it');
  assert.equal(b.errors.length,0);report.browser_runtime_errors=0;report.status='passed';
 }catch(error){report.status='failed';report.failure={stage,name:error.name,message:String(error.message).split('\n')[0].slice(0,220),cause:error.cause?.code||null};process.exitCode=1;}
 finally{
  b?.close();
  if(db)try{
   for(const account of accounts){const u=await db.collection('identity_users').findOne({email:account.email});if(!u)continue;const m=await db.collection('identity_memberships').findOne({user_id:u.user_id});const o=m&&await db.collection('identity_organizations').findOne({organization_id:m.organization_id});assert.equal(u.name,marker);assert.equal(o?.name,marker);assert.equal(await db.collection('identity_memberships').countDocuments({user_id:u.user_id}),1);if(!ownership.user_ids.includes(u.user_id)){ownership.user_ids.push(u.user_id);ownership.organization_ids.push(o.organization_id);ownership.users[u.user_id]=account.email;ownership.organizations[o.organization_id]=marker;save();}}
   if(ownership.user_ids.length){const filters=ownedFilters(ownership),snapshot={run_id:runId,collections:{}};for(const name of COLLECTIONS)snapshot.collections[name]=await db.collection(name).find(filters[name]).toArray();const bytes=BSON.serialize(snapshot);fs.writeFileSync(path.join(directory,'owned-test-records.bson'),bytes,{mode:0o600});await mongo.withMongoTransaction(async(store,session)=>{for(const name of COLLECTIONS)await store.collection(name).deleteMany(filters[name],{session});});for(const name of COLLECTIONS)assert.equal(await db.collection(name).countDocuments(filters[name]),0);report.cleanup={passed:true,only_owned_test_records:true,global_security_traces_and_shared_counters_preserved:true,backup_sha256:crypto.createHash('sha256').update(bytes).digest('hex')};}
  }catch(error){report.status='failed';report.cleanup={passed:false,code:error.code||error.name};process.exitCode=1;}
  await mongo.closeMongoConnection();report.completed_at=new Date().toISOString();fs.writeFileSync(path.join(directory,'validation-report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'docs/evidence/account-security-live.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
}
if(require.main===module){if(process.argv.includes('--apply')&&process.argv.includes('--test-environment'))run().catch(error=>{console.error(JSON.stringify({failed:true,name:error.name}));process.exitCode=1;});else console.log(JSON.stringify({mode:'plan_only',target:'protected_staging_confirmed_atlas_test',writes:'one newly marked account and organization; own credentials, hashed actions, sessions and audit',real_email_delivery:false,cleanup:'private BSON snapshot; delete only proved owned records; preserve global security traces and counters'}));}
module.exports={run};
