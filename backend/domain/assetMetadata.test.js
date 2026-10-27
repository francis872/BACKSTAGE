const test=require('node:test'),assert=require('node:assert/strict');
const mongo=require('../infrastructure/soiMongo');
const {fixture}=require('./helpers/soiMongoMemoryFixture');
const f=fixture();mongo.getMongoDatabase=async()=>f.options.database;mongo.nextId=f.options.nextId;mongo.withMongoTransaction=f.options.transaction;
const locations=require('../services/locations.service');
const estate=require('../services/realEstate.service');
const risk=require('../services/riskAssessments.service');
const components=require('../services/riskComponents.service');
const analysis=require('../repositories/analysis.repository');
let asset,valuation;
test('Atlas assets retain geometry, zero coordinates and source metadata while preventing tenant override',async()=>{
 asset=await locations.createLocation({name:'Cali Centro',type:'property',latitude:0,longitude:0,organization_id:999,metadata:{source:'declared'}},71);
 assert.equal(asset.organization_id,71);assert.deepEqual(asset.geometry,{type:'Point',coordinates:[0,0]});assert.equal(asset.metadata.source,'declared');
 await assert.rejects(locations.getLocationById(asset.location_id,72),{statusCode:404});
 await locations.updateLocation(asset.location_id,{name:'Edited',type:'property',latitude:0,longitude:0},71);
 assert.deepEqual((await locations.getLocationById(asset.location_id,71)).geometry.coordinates,[0,0]);
});
test('Atlas asset writes reject invalid geometry and missing organization',async()=>{
 await assert.rejects(locations.createLocation({name:'Invalid',type:'property',geometry:{type:'Point',coordinates:[-190,0]}},71),{statusCode:400});
 await assert.rejects(locations.createLocation({name:'Missing tenant',type:'property'},null),{statusCode:401});
 assert.equal((await locations.listLocations({organizationId:71})).length,1);
});
test('Atlas valuations enforce owned property references and tenant-scoped reads, updates and deletion',async()=>{
 await assert.rejects(estate.createValuation({location_id:asset.location_id,land_area_m2:1,price_per_m2:1,estimated_value:1},72),{statusCode:404});
 valuation=await estate.createValuation({location_id:asset.location_id,land_area_m2:1,price_per_m2:1,estimated_value:0.1,annual_appreciation_pct:0},71);
 assert.equal((await estate.getPortfolio(71)).properties,1);assert.equal((await estate.listValuations(72)).length,0);
 await assert.rejects(estate.updateValuation(valuation.valuation_id,{estimated_value:999},72),{statusCode:404});
 await assert.rejects(estate.deleteValuation(valuation.valuation_id,72),{statusCode:404});
 assert.equal((await estate.getValuationById(valuation.valuation_id,71)).estimated_value,0.1);
});
test('Atlas analysis result replacement is atomic and tenant reads are isolated',async()=>{
 const run=await analysis.createAnalysisRun({organizationId:71,projectName:'Atlas test'});
 await analysis.replaceAnalysisResults({analysisRunId:run.analysis_run_id,ranked:[{rank_position:1,candidate_name:'Site',location_id:asset.location_id,score_total:80}]});
 assert.equal((await analysis.getAnalysisRunByIdForOrganization(run.analysis_run_id,71)).ranking.length,1);
 assert.equal(await analysis.getAnalysisRunByIdForOrganization(run.analysis_run_id,72),null);
 await analysis.bumpDependencyVersion({analysisRunId:run.analysis_run_id,organizationId:71,dependency:'candidates'});
 await analysis.saveProbabilityResult({analysisRunId:run.analysis_run_id,organizationId:71,probabilityResult:{checked:true},userId:1});
 assert.equal((await analysis.getProbabilityResult({analysisRunId:run.analysis_run_id,organizationId:71})).probability_result.checked,true);
 await analysis.invalidateDownstreamWorkflow({analysisRunId:run.analysis_run_id,organizationId:71,reason:'candidates changed'});
 const after=await analysis.getAnalysisRunByIdForOrganization(run.analysis_run_id,71);
 assert.equal(after.metadata.workflow_stale,true);assert.equal(after.metadata.probability_completed_at,undefined);assert.equal(after.metadata.dependency_versions.candidates_version,1);
});
test('Atlas services load MongoDB without an alternate database driver',()=>{
 assert.equal(require('../package.json').dependencies.mongodb, '^6.21.0');
 assert.equal(require('../package.json').dependencies.pg,undefined);
 const loaded=Object.keys(require.cache);assert(!loaded.some(name=>/node_modules[\/]pg[\/]/.test(name)));
});

test('Atlas recommendation review persists the decision and rejects cross-tenant changes',async()=>{
 const recommendations=require('../services/recommendations.service');
 const row=await recommendations.createRecommendation({location_id:asset.location_id,query_type:'verification_only',priority:'low'}, {user_id:1},{organization_id:71});
 await assert.rejects(recommendations.reviewRecommendation(row.recommendation_id,72,{user_id:1},{decision:'approved',notes:'test'}),{statusCode:404});
 await recommendations.reviewRecommendation(row.recommendation_id,71,{user_id:1},{decision:'approved',notes:'test'});
 assert.equal((await recommendations.getRecommendationById(row.recommendation_id,71)).status,'approved');
 await assert.rejects(recommendations.reviewRecommendation(row.recommendation_id,71,{user_id:1},{decision:'rejected',notes:'test'}),{statusCode:400});
});
