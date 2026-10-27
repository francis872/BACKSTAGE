const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const{executeRemote}=require('../services/scientificRpc.service');
const env={SOI_SCIENCE_RPC_URL:'https://example.invalid/internal/science',SOI_SCIENCE_RPC_SECRET:'isolated-test-secret-32-characters-only'};
test('scientific RPC signs exact payload, bounds output and rejects redirects or incompatible results',async()=>{
 const payload={operation:'forecast',history:[]};
 const output=await executeRemote('sanitary',payload,{env,organizationId:7,fetchImpl:async(url,options)=>{
  assert.equal(options.redirect,'error');assert.equal(options.method,'POST');
  assert.equal(options.headers['X-SOI-Signature'],crypto.createHmac('sha256',env.SOI_SCIENCE_RPC_SECRET).update(options.body).digest('hex'));
  const input=JSON.parse(options.body);assert.equal(input.organization_id,'7');assert.equal(input.engine,'sanitary');assert.deepEqual(input.payload,payload);
  return new Response(JSON.stringify({ok:true,result:{version:'soi-scientific-1.0.0',operation:'forecast',result:{forecast:null}}}));
 }});assert.equal(output.operation,'forecast');
 await assert.rejects(executeRemote('sanitary',payload,{env,fetchImpl:async()=>new Response('x'.repeat(4000001))}),{statusCode:413});
 await assert.rejects(executeRemote('sanitary',payload,{env,fetchImpl:async()=>new Response(JSON.stringify({ok:true,result:{operation:'wrong',version:'x'}}))}),{statusCode:503});
 await assert.rejects(executeRemote('sanitary',payload,{env:{...env,SOI_SCIENCE_RPC_URL:'http://example.invalid'}}),{statusCode:503});
 await executeRemote('sanitary',payload,{env:{...env,SOI_SCIENCE_RPC_URL:'self',VERCEL_URL:'isolated.vercel.app'},fetchImpl:async(url)=>{assert.equal(url.href,'https://isolated.vercel.app/internal/science');return new Response(JSON.stringify({ok:true,result:{version:'test-only',operation:'forecast'}}));}});
});
