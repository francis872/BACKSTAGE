// Rehearse only after the new pair has passed acceptance and owns both staging aliases.
// Always attempts to put the accepted pair back, including when rollback checks fail.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ALLOWED={api:'prj_b8QR9h6618xv5xhAdAWLGheZhJsO',web:'prj_Adl43dUBZ79gEmihyrCVCyYC80eA'};
function validatePair(pair){
 for(const type of ['api','web']){
  const p=pair[type];assert.equal(p?.project_id,ALLOWED[type]);assert.equal(p.project_name,`backstage-staging-${type}`);assert.equal(p.alias,`backstage-staging-${type}.vercel.app`);
  assert.equal(p.deployment?.target,'preview');assert.equal(p.deployment.readyState,'READY');assert.match(p.deployment.id,/^dpl_[A-Za-z0-9]+$/);assert.match(p.deployment.url,/^backstage-staging-[a-z0-9-]+\.vercel\.app$/);
 }
 return pair;
}
async function run(){
 const {api,state,root}=require('./staging-vercel');
 const previous=validatePair(JSON.parse(fs.readFileSync(path.join(root,'.vercel/readiness-rollback-baseline.json'),'utf8')));
 const accepted=validatePair(Object.fromEntries(['api','web'].map(type=>{const p=state.projects[type];return[type,{project_id:p.id,project_name:p.name,alias:p.staging_alias,deployment:p.deployment}]})));
 const report={started_at:new Date().toISOString(),scope:'dedicated_protected_staging_aliases_only',production_changes:false,data_restore:false,checks:[],previous,accepted};
 let mutationAttempted=false;
 const publish=async pair=>{for(const type of ['api','web'])await api(`/v2/deployments/${pair[type].deployment.id}/aliases`,'POST',{alias:pair[type].alias});};
 async function verify(pair){
  for(const type of ['api','web']){
   const p=pair[type],alias=await api(`/v4/aliases/${p.alias}`);assert.equal(alias.projectId,p.project_id,'alias_project');assert.equal(alias.deploymentId,p.deployment.id,'alias_deployment');
   const project=await api(`/v9/projects/${p.project_id}`);assert.equal(project.ssoProtection?.deploymentType,'all');
   const route=type==='api'?'/health':'/api/health';
   const denied=await fetch(`https://${p.alias}${route}`,{redirect:'manual',signal:AbortSignal.timeout(10000)});assert([302,401,403].includes(denied.status),'deployment_protection');
   const headers={'x-vercel-protection-bypass':state.projects[type].bypass};
   const response=await fetch(`https://${p.alias}${route}`,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(response.status,200,'health_http');assert.equal((await response.json()).mongodb,'healthy','health_mongodb');assert(response.headers.get('x-request-id'),'health_request_id');
   if(type==='web'){
    const read=async host=>(await(await fetch(`https://${host}/`,{headers,redirect:'error',signal:AbortSignal.timeout(15000)})).text());
    const assets=html=>[...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].map(m=>m[1]).sort();
    const deployed=assets(await read(p.deployment.url));assert(deployed.length>0,'immutable_web_assets_present');assert.deepEqual(assets(await read(p.alias)),deployed,'web_alias_assets');
   }
  }
 }
 async function verifyEventually(pair,label){
  for(let attempt=0;attempt<6;attempt++){
   try{await verify(pair);return;}catch(error){
    report.verification_retries ||= [];report.verification_retries.push({pair:label,attempt:attempt+1,reason:String(error.message).split('\n')[0].slice(0,160)});
    if(attempt===5)throw error;
    console.log(JSON.stringify({stage:'await_alias_propagation',pair:label,attempt:attempt+1}));
    await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
   }
  }
 }
 try{
  for(const pair of [previous,accepted])for(const type of ['api','web']){const d=await api(`/v13/deployments/${pair[type].deployment.id}`);assert.equal(d.projectId,ALLOWED[type]);assert.equal(d.readyState,'READY');assert.notEqual(d.target,'production');}
  await verifyEventually(accepted,'accepted_preflight');report.checks.push('accepted_pair_preflight');
  mutationAttempted=true;await publish(previous);await verifyEventually(previous,'previous');report.checks.push('previous_pair_aliases_protection_mongodb_and_web_assets_verified');
 }catch(error){report.failure={name:error.name,status:error.status||null,reason:String(error.message).split('\n')[0].slice(0,160)};report.status='failed';process.exitCode=1;}
 finally{
  if(mutationAttempted){try{await publish(accepted);await verifyEventually(accepted,'accepted_restoration');report.checks.push('accepted_pair_restored_and_verified');report.accepted_pair_restored=true;}catch(error){report.accepted_pair_restored=false;report.status='failed';report.restoration_failure={name:error.name,status:error.status||null,reason:String(error.message).split('\n')[0].slice(0,160)};process.exitCode=1;}}
  report.status ||= 'passed';report.finished_at=new Date().toISOString();fs.writeFileSync(path.join(root,'docs/backstage-2.0/evidence/readiness-rollback.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
}
if(require.main===module){if(process.argv.includes('--apply'))run().catch(e=>{console.error(JSON.stringify({failed:true,name:e.name,status:e.status||null}));process.exitCode=1;});else console.log(JSON.stringify({mode:'plan_only',precondition:'accepted_pair_validated_and_assigned_to_both_staging_aliases',scope:'staging_only',rollback:'previous_known_pair',finally:'restore_and_verify_accepted_pair',data_restore:false,production_changes:false}));}
module.exports={validatePair};
