const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const { BSON } = require('mongodb');
const { requestTelemetry, readinessResponse } = require('../middleware/requestTelemetry');
const { createAtlasRateLimiter } = require('../middleware/atlasRateLimiter');
const { encrypt, decrypt, restoreIndex } = require('../scripts/atlas-backup');
const { transition, probe, DEFAULTS } = require('../../scripts/staging-monitor');
function response() { return { headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.statusCode=n;return this; },json(v) {this.body=v;return this;} }; }
test('readiness returns 503 on dependency failure and recovers to 200 without inventing a store', async () => {
  const broken=response(); await readinessResponse({},broken,async()=>{throw Error('mongodb://private:secret@host')});
  assert.equal(broken.statusCode,503); assert(!JSON.stringify(broken).includes('secret'));
  const healthy=response(); await readinessResponse({},healthy,async()=>({command:async cmd=>assert.deepEqual(cmd,{ping:1,maxTimeMS:3000})}));
  assert.equal(healthy.statusCode,200); assert.equal(healthy.body.mongodb,'healthy');
});
test('structured HTTP telemetry preserves correlation and excludes queries, bodies, IDs and tokens', () => {
  const res=new EventEmitter();res.statusCode=401;const logs=[];let continued=0;
  const req={method:'GET',requestId:'safe-id',url:'/users/123?token=private',body:{password:'private'},headers:{authorization:'private'},baseUrl:'/users',route:{path:'/:id'}};
  requestTelemetry({write:line=>logs.push(JSON.parse(line)),now:()=>10})(req,res,()=>continued++);res.emit('finish');
  assert.equal(continued,1);assert.deepEqual(logs,[{event:'http.completed',request_id:'safe-id',method:'GET',route:'/users/:id',status:401,duration_ms:0}]);
});
test('shared account budget survives separate middleware instances and does not retain the account identifier', async () => {
  const original=process.env.JWT_SECRET;process.env.JWT_SECRET='isolated-readiness-hmac-key';
  try {
    const buckets=new Map(), keys=[];const consume=async(db,key)=>{keys.push(key);const count=(buckets.get(key)||0)+1;buckets.set(key,count);return{count,reset_at:new Date(Date.now()+10000)}};
    const options={namespace:'login',windowMs:10000,max:3,getDatabase:async()=>({}),consume};
    const a=createAtlasRateLimiter(options),b=createAtlasRateLimiter(options);let calls=0;const replies=[];
    for(let i=0;i<8;i++){const res=response();replies.push(res);await(i%2?a:b)({body:{email:i%2?' USER@example.invalid ':'user@example.invalid'},requestId:'r'},res,()=>calls++);}
    assert.equal(calls,3);assert.equal(replies.filter(r=>r.statusCode===429).length,5);assert.equal(new Set(keys).size,1);assert(!keys[0].includes('user'));assert(replies.at(-1).headers['Retry-After']);
  }finally{if(original===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=original;}
});
test('shared limiter fails closed when Atlas is unavailable and rejects invalid identities before storage', async () => {
  const limiter=createAtlasRateLimiter({namespace:'login',windowMs:1000,max:2,getDatabase:async()=>{throw Error('private')}});
  const bad=response();await limiter({body:{email:{$ne:null}}},bad,()=>assert.fail('must not continue'));assert.equal(bad.statusCode,400);
  const unavailable=response();await limiter({body:{email:'test@example.invalid'}},unavailable,()=>assert.fail('must not continue'));assert.equal(unavailable.statusCode,503);assert(!JSON.stringify(unavailable).includes('private'));
});
test('encrypted backup preserves original BSON types and rejects corrupted ciphertext and wrong keys', () => {
  const source={long:BSON.Long.fromString('9223372036854775807'),decimal:BSON.Decimal128.fromString('123.4500'),id:new BSON.ObjectId(),binary:new BSON.Binary(Buffer.from([0,1,255])),date:new Date('2020-01-01'),small:new BSON.Int32(9),double:new BSON.Double(9)};
  const raw=BSON.serialize(source),key=crypto.randomBytes(32),cipher=encrypt(raw,key);
  assert.deepEqual(decrypt(cipher,key),raw);
  const restored=BSON.deserialize(raw,{promoteValues:false,promoteLongs:false,bsonRegExp:true});assert.deepEqual(BSON.serialize(restored),raw);
  const tampered=Buffer.from(cipher);tampered[35]^=1;assert.throws(()=>decrypt(tampered,key));assert.throws(()=>decrypt(cipher,crypto.randomBytes(32)));
});
test('restore suspends only TTL deletion while preserving all other index options', () => {
  assert.deepEqual(restoreIndex({v:2,key:{expires_at:1},name:'expiry',expireAfterSeconds:0,partialFilterExpression:{active:true},unique:true}),{key:{expires_at:1},options:{name:'expiry',partialFilterExpression:{active:true},unique:true}});
});
test('monitor opens a persistent incident only after repeated failures and resolves after repeated recovery', () => {
  const sample=healthy=>[{component:'api',healthy,status:healthy?'healthy':'probe_failed'}];
  const first=transition({},sample(false));assert.equal(first.incidents.api.open,false);
  const second=transition(first,sample(false));assert.equal(second.events[0].event,'incident.opened');
  const restarted=JSON.parse(JSON.stringify(second));const third=transition(restarted,sample(true));assert.equal(third.incidents.api.open,true);assert.equal(third.events.length,0);
  const fourth=transition(third,sample(true));assert.equal(fourth.events[0].event,'incident.resolved');assert.equal(fourth.incidents.api.open,false);
});
test('monitor requires healthy MongoDB, request correlation and denied unprotected access; it never follows redirects', async () => {
  const project={name:'backstage-staging-api',bypass:'private'},calls=[];
  const fetcher=async(url,options)=>{calls.push(options);return options.headers?new Response(JSON.stringify({status:'ok',mongodb:'healthy',primaryStore:'mongodb'}),{status:200,headers:{'x-request-id':'safe'}}):new Response(null,{status:401});};
  assert.equal((await probe('api',project,DEFAULTS,fetcher)).healthy,true);assert(calls.every(c=>c.redirect==='manual'));
  const exposed=await probe('api',project,DEFAULTS,async()=>new Response('{}',{status:200}));assert.equal(exposed.healthy,false);assert.equal(exposed.status,'protection_failure');
  const failed=await probe('api',project,DEFAULTS,async()=>{throw Error('private')});assert.equal(failed.healthy,false);assert(!JSON.stringify(failed).includes('private'));
});
