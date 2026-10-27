const test=require('node:test'),assert=require('node:assert/strict');
process.env.JWT_SECRET='isolated-account-recovery-and-sessions';process.env.BCRYPT_ROUNDS='4';
const {fixture}=require('./helpers/soiMongoMemoryFixture');
const {createMongoIdentityService}=require('../services/mongoIdentity.service');
const {createAccountSecurityService}=require('../services/accountSecurity.service');
const {verifyToken}=require('../auth');
const context=token=>{const p=verifyToken(token);return {user_id:Number(p.sub),session_version:p.sv??0,session_id:p.jti||null};};
async function setup(){
 const f=fixture(),infra={getMongoDatabase:async()=>f.options.database,withMongoTransaction:f.options.transaction,nextId:f.options.nextId,cleanDocument:r=>r};
 const identity=createMongoIdentityService(infra),credentials={email:'security@example.invalid',name:'Fixture owner',password:'fixture-old-password',organization_name:'Fixture organization'};
 const account=await identity.register(credentials),messages=[];let timestamp=Date.now();
 const options={now:()=>timestamp,sleep:async()=>{},mailer:{configured:()=>true,send:async m=>messages.push(m)}};
 return {f,infra,identity,credentials,account,messages,options,security:createAccountSecurityService(infra,options),context:context(account.token),advance:ms=>{timestamp+=ms;}};
}
test('reset sends one private link, keeps only its hash and preserves accounts, membership and administrator role',async()=>{
 const s=await setup(),before=structuredClone(s.f.data().identity_memberships),job=await s.security.requestReset({email:s.credentials.email});
 assert.deepEqual(Object.keys(job.response),['message']);await job.dispatch();const message=s.messages[0];assert.match(message.token,/^[A-Za-z0-9_-]{43}$/);
 assert(!JSON.stringify(s.f.data()).includes(message.token));assert(!JSON.stringify(s.f.data().soi_audit_events).includes(s.credentials.email));
 await s.security.resetPassword({token:message.token,password:'fixture-new-password'});
 await assert.rejects(s.security.validateSession(s.context),{statusCode:401});
 await assert.rejects(s.identity.login({email:s.credentials.email,password:s.credentials.password}),{statusCode:401});
 const login=await s.identity.login({email:s.credentials.email,password:'fixture-new-password'});assert.equal(login.user.role,'admin');assert.equal(login.user.user_id,s.account.user.user_id);assert.deepEqual(s.f.data().identity_memberships,before);assert.equal(s.f.data().identity_users.length,1);
 await assert.rejects(s.security.resetPassword({token:message.token,password:'another-password'}),{statusCode:410});
});
test('unknown accounts and cooldown return the same response; missing mail is explicit for every account',async()=>{
 const s=await setup(),known=await s.security.requestReset({email:s.credentials.email}),unknown=await s.security.requestReset({email:'absent@example.invalid'}),cooldown=await s.security.requestReset({email:s.credentials.email});
 assert.deepEqual(known.response,unknown.response);assert.deepEqual(known.response,cooldown.response);assert.equal(unknown.dispatch,null);assert.equal(cooldown.dispatch,null);
 const unavailable=createAccountSecurityService(s.infra,{...s.options,mailer:{configured:()=>false}});
 for(const email of[s.credentials.email,'absent@example.invalid'])await assert.rejects(unavailable.requestReset({email}),{statusCode:503});
 assert.equal(unavailable.capabilities().password_recovery_email,false);
});
test('tokens expire, have one purpose, and a failed mail delivery cannot leave a usable link',async()=>{
 const s=await setup(),verification=await s.security.requestVerification(s.context);await verification.dispatch();const verifyToken=s.messages.at(-1).token;
 await assert.rejects(s.security.resetPassword({token:verifyToken,password:'fixture-new-password'}),{statusCode:410});
 await s.security.verifyEmail({token:verifyToken});assert.equal((await s.identity.me(s.account.user.user_id,s.account.user.organization_id)).email_verified,true);
 const reset=await s.security.requestReset({email:s.credentials.email});await reset.dispatch();s.advance(30*60*1000+1);await assert.rejects(s.security.resetPassword({token:s.messages.at(-1).token,password:'fixture-new-password'}),{statusCode:410});
 let failedToken;const failed=createAccountSecurityService(s.infra,{...s.options,mailer:{configured:()=>true,send:async m=>{failedToken=m.token;throw Error('fixture provider failure');}}});
 const job=await failed.requestReset({email:s.credentials.email});await job.dispatch();await assert.rejects(failed.resetPassword({token:failedToken,password:'fixture-new-password'}),{statusCode:410});
});
test('revoking one session preserves another; closing all invalidates tracked and legacy tokens',async()=>{
 const s=await setup(),other=await s.identity.login(s.credentials),otherContext=context(other.token),sessions=await s.security.sessions(s.context);
 assert.equal(sessions.data.length,2);const current=sessions.data.find(row=>row.current);assert(current);
 const result=await s.security.revoke(otherContext,{id:current.id});assert.equal(result.current_session_closed,false);await assert.rejects(s.security.validateSession(s.context),{statusCode:401});await s.security.validateSession(otherContext);
 const legacy={user_id:s.account.user.user_id,session_version:0,session_id:null};await s.security.validateSession(legacy);
 await assert.rejects(s.security.revoke(otherContext,{all:true,current_password:'wrong-password'}),{statusCode:403});
 await s.security.revoke(otherContext,{all:true,current_password:s.credentials.password});await assert.rejects(s.security.validateSession(otherContext),{statusCode:401});await assert.rejects(s.security.validateSession(legacy),{statusCode:401});
});
test('password change requires current credentials and revokes old access without rotating signing keys',async()=>{
 const s=await setup();await assert.rejects(s.security.changePassword(s.context,{current_password:'wrong-password',password:'fixture-new-password'}),{statusCode:403});await s.security.validateSession(s.context);
 await s.security.changePassword(s.context,{current_password:s.credentials.password,password:'fixture-new-password'});await assert.rejects(s.security.validateSession(s.context),{statusCode:401});
 await assert.rejects(s.identity.getUserMemberships(s.context.user_id,s.context),{statusCode:401});assert.equal(s.f.data().identity_memberships[0].role,'admin');
});
test('audit failure rolls back a password mutation and unknown input cannot modify roles or target another account',async()=>{
 const s=await setup();for(const extra of[{role:'admin'},{user_id:999},{organization_id:999}])await assert.rejects(s.security.changePassword(s.context,{current_password:s.credentials.password,password:'fixture-new-password',...extra}),{statusCode:400});
 const before=structuredClone(s.f.data().identity_users),broken=createAccountSecurityService({...s.infra,withMongoTransaction:work=>s.f.options.transaction((db,session)=>work({collection(name){const c=db.collection(name);if(name==='soi_audit_events')c.insertOne=async()=>{throw Error('fixture failed audit');};return c;}},session))},s.options);
 await assert.rejects(broken.changePassword(s.context,{current_password:s.credentials.password,password:'fixture-new-password'}),/fixture failed audit/);assert.deepEqual(s.f.data().identity_users,before);await s.security.validateSession(s.context);
});
test('session list is bounded and never returns bearer identifiers, hashes or another account sessions',async()=>{
 const s=await setup();for(let i=0;i<21;i++)await s.identity.login(s.credentials);const fresh=await s.identity.login(s.credentials),sessions=await s.security.sessions(context(fresh.token));assert.equal(sessions.data.length,20);assert(!JSON.stringify(sessions).includes(context(fresh.token).session_id));assert(!JSON.stringify(sessions).includes('password_hash'));
 const other=await s.identity.register({...s.credentials,email:'other@example.invalid'});await assert.rejects(s.security.revoke(context(other.token),{id:sessions.data[0].id}),{statusCode:404});
});
