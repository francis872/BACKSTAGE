const test=require('node:test'),assert=require('node:assert/strict');
const {configureMongoDns}=require('../infrastructure/mongoDns');
test('Mongo DNS override is explicit, validates IPs and never changes OS DNS',async()=>{
 let setCalls=0;class Resolver{setServers(servers){assert.deepEqual(servers,['1.1.1.1']);}async resolve4(host){assert.equal(host,'authorized.invalid');return['192.0.2.7'];}}
 const fake={setServers(servers){setCalls++;assert.deepEqual(servers,['1.1.1.1']);},promises:{Resolver}};
 assert.deepEqual(configureMongoDns({},fake),{});assert.equal(setCalls,0);
 assert.throws(()=>configureMongoDns({MONGODB_DNS_SERVERS:'http://untrusted'},fake));assert.equal(setCalls,0);
 const options=configureMongoDns({MONGODB_DNS_SERVERS:'1.1.1.1'},fake);
 const addresses=await new Promise((resolve,reject)=>options.lookup('authorized.invalid',{all:true},(e,v)=>e?reject(e):resolve(v)));
 assert.deepEqual(addresses,[{address:'192.0.2.7',family:4}]);
 const address=await new Promise((resolve,reject)=>options.lookup('authorized.invalid',4,(e,v,f)=>e?reject(e):resolve([v,f])));assert.deepEqual(address,['192.0.2.7',4]);
 assert.equal(setCalls,1);
});
