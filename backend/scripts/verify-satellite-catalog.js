// Read-only queries to the public provider; no application DB, account or position fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createEarthSearchClient}=require('../services/satelliteCatalog.service');
async function main(){
 const report={checked_at:new Date().toISOString(),scope:'public_upstream_catalog_contract_only',app_http_authorization_tested:false,atlas_writes:0,imagery_downloaded:false,queries:[]};
 const client=createEarthSearchClient();
 try{
  for(const provider of ['sentinel','landsat']){
   const started=performance.now();
   const result=await client.search({provider,bbox:[-74.2,4.5,-74,4.7],start:'2026-01-01T00:00:00Z',end:'2026-02-01T00:00:00Z',limit:1,max_cloud_cover:100});
   assert(result.features.length>0,'Expected at least one actual catalog scene in the reference extent');
   report.queries.push({provider,collection:result.provenance.collection,returned:result.features.length,license:result.provenance.license,duration_ms:Math.round(performance.now()-started),scene_id:result.features[0].id,acquired_at:result.features[0].properties.acquired_at,normalized_response_sha256:crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex')});
  }
  report.status='passed';
 }catch(error){report.status='failed';report.failure={code:error.statusCode||'UPSTREAM_CONTRACT_FAILED',name:error.name};process.exitCode=1;}
 const filename=path.resolve(__dirname,'../../docs/evidence/production-ops-satellite-live.json');
 if(fs.existsSync(filename))fs.copyFileSync(filename,filename.replace('.json',`-${Date.now()}.json`));
 fs.writeFileSync(filename,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(()=>{console.error(JSON.stringify({status:'failed',code:'SATELLITE_VERIFICATION_FAILED'}));process.exitCode=1;});
module.exports={main};
