const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { executeRemote } = require('../services/scientificRpc.service');

test('protected proxy uses its server credential, preserves tenant headers and refuses redirects', async () => {
  process.env.BACKEND_URL = 'https://test-api.vercel.app';
  process.env.BACKEND_PROTECTION_BYPASS = 'server-only-test-bypass';
  const { default: handler } = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/api/index.js')));
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return new Response('{}', { headers: { 'content-type': 'application/json' } }); };
  const res = { setHeader() {}, status() { return this; }, json() {}, send() {} };
  try {
    const req = { method: 'GET', url: '/api/auth/me', headers: { authorization: 'Bearer test-token', 'x-organization-id': '17', 'x-vercel-protection-bypass': 'untrusted-client' } };
    await handler(req, res);
    assert.equal(calls[0].options.headers['x-vercel-protection-bypass'], 'server-only-test-bypass');
    assert.equal(calls[0].options.headers['x-organization-id'], '17');
    assert.equal(calls[0].options.redirect, 'error');
    delete process.env.BACKEND_PROTECTION_BYPASS;
    await handler(req, res);
    assert.equal(calls[1].options.headers['x-vercel-protection-bypass'], undefined);
  } finally { global.fetch = original; delete process.env.BACKEND_PROTECTION_BYPASS; }
});

test('scientific automation bypass is sent only to the self deployment', async () => {
  const env = { SOI_SCIENCE_RPC_URL: 'self', VERCEL_URL: 'test-api.vercel.app', SOI_SCIENCE_RPC_SECRET: 'test-science-secret-at-least-32-characters', VERCEL_AUTOMATION_BYPASS_SECRET: 'test-project-automation' };
  const credentials = [];
  const fetchImpl = async (url, options) => { credentials.push(options.headers['x-vercel-protection-bypass']); return new Response(JSON.stringify({ ok: true, result: { operation: 'validate', version: 'test' } })); };
  await executeRemote('bsie', { operation: 'validate' }, { env, fetchImpl });
  await executeRemote('bsie', { operation: 'validate' }, { env: { ...env, SOI_SCIENCE_RPC_URL: 'https://other.invalid/internal/science' }, fetchImpl });
  assert.deepEqual(credentials, ['test-project-automation', undefined]);
});

test('proxy rejects malformed JSON and platform body parse failures as 400 without sending them upstream', async () => {
  process.env.BACKEND_URL='https://test-api.vercel.app';
  const {default:handler}=await import(pathToFileURL(path.resolve(__dirname,'../../frontend/api/index.js')));
  const original=global.fetch;let calls=0;
  global.fetch=async()=>{calls++;throw Error('must not fetch invalid input');};
  try {
    for(const getter of [()=>'{"broken":',()=>{throw new SyntaxError('sensitive malformed request body');}]){
      const req={method:'POST',url:'/api/assets',headers:{},get body(){return getter();}};
      const res={code:0,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
      await handler(req,res);assert.equal(res.code,400);assert(!JSON.stringify(res.body).includes('sensitive'));assert.match(res.body.error,/formulario/);
    }
    assert.equal(calls,0);
  } finally {global.fetch=original;}
});

test('proxy serializes valid raw JSON once and preserves retry headers for the caller', async () => {
  process.env.BACKEND_URL='https://test-api.vercel.app';
  const {default:handler}=await import(pathToFileURL(path.resolve(__dirname,'../../frontend/api/index.js')));
  const original=global.fetch;let sent;
  global.fetch=async(url,options)=>{sent=options.body;return new Response('{"error":"limit"}',{status:429,headers:{'content-type':'application/json','retry-after':'12','ratelimit-limit':'10'}});};
  const res={headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(body){this.body=body;}};
  try {await handler({method:'POST',url:'/api/auth/login',headers:{},body:'{"email":"test@example.invalid"}'},res);assert.deepEqual(JSON.parse(sent),{email:'test@example.invalid'});assert.equal(res.code,429);assert.equal(res.headers['Retry-After'],'12');assert.equal(res.headers['RateLimit-Limit'],'10');}
  finally {global.fetch=original;}
});
