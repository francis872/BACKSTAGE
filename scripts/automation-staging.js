// Owns only a newly created Vercel project and a uniquely named Atlas test DB.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),filename=path.join(root,'.vercel/automation-staging-private.json');
const {api}=require('./staging-vercel');
const teamId='team_ZhNzYGEKOt2giE4lhRQdm1Lp',teamScope='franciscogloopez-8505s-projects';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const state=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename,'utf8')):{};
const save=()=>fs.writeFileSync(filename,JSON.stringify(state,null,2),{mode:0o600});
const progress=(stage,detail={})=>console.log(JSON.stringify({stage,...detail}));
function guard(){assert.match(state.run_id,/^auto-\d{14}-[a-f0-9]{8}$/);assert.equal(state.database,`backstage_auto_${state.run_id.slice(-8)}`);if(state.project){assert.equal(state.project.name,`backstage-autonomy-${state.run_id.slice(-8)}`);assert(!['prj_jjeZc5dTOxYm4yD5jgfGfdEAAB4O','prj_9IJyARVoFEpyYnhoXmnZ6G0uXtDQ'].includes(state.project.id));}}
async function originalAliases(){const prior=JSON.parse(fs.readFileSync(path.join(root,'.vercel/production-release-private.json'),'utf8')),result={};for(const type of ['api','web']){const a=await api(`/v4/aliases/${prior.projects[type].domain}`);assert.equal(a.deploymentId,prior.projects[type].deployment.id);result[type]=a.deploymentId;}return result;}
async function database(){guard();const mongo=require('../backend/infrastructure/platformMongo');process.env.MONGODB_DB=state.database;return {mongo,db:await mongo.getMongoDatabase()};}
async function setup(){
 require('../backend/node_modules/dotenv').config({path:path.join(root,'backend/.env')});
 const baseline=await originalAliases(),team=await api(`/v2/teams/${teamId}`);assert.equal(team.billing?.plan,'hobby','Cost-bearing plans require a separate review');
 const uri=process.env.MONGODB_URI,sourceName=process.env.MONGODB_DB||process.env.MONGODB_SPATIAL_DB||'backstage_spatial';assert(uri?.startsWith('mongodb+srv://'));
 if(!state.run_id){state.run_id=`auto-${new Date().toISOString().replace(/\D/g,'').slice(0,14)}-${crypto.randomBytes(4).toString('hex')}`;state.database=`backstage_auto_${state.run_id.slice(-8)}`;state.original_database=sourceName;state.original_aliases=baseline;state.created_at=new Date().toISOString();state.cron_secret=crypto.randomBytes(32).toString('hex');state.jwt_secret=crypto.randomBytes(48).toString('hex');save();}
 guard();assert.notEqual(state.database,state.original_database);
 const expected=JSON.parse(fs.readFileSync(path.join(root,'.vercel/backstage-staging-private.json'),'utf8'));assert.equal(hash(`${uri}\n${state.original_database}`),expected.target_fingerprint);
 const mongo=require('../backend/infrastructure/platformMongo');process.env.MONGODB_DB=state.database;
 const db=await mongo.getMongoDatabase({requireSchema:false});
 if(!state.database_initialized){
  const marker=await db.collection('soi_schema_versions').findOne({_id:'automation-ownership'});
  if(!marker){assert.equal((await db.listCollections({}, {nameOnly:true}).toArray()).length,0,'Refuse an existing unowned database');await db.collection('soi_schema_versions').insertOne({_id:'automation-ownership',run_id:state.run_id,created_at:new Date(),purpose:'SIMULATED AUTONOMY ACCEPTANCE ONLY'});}
  else assert.equal(marker.run_id,state.run_id);
  const names=['soi_schema_versions','identity_users','identity_organizations','identity_memberships','analytics_jobs','operational_events','soi_audit_events','soi_audit_heads','soi_counters','soi_provider_locks','analysis_runs'];
  for(const name of names){if(!(await db.listCollections({name},{nameOnly:true}).toArray()).length)await db.createCollection(name);for(const spec of mongo.INDEXES[name]||[])await db.collection(name).createIndex(spec.key,spec.options);}
  await db.collection('soi_schema_versions').updateOne({_id:'soi'},{$set:{version:2,initialized_at:new Date()}},{upsert:true});
  await mongo.withMongoTransaction(async(store,session)=>{
   const existing=await store.collection('identity_users').findOne({automation_run_id:state.run_id},{session});if(existing){state.user_id=existing.user_id;state.organization_id=existing.service_organization_id;return;}
   const organizationId=await mongo.nextId('identity_organizations',session),userId=await mongo.nextId('identity_users',session);
   await store.collection('identity_organizations').insertOne({organization_id:organizationId,name:`BACKSTAGE AUTONOMY ${state.run_id}`,slug:state.run_id,status:'active',created_at:new Date(),automation_run_id:state.run_id},{session});
   await store.collection('identity_users').insertOne({user_id:userId,name:'Staging automation service',email:`${state.run_id}@example.invalid`,password_hash:require('../backend/auth').createPasswordHash(crypto.randomBytes(48).toString('base64url')),status:'active',account_type:'service',automation_run_id:state.run_id,service_organization_id:organizationId,created_at:new Date()},{session});
   await store.collection('identity_memberships').insertOne({organization_id:organizationId,user_id:userId,role:'analyst',created_at:new Date()},{session});state.user_id=userId;state.organization_id=organizationId;
  });state.database_initialized=true;state.initialized_collections=names;save();
 }
 await mongo.closeMongoConnection();
 if(!state.project){const name=`backstage-autonomy-${state.run_id.slice(-8)}`,p=await api('/v10/projects','POST',{name,framework:null,ssoProtection:{deploymentType:'all'}});state.project={id:p.id,name:p.name};save();}
 if(!state.bypass_configured){if(state.bypass?.length!==32)state.bypass=crypto.randomBytes(16).toString('hex');save();await api(`/v1/projects/${state.project.id}/protection-bypass`,'PATCH',{generate:{secret:state.bypass,note:'Authorized isolated BACKSTAGE autonomy acceptance'}});state.bypass_configured=true;save();}
 const values={MONGODB_URI:uri,MONGODB_DB:state.database,MONGODB_SPATIAL_DB:state.database,NODE_ENV:'production',BACKSTAGE_RUNTIME_ENV:'staging',BACKSTAGE_AUTOMATION_ENABLED:'true',BCO_AUTOMATION_RUN_ID:state.run_id,BCO_SERVICE_ORGANIZATION_ID:String(state.organization_id),BCO_SERVICE_USER_ID:String(state.user_id),BCO_INJECT_STAGING_TERMINATION:'true',BCO_DEPLOYMENT_MARKER:state.run_id,CRON_SECRET:state.cron_secret,JWT_SECRET:state.jwt_secret,SOI_SCIENCE_RPC_URL:'',PROJ_NETWORK:'OFF'};
 if(process.env.MONGODB_DNS_SERVERS)values.MONGODB_DNS_SERVERS=process.env.MONGODB_DNS_SERVERS;
 for(const[key,value]of Object.entries(values))await api(`/v10/projects/${state.project.id}/env?upsert=true`,'POST',{key,value,type:/SECRET|URI/.test(key)?'sensitive':'encrypted',target:['production']});
 state.configured_keys=Object.keys(values);save();await originalAliases();progress('isolated_automation_staging_prepared',{run_id:state.run_id,project:state.project.id,database_isolated:true,plan:'hobby',billing_changes:false});
}
async function deploy(){
 guard();assert(state.database_initialized&&state.project);const prepared=require('./prepare-automation-deployment').prepare();state.source=path.relative(root,prepared.directory).replaceAll('\\','/');save();
 fs.mkdirSync(path.join(prepared.directory,'.vercel'),{recursive:true});fs.writeFileSync(path.join(prepared.directory,'.vercel/project.json'),JSON.stringify({orgId:teamId,projectId:state.project.id,projectName:state.project.name}));
 const cli=path.join(root,'.vercel/automation-tools/node_modules/vercel/dist/index.js');assert(fs.existsSync(cli));
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[cli,'deploy','--prod','--yes','--scope',teamScope,'--format','json'],{cwd:prepared.directory,windowsHide:true,shell:false,env:{...process.env,VERCEL_TELEMETRY_DISABLED:'1'}});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.once('error',reject);child.once('close',code=>resolve({code,out,err}));});
 fs.writeFileSync(path.join(root,'.vercel/automation-deploy-private.log'),result.out+'\n'+result.err,{mode:0o600});
 let response;try{response=JSON.parse(result.out);}catch{}const d=response?.deployment;if(d?.id){state.deployment={id:d.id,url:d.url,readyState:d.readyState};save();}
 assert.equal(result.code,0,'Deployment failed; inspect private build log');assert(d?.id,'No deployment ID returned');const actual=await api(`/v13/deployments/${d.id}`);assert.equal(actual.projectId,state.project.id);assert.equal(actual.target,'production');state.deployment={id:actual.id,url:actual.url,readyState:actual.readyState};state.deployed_at=new Date().toISOString();save();await originalAliases();progress('automation_daemon_deployment_ready',state.deployment);
}
async function cli(args){guard();const cli=path.join(root,'.vercel/automation-tools/node_modules/vercel/dist/index.js');return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[cli,'daemons',...args,'--project',state.project.id,'--scope',teamScope,'--json'],{cwd:root,windowsHide:true,shell:false});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.once('error',reject);child.once('close',code=>{fs.writeFileSync(path.join(root,'.vercel/automation-daemons-private.json'),out||err,{mode:0o600});if(code!==0)return reject(Error('Daemon control failed'));let value;try{value=JSON.parse(out);}catch{return reject(Error('Invalid daemon response'));}resolve(value);});});}
async function main(){const action=process.argv[2];if(action==='setup'&&process.argv.includes('--apply'))return setup();if(action==='deploy'&&process.argv.includes('--apply'))return deploy();if(action==='inspect'){const result=await cli(['list']);progress('daemon_list',{response_keys:Object.keys(result)});return;}if(['stop','start'].includes(action)&&process.argv.includes('--apply')){await cli(['scale','bco-acceptance',`iad1=${action==='stop'?0:2}`]);state[`${action}_at`]=new Date().toISOString();save();progress(action==='stop'?'owned_automation_daemon_scaled_to_zero':'owned_automation_daemon_scaled_to_two');return;}console.log(JSON.stringify({mode:'plan_only',scope:'new_isolated_vercel_project_and_test_database',actions:['setup --apply','deploy --apply','inspect','stop --apply','start --apply'],existing_production_changes:false,billing_changes:false}));}
if(require.main===module)main().catch(error=>{fs.writeFileSync(path.join(root,'.vercel/automation-action-error-private.json'),JSON.stringify({name:error.name,message:error.message,code:error.code||error.status||null}),{mode:0o600});console.error(JSON.stringify({failed:true,name:error.name,code:error.code||error.status||null,message:error.name==='AssertionError'?error.message.slice(0,120):'Automation action failed; inspect private evidence'}));process.exitCode=1;});
module.exports={state,save,guard,database,originalAliases,cli};
