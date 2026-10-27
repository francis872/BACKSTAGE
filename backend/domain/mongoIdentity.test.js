const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'local-mongo-identity-fixture-test-secret';
process.env.BCRYPT_ROUNDS = '4';
const { createMongoIdentityService, service, INDEX_PLAN } = require('../services/mongoIdentity.service');
const { fakeIdentityMongo } = require('./helpers/fakeIdentityMongo');
const credentials = { email: 'owner@example.test', name: 'Workspace Owner', password: 'local-strong-password', organization_name: 'Organización Uno' };

test('Mongo identity indexes have no user seeds; registration and login keep public numeric IDs and omit secrets', async () => {
  const infra = fakeIdentityMongo(), identity = createMongoIdentityService(infra);

  await identity.initializeIdentityIndexes(); assert.equal(infra.indexes.length,INDEX_PLAN.length);
  assert.equal(infra.documents('identity_users').length,0);
  const result = await identity.register(credentials);
  assert.equal(typeof result.user.user_id,'number'); assert.equal(typeof result.user.organization_id,'number');
  assert.equal(result.user.role,'admin'); assert.equal(result.user.password_hash,undefined); assert.equal(result.user._id,undefined);
  assert(result.token); assert(infra.documents('identity_users')[0].password_hash.startsWith('$2'));
  const loggedIn = await identity.login({ email: ' OWNER@example.test ', password: credentials.password });
  assert.equal(loggedIn.user.organization_id,result.user.organization_id);
  assert.equal((await identity.me(result.user.user_id,result.user.organization_id)).password_hash,undefined);
  assert(infra.writes.every((item) => item.options?.session), 'all identity mutations use the active transaction');
});

test('Mongo registration rolls back organization and user on membership failure, rejects duplicate or role injection', async () => {
  const infra = fakeIdentityMongo(), identity = createMongoIdentityService(infra);
  infra.failNextInsert('identity_memberships');
  await assert.rejects(identity.register(credentials), { statusCode: 503 });
  assert.equal(infra.documents('identity_users').length,0); assert.equal(infra.documents('identity_organizations').length,0);
  await identity.register(credentials);
  await assert.rejects(identity.register(credentials), { statusCode: 409 });
  await assert.rejects(identity.register({ ...credentials,email:'new@example.test',role:'admin' }), { statusCode: 400 });
  await assert.rejects(identity.login({ email: credentials.email,password:'wrong-password' }), { statusCode: 401 });
  assert.equal(infra.documents('identity_organizations').length,1);
});

test('Mongo workspace switching and user admin operations isolate organizations and protect last administrator', async () => {
  const infra = fakeIdentityMongo(), identity = createMongoIdentityService(infra);
  const first = await identity.register(credentials);
  const second = await identity.register({ ...credentials,email:'second@example.test',organization_name:'Otra empresa' });
  await assert.rejects(identity.switchOrganization(first.user.user_id,second.user.organization_id), { statusCode: 403 });
  await assert.rejects(identity.getUserById(first.user.user_id,second.user.organization_id), { statusCode: 404 });
  await assert.rejects(identity.deleteUser(first.user.user_id,first.user.organization_id,first.user.user_id), { statusCode: 409 });
  await assert.rejects(identity.updateUser(first.user.user_id,{role:'viewer'},first.user.organization_id,first.user.user_id), { statusCode: 409 });
  const member = await identity.createUser({ name:'Analista',email:'analyst@example.test',password:'local-password',role:'analyst' },first.user.organization_id,first.user.user_id);
  assert.equal((await identity.listUsers(second.user.organization_id)).length,1);
  await identity.updateUser(member.user_id,{role:'viewer',name:'Nombre local'},first.user.organization_id,first.user.user_id);
  assert.equal((await identity.getUserById(member.user_id,first.user.organization_id)).role,'viewer');
  assert.equal(infra.documents('identity_users').find((item) => item.user_id === member.user_id).name,'Analista');
  await identity.deleteUser(member.user_id,first.user.organization_id,first.user.user_id);
  assert.deepEqual(await identity.getUserMemberships(member.user_id),[]);
  assert.equal(infra.documents('identity_users').length,3, 'membership removal does not destroy global accounts');
});

test('Mongo administrator cannot reset a multi-organization password or claim an existing global account by email', async () => {
  const infra = fakeIdentityMongo(), identity = createMongoIdentityService(infra);
  const first = await identity.register(credentials);
  const second = await identity.register({ ...credentials,email:'second@example.test',organization_name:'Otra empresa' });
  await assert.rejects(identity.createUser({ email:credentials.email,password:'new-password',role:'admin' },second.user.organization_id,second.user.user_id), { statusCode: 409 });
  // Explicit test fixture membership represents a separately consented organization invitation.
  const db = await infra.getMongoDatabase();
  await db.collection('identity_memberships').insertOne({ user_id:first.user.user_id,organization_id:second.user.organization_id,role:'viewer' });
  await assert.rejects(identity.updateUserPassword(first.user.user_id,'new-password',second.user.organization_id,second.user.user_id), { statusCode: 403 });
  assert.equal((await identity.switchOrganization(first.user.user_id,second.user.organization_id)).user.role,'viewer');
});

test('HTTP register/login/me/switch and users admin use Mongo fresh memberships without SQL or preseeded accounts', async (t) => {
  const infra = fakeIdentityMongo(), identity = createMongoIdentityService(infra);
  const previous = { ...service }; Object.assign(service,identity); t.after(() => Object.assign(service,previous));
  const express = require('express'), app = express(); app.use(express.json());
  app.use('/auth',require('../routes/auth.routes')); app.use('/users',require('../routes/users.routes'));
  app.use((error,req,res,next) => res.status(error.statusCode || 500).json({error:error.message}));
  const server = app.listen(0,'127.0.0.1'); t.after(() => server.close());
  await new Promise((resolve) => server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url,body,token,method = body ? 'POST' : 'GET') => fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`} : {})},...(body ? {body:JSON.stringify(body)} : {})});
  const registration = await request('/auth/register',credentials); assert.equal(registration.status,201);
  const session = await registration.json();
  assert.equal((await request('/auth/me',null,session.token)).status,200);
  assert.equal((await request('/auth/login',{email:credentials.email,password:credentials.password})).status,200);
  const memberResponse = await request('/users',{email:'viewer@example.test',password:'local-password',role:'viewer'},session.token);
  assert.equal(memberResponse.status,201); const member = await memberResponse.json();
  const viewer = await (await request('/auth/login',{email:member.email,password:'local-password'})).json();
  assert.equal((await request('/users',null,viewer.token)).status,403);
  assert.equal((await request('/auth/switch-organization',{organization_id:999},session.token)).status,403);
  await identity.deleteUser(member.user_id,session.user.organization_id,session.user.user_id);
  assert.equal((await request('/auth/me',null,viewer.token)).status,403);
  assert.equal((await request('/users',null,viewer.token)).status,403);
});
