// Read-only postflight. No credentials, account details or raw responses in output.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {state,root,api}=require('./staging-vercel');
const phase2=process.argv.includes('--backend-phase2');
const acceptances=phase2?['phase2-staging-live','origin-live']:['account-security-live','origin-live'];
async function main(){
 const report={checked_at:new Date().toISOString(),mode:'read_only_protected_staging_postflight',checks:[],production_changes:false};
 const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
 const check=(name,detail={})=>report.checks.push({name,passed:true,...detail});
 const mongo=require('../backend/infrastructure/platformMongo');
 try{
  for(const name of acceptances){const result=read(`docs/evidence/${name}.json`);assert.equal(result.status,'passed');assert.equal(result.cleanup?.passed,true);assert.equal(result.api_interception,false);for(const type of['api','web'])assert.equal(result.deployments[type].id,state.projects[type].deployment.id);check(`${name}_acceptance_matches_current_pair`);}
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  for(const type of['api','web']){
   // Vercel returns target:null for these Preview deployments; production is explicit.
   const project=state.projects[type],deployed=await api(`/v13/deployments/${project.deployment.id}`);assert.equal(deployed.projectId,project.id,'Unexpected hosting project');assert.equal(deployed.readyState,'READY','Deployment not ready');assert.equal(deployed.target??'preview','preview','Unexpected deployment target');
   const alias=await api(`/v4/aliases/${project.staging_alias}`);assert.equal(alias.deploymentId,project.deployment.id);
   const metadata=await api(`/v9/projects/${project.id}`);assert.equal(metadata.ssoProtection?.deploymentType,'all');
   const url=`https://${project.staging_alias}`,health=type==='web'?'/api/health':'/health',me=type==='web'?'/api/auth/me':'/auth/me';
   const anonymous=await fetch(url+health,{redirect:'manual',signal:AbortSignal.timeout(20000)});assert.equal(anonymous.status,302);assert.equal(new URL(anonymous.headers.get('location')).hostname,'vercel.com');
   const headers={'x-vercel-protection-bypass':project.bypass};const healthy=await fetch(url+health,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(healthy.status,200);
   const unauthorized=await fetch(url+me,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(unauthorized.status,401);
   const manifest=read(`${project.source}/source-manifest.json`),runtime=manifest.files.filter(f=>type==='web'?f.path.startsWith('frontend/src/')||f.path.startsWith('frontend/api/')||f.path.startsWith('shared/'):f.path.startsWith('shared/')||f.path.startsWith('bsie/')||f.path.startsWith('sanitary/')||f.path.startsWith('backend/')&&!/^backend\/(scripts|\.vercel)\//.test(f.path)&&!f.path.endsWith('.test.js'));
   for(const file of runtime){const current=path.join(root,file.path);assert(fs.existsSync(current),`Missing runtime source: ${file.path}`);assert.equal(hash(fs.readFileSync(current)),file.sha256,`Runtime source changed after deployment: ${file.path}`);}
   check(`${type}_protected_alias_health_authorization_and_runtime_match`,{deployment_id:project.deployment.id,runtime_files:runtime.length,unauthenticated_status:anonymous.status,health_status:healthy.status,missing_app_session_status:unauthorized.status});
  }
  const db=await mongo.getMongoDatabase();assert.equal(hash(`${process.env.MONGODB_URI}\n${db.databaseName}`),state.target_fingerprint);
  const {ownedFilters,COLLECTIONS}=require('../backend/scripts/verify-platform-core-atlas');
  for(const name of acceptances){const result=read(`docs/evidence/${name}.json`),ownership=read(`.vercel/${name==='phase2-staging-live'?'phase2':'staging'}-${result.run_id}/ownership.json`),filters=ownedFilters(ownership);for(const collection of[...COLLECTIONS,'analytics_jobs','operational_events','soi_configuration','soi_route_plans',...(phase2?['integration_sources','integration_events']:[])])assert.equal(await db.collection(collection).countDocuments(filters[collection]||{organization_id:{$in:ownership.organization_ids}}),0);check(`${name}_owned_data_absent_from_new_connection`,{run_id:result.run_id});}
  if(phase2){const worker=read('docs/evidence/phase2-worker-package.json'),source=path.join(root,worker.directory),manifest=read(`${worker.directory}/source-manifest.json`);assert.equal(hash(fs.readFileSync(path.join(source,worker.archive))),worker.sha256);let verified=0;for(const file of manifest.files.filter(f=>/^(backend|shared|bsie|sanitary)\//.test(f.path))){assert(!file.path.split('/').some(p=>p.startsWith('.env')));assert.equal(hash(fs.readFileSync(path.join(root,file.path))),file.sha256,`Worker source changed: ${file.path}`);verified++;}check('separate_worker_package_matches_current_source',{source_files:verified,continuous_worker_deployed:false});}
  const production=read('.vercel/production-release-private.json');for(const type of['api','web']){const alias=await api(`/v4/aliases/${production.projects[type].domain}`);assert.equal(alias.deploymentId,production.projects[type].deployment.id);}check('original_production_aliases_still_unchanged');report.status='passed';
 }catch(error){report.status='failed';report.failure={name:error.name,message:String(error.message).split('\n')[0].slice(0,240)};process.exitCode=1;}
 finally{await mongo.closeMongoConnection();fs.writeFileSync(path.join(root,`docs/evidence/${phase2?'phase2':'unified'}-postflight.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({failed:true,name:error.name}));process.exitCode=1;});
