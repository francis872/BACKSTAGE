const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function run(){
 const {state,database,originalAliases}=require('./automation-staging'),{mongo,db}=await database();
 const report={checked_at:new Date().toISOString(),mode:'read_only_atlas_operational_audit',run_id:state.run_id,production_changes:false,cluster_tier_verified:false,network_access_list_verified:false,managed_backup_policy_verified:false,atlas_admin_connection_confirmed:false};
 try{
  assert.notEqual(db.databaseName,state.original_database);assert.equal((await db.collection('soi_schema_versions').findOne({_id:'automation-ownership'})).run_id,state.run_id);
  report.application_data_namespace_isolated=true;report.separate_cluster_verified=false;
  report.transport_tls=db.client?.options?.tls===true;
  try{const result=await db.admin().command({connectionStatus:1,showPrivileges:true}),roles=result.authInfo?.authenticatedUserRoles||[];report.broad_database_role_detected=roles.some(r=>['atlasAdmin','root','readWriteAnyDatabase','dbAdminAnyDatabase','userAdminAnyDatabase'].includes(r.role));report.database_roles_readable=true;report.least_privilege_verified=roles.length>0&&!report.broad_database_role_detected;}
  catch(error){report.database_roles_readable=false;report.least_privilege_verified=false;report.role_inspection_error_code=error.code||error.codeName||error.name;}
  try{const info=await db.admin().command({buildInfo:1});report.mongodb_server_version=info.version;}catch{report.mongodb_server_version=null;}
  const list=await db.listCollections({},{nameOnly:true}).toArray();report.collections=list.length;report.indexes=0;for(const row of list)report.indexes+=(await db.collection(row.name).listIndexes().toArray()).length;
  report.original_production_aliases=await originalAliases();report.status='audited_with_production_blockers';
 }catch(error){report.status='failed';report.failure={name:error.name,code:error.code||null};process.exitCode=1;}
 finally{await mongo.closeMongoConnection();fs.writeFileSync(path.join(root,'docs/evidence/automation-atlas-readiness.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
if(require.main===module)run();module.exports={run};
