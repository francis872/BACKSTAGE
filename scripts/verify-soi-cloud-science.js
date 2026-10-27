// Read-only probes: synthetic calculations, no tenant writes and no provider ingestion.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),deployment=process.argv[2],cli=process.argv[process.argv.indexOf('--cli')+1];
if(!deployment?.startsWith('https://')||!process.argv.includes('--cli')||!fs.existsSync(cli))throw new Error('Deployment URL and --cli path required');
const state=JSON.parse(fs.readFileSync(path.join(root,'.vercel/soi-cloud-state.json'),'utf8'));
const directory=path.join(root,'.vercel/cloud-probes');fs.mkdirSync(directory,{recursive:true});
const report={deployment,checked_at:new Date().toISOString(),mode:'read_only_cloud_scientific_fixtures',checks:[],operational_records_written:false};
function request(name,endpoint,payload,engine,expected=200){
 const requestFile=path.join(directory,`${name}-request.json`),responseFile=path.join(directory,`${name}-response.json`);
 const body=engine?JSON.stringify({engine,organization_id:'verification-only',timestamp_ms:Date.now(),nonce:crypto.randomUUID(),payload}):JSON.stringify(payload||{});
 fs.writeFileSync(requestFile,body);
 const headers=['--header','Content-Type: application/json'];
 if(engine)headers.push('--header',`X-SOI-Signature: ${crypto.createHmac('sha256',state.secret).update(body).digest('hex')}`);
 const result=spawnSync(process.execPath,[cli,'curl',endpoint,'--deployment',deployment,'--scope','franciscogloopez-8505s-projects','--','--silent','--show-error','--max-time','90','--request',payload===undefined?'GET':'POST',...headers,...(payload===undefined?[]:['--data-binary',`@${requestFile}`]),'--output',responseFile,'--write-out','%{http_code}'],{cwd:path.join(root,'backend'),encoding:'utf8',windowsHide:true,shell:false,timeout:120000,maxBuffer:2000000});
 const status=Number(result.stdout?.trim().slice(-3));let output;try{output=JSON.parse(fs.readFileSync(responseFile,'utf8'));}catch{throw new Error(`${name}: invalid response, HTTP ${status}, CLI ${result.status}`);}
 assert.equal(status,expected,`${name}: HTTP ${status}; ${typeof output.error==='string'?output.error:'unexpected response'}`);
 if(engine){assert.equal(output.ok,true);assert.equal(output.result.operation,payload.operation);return output.result;}
 return output;
}
try{
 const health=request('health','/health');assert.equal(health.status,'ok');assert.equal(health.primaryStore,'mongodb');report.checks.push('node_health_mongodb_primary');
 request('unsigned','/internal/science',{},null,401);report.checks.push('python_rejects_unsigned_requests');
 const features=Array.from({length:24},(_,i)=>({type:'Feature',id:String(i),geometry:{type:'Point',coordinates:[-74+i%6*.001,4+Math.floor(i/6)*.001]},properties:{x:i*.3+Math.cos(i),value:2*(i*.3+Math.cos(i))+Math.sin(i*.7)}}));
 const bsie=request('validate','/internal/science',{operation:'validate',data:{type:'FeatureCollection',features}},'bsie');assert.equal(bsie.validation.valid,true);report.checks.push('remote_bsie_validation');
 const regression=request('regression','/internal/science',{operation:'regression',data:{type:'FeatureCollection',features},variable:'value',predictors:['x'],model:'diagnostics',weights:{method:'knn',k:4},permutations:19},'bsie');assert.ok(regression.result.diagnostics);report.checks.push('remote_spreg_diagnostics');
 const routing=request('routing','/internal/science',{operation:'optimize_routes',nodes:[{id:'0',demand_kg:0},{id:'1',demand_kg:5}],vehicles:[{id:'verification-only',capacity_kg:10}],matrix:{node_ids:['0','1'],distance_m:[[0,1000],[1000,0]],duration_s:[[0,100],[100,0]],source:{name:'SIMULATED mathematical verification, not actual roads',data_kind:'simulated'}},time_limit_s:1},'sanitary');assert.equal(routing.result.independent_validation.valid,true);report.checks.push('remote_ortools_cvrp_independent_validation');
 const start=Date.now()-40*86400000;const history=Array.from({length:40},(_,i)=>({time:new Date(start+i*86400000).toISOString(),value:10+i*2}));
 const forecast=request('forecast','/internal/science',{operation:'forecast',history,unit:'kg',source:{name:'SIMULATED verification history, not operational observations',data_kind:'simulated'},horizon:3},'sanitary');assert.equal(forecast.result.forecast.length,3);assert.equal(forecast.result.forecast[0].data_kind,'simulated');report.checks.push('remote_temporal_backtest_and_simulated_provenance');
 report.passed=true;
}catch(error){report.passed=false;report.failure=error.message;process.exitCode=1;}
fs.writeFileSync(path.join(root,'docs/evidence/soi-cloud-science.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
