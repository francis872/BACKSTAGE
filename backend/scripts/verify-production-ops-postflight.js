const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
async function run(){
 const mongo=require('../infrastructure/platformMongo'),{api}=require('../../scripts/staging-vercel');
 const report={checked_at:new Date().toISOString(),mode:'read_only_production_ops_postflight',checks:[],production_changes:false};
 const check=(name,details={})=>report.checks.push({name,passed:true,...details});
 try{
  const accepted=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/production-ops-atlas-live.json'),'utf8'));assert.equal(accepted.status,'passed');assert.equal(accepted.cleanup.passed,true);
  const ownership=JSON.parse(fs.readFileSync(path.join(root,'.vercel',`phase2-${accepted.run_id}`,'ownership.json'),'utf8'));
  const db=await mongo.getMongoDatabase();assert.equal(crypto.createHash('sha256').update(`${process.env.MONGODB_URI}\n${db.databaseName}`).digest('hex'),accepted.target_fingerprint);
  const filters=require('./verify-platform-core-atlas').ownedFilters(ownership),names=require('./verify-computational-atlas').OWNED_COLLECTIONS;
  for(const name of names)assert.equal(await db.collection(name).countDocuments(filters[name]||{organization_id:{$in:ownership.organization_ids}}),0);
  check('all_owned_test_collections_absent_from_new_connection',{run_id:accepted.run_id,collections:names.length});
  const production=JSON.parse(fs.readFileSync(path.join(root,'.vercel/production-release-private.json'),'utf8'));
  for(const type of ['api','web']){const result=await api(`/v4/aliases/${production.projects[type].domain}`);assert.equal(result.deploymentId,production.projects[type].deployment.id);}
  check('original_production_aliases_unchanged');
  const packet=JSON.parse(fs.readFileSync(path.join(root,'.vercel/production-runtime-latest.json'),'utf8')),manifest=JSON.parse(fs.readFileSync(path.join(packet.directory,'source-manifest.json'),'utf8'));
  for(const file of manifest.files){assert(!file.path.split('/').some(x=>x.startsWith('.env')||x==='node_modules'||x==='.vercel'));for(const base of [root,packet.directory])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(base,file.path))).digest('hex'),file.sha256);}
  assert.equal(manifest.isolated_module_catalog_loading_passed,true);
  check('runtime_source_package_matches_local_files',{files:manifest.files.length,docker_image_built:false,continuous_worker_deployed:false});
  report.status='passed';
 }catch(error){report.status='failed';report.failure={name:error.name,code:error.code||null};process.exitCode=1;}
 finally{await mongo.closeMongoConnection();fs.writeFileSync(path.join(root,'docs/evidence/production-ops-postflight.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
if(require.main===module){if(process.argv.includes('--test-environment'))run();else console.log(JSON.stringify({mode:'plan_only',writes:0,checks:['fresh_connection_owned_cleanup','original_production_aliases','local_runtime_source_package']}));}
module.exports={run};
