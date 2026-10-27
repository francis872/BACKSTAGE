const d=require('../infrastructure/atlasDocuments');
const {haversineDistance,pointInPolygon}=require('../spatial/core');
const filter=(run,org)=>({analysis_run_id:d.id(run),...(org!=null?d.org(org):{})});
const patch=({analysisRunId,organizationId},metadata={},fields={},extra={})=>d.update('analysis_runs',filter(analysisRunId,organizationId),{...Object.fromEntries(Object.entries(metadata).map(([k,v])=>[`metadata.${k}`,v])),...fields},extra);
const findLocationById=async(locationId,organizationId)=>{const row=await d.one('locations',{...d.org(organizationId),location_id:d.id(locationId)});return row?.latitude!=null&&row?.longitude!=null?row:null;};
const buildCandidateFromCoordinates=async({name,city,lat,lng})=>({location_id:null,name:name||'Candidato',city:city||null,latitude:Number(lat),longitude:Number(lng)});
async function computeCandidateMetrics({organizationId,city,latitude,longitude,ownBrandName=null}){
 const scope=d.org(organizationId), cityFilter=city?{city}:{};
 const coords={latitude:{$ne:null},longitude:{$ne:null}};
 const [competitorRows,poiRows,locationRows,businesses,riskRows,zoneRows]=await Promise.all([
  d.find('competitors',{...scope,...cityFilter,...coords}),d.find('points_of_interest',{...scope,...cityFilter,...coords}),d.find('locations',{...scope,...cityFilter,...coords}),d.find('business_locations',{...scope,is_active:true}),d.find('risk_assessments',scope,{assessed_at:-1,risk_id:-1}),d.find('territorial_zones',{...scope,...cityFilter,geometry:{$ne:null}})
 ]);
 const competitors={rows:competitorRows},pois={rows:poiRows};
 const stores={rows:locationRows.filter(l=>businesses.some(b=>b.location_id===l.location_id&&(!ownBrandName||String(b.brand_name).toLowerCase()===String(ownBrandName).toLowerCase())))};
 const seen=new Set();const risks={rows:riskRows.filter(r=>{if(seen.has(r.location_id))return false;seen.add(r.location_id);return true;}).flatMap(r=>{const l=locationRows.find(l=>l.location_id===r.location_id);return l?[{...l,...r}]:[];})};
 const zones={rows:await Promise.all(zoneRows.map(async z=>{const i=await d.one('demographic_indicators',{...scope,zone_id:z.zone_id,indicator_name:'population_total'},{as_of_date:-1});return {...z,population:i?.value??z.population_total,zone_source:z.source_name,zone_updated_at:z.source_updated_at,indicator_source:i?.source_name,indicator_updated_at:i?.as_of_date,indicator_confidence_level:i?.confidence_level,indicator_data_mode:i?.data_mode};}))};
  const candidate = { lat: Number(latitude), lng: Number(longitude) };
  const distance = (row) => haversineDistance(candidate, { lat: Number(row.latitude), lng: Number(row.longitude) });
  const nearest = (rows) => rows.length ? Math.min(...rows.map(distance)) : null;
  const nearestRisk = risks.rows.map((row) => ({ ...row, distance: distance(row) })).sort((a, b) => a.distance - b.distance)[0] || {};
  const zone = zones.rows.find((row) => {
    const geometry = typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry;
    const ring = geometry?.type === 'Polygon' ? geometry.coordinates?.[0] : null;
    return ring ? pointInPolygon(candidate, ring) : false;
  });
  const sources = [];
  const addSources = (rows, dataset, updatedAtField = 'source_updated_at') => {
    for (const row of rows) {
      if (row.source_name) sources.push({ source: row.source_name, dataset, updated_at: row[updatedAtField] || null });
    }
  };
  addSources(competitors.rows, 'competitors');
  addSources(pois.rows, 'points_of_interest');
  if (nearestRisk.assessed_at) sources.push({ source: 'MongoDB Atlas', dataset: 'risk_assessments', updated_at: nearestRisk.assessed_at });
  if (zone?.zone_source) sources.push({ source: zone.zone_source, dataset: 'territorial_zones', updated_at: zone.zone_updated_at || null });
  if (zone?.indicator_source) sources.push({ source: zone.indicator_source, dataset: 'demographic_indicators', updated_at: zone.indicator_updated_at || null });
  const uniqueSources = [...new Map(sources.map((source) => [`${source.dataset}:${source.source}`, source])).values()];
  return {
    competitor_distance_m: nearest(competitors.rows),
    own_store_distance_m: nearest(stores.rows),
    poi_count_1200m: pois.rows.length ? pois.rows.filter((row) => distance(row) <= 1200).length : null,
    population_total_zone: zone?.population == null ? null : Number(zone.population),
    flood_risk: nearestRisk.flood_risk ?? null,
    landslide_risk: nearestRisk.landslide_risk ?? null,
    crime_risk: nearestRisk.crime_risk ?? null,
    climate_exposure: nearestRisk.climate_exposure ?? null,
    provenance: {
      sources: uniqueSources,
      source_count: uniqueSources.length,
      confidence: null,
      population_data_mode: zone?.indicator_data_mode || null,
      population_confidence_level: zone?.indicator_confidence_level || null,
      missing_inputs: [],
    },
  };
}

const analysisRunRecord=({projectName,city,objective,criteriaWeights,requestedByUserId,organizationId,metadata})=>({...d.org(organizationId),project_name:projectName,city:city||null,objective:objective||null,criteria_weights:criteriaWeights||{},requested_by_user_id:requestedByUserId||null,metadata:metadata||{},status:'completed'});
const createAnalysisRun=input=>d.insert('analysis_runs','analysis_run_id',analysisRunRecord(input));
async function insertAnalysisResult({analysisRunId,rankPosition,candidateName,locationId,scoreTotal,scoreByDimension,metrics,explanation}){const run=d.required(await d.one('analysis_runs',filter(analysisRunId)));return d.insert('analysis_results','analysis_result_id',{...d.org(run.organization_id),analysis_run_id:d.id(analysisRunId),rank_position:rankPosition,candidate_name:candidateName,location_id:locationId||null,score_total:scoreTotal,score_by_dimension:scoreByDimension||{},metrics:metrics||{},explanation:explanation||{}});}
const setAnalysisRecommendation=(id,text,payload)=>d.update('analysis_runs',filter(id),{recommendation_text:text,recommendation_payload:payload||{}});
async function getAnalysisRunByIdForOrganization(id,org){const run=await d.one('analysis_runs',filter(id,org));if(!run)return null;return {...run,ranking:await d.find('analysis_results',filter(id,run.organization_id),{rank_position:1})};}
const getAnalysisRunById=id=>getAnalysisRunByIdForOrganization(id,null);
const listAnalysisRuns=({organizationId,limit=20})=>d.find('analysis_runs',d.org(organizationId),{created_at:-1},Math.min(Number(limit)||20,100));
const saveProbabilityResult=input=>patch(input,{probability_result:input.probabilityResult||{},probability_completed_at:new Date(),probability_completed_by_user_id:input.userId||null});
async function getProbabilityResult(input){const row=await d.one('analysis_runs',filter(input.analysisRunId,input.organizationId));return row?{analysis_run_id:row.analysis_run_id,probability_result:row.metadata?.probability_result||null,probability_completed_at:row.metadata?.probability_completed_at||null,probability_completed_by_user_id:row.metadata?.probability_completed_by_user_id||null}:null;}
async function createOperationalProject(input,{database,session,nextId=d.nextId}={}){
 const row={...analysisRunRecord({...input,metadata:{analysis_type:'operational_project',workflow_created_at:new Date().toISOString(),...input.metadata}}),status:'pending'};
 if(!database)return d.withMongoTransaction((db,tx)=>createOperationalProject(input,{database:db,session:tx}));
 const now=new Date();const document={...row,analysis_run_id:await nextId('analysis_runs',session),created_at:now,updated_at:now};
 await database.collection('analysis_runs').insertOne(document,{session});
 if(input.requestedByUserId)await require('../services/platformAudit.service').appendPlatformAudit({nextId,cleanDocument:d.cleanDocument},database,session,{organizationId:input.organizationId,userId:input.requestedByUserId},'project.created','analysis_runs',document.analysis_run_id,{comparison_snapshot_id:document.metadata.comparison_snapshot_id||null});
 return d.cleanDocument(document);
}
async function listProjectCandidates({analysisRunId,organizationId}){if(!await d.one('analysis_runs',filter(analysisRunId,organizationId)))return [];const rows=await d.find('analysis_run_candidates',filter(analysisRunId,organizationId),{selected_at:1});return Promise.all(rows.map(async row=>({...await d.one('locations',{...d.org(organizationId),location_id:row.location_id}),...row})));}
async function addProjectCandidate({analysisRunId,locationId,organizationId,userId}){if(!await d.one('analysis_runs',filter(analysisRunId,organizationId))||!await d.one('locations',{...d.org(organizationId),location_id:d.id(locationId)}))return null;const q={...filter(analysisRunId,organizationId),location_id:d.id(locationId)};const c=await d.collection('analysis_run_candidates');const value={...q,analysis_run_candidate_id:await d.nextId('analysis_run_candidates'),selected_by_user_id:userId||null,selected_at:new Date()};return d.cleanDocument(await c.findOneAndUpdate(q,{$setOnInsert:value},{upsert:true,returnDocument:'after',includeResultMetadata:false}));}
const removeProjectCandidate=({analysisRunId,locationId,organizationId})=>d.remove('analysis_run_candidates',{...filter(analysisRunId,organizationId),location_id:d.id(locationId)});
const dependencies=new Set(['candidates','comparison','probability','risk','recommendation']);
const key=value=>{if(!dependencies.has(value))throw new Error('Dependencia operacional inválida.');return `metadata.dependency_versions.${value}_version`;};
const bumpDependencyVersion=input=>patch(input,{}, {},{$inc:{[key(input.dependency)]:1}});
async function syncDependencyVersion(input){const row=await d.one('analysis_runs',filter(input.analysisRunId,input.organizationId));if(!row)return null;return d.update('analysis_runs',filter(input.analysisRunId,input.organizationId),{[key(input.dependency)]:row.metadata?.dependency_versions?.[`${input.sourceDependency}_version`]||0});}
const removals={
 comparison:['probability_completed_at','probability_completed_by_user_id','risk_reviewed_at','risk_reviewed_by_user_id','operational_recommendation_generated_at','operational_recommendation_reviewed_at','operational_recommendation_decision','report_generated_at','report_snapshot'],
 probability:['probability_completed_at','probability_completed_by_user_id','risk_reviewed_at','risk_reviewed_by_user_id','operational_recommendation_generated_at','operational_recommendation_reviewed_at','operational_recommendation_decision','report_generated_at','report_snapshot'],
 risk:['risk_reviewed_at','risk_reviewed_by_user_id','operational_recommendation_generated_at','operational_recommendation_reviewed_at','operational_recommendation_decision','report_generated_at','report_snapshot'],
 recommendation:['operational_recommendation_generated_at','operational_recommendation_reviewed_at','operational_recommendation_decision','report_generated_at','report_snapshot']
};
const unset=keys=>({$unset:Object.fromEntries(keys.map(k=>[`metadata.${k}`,'']))});
const resetWorkflowFromStage=input=>removals[input.stage]?patch(input,{}, {status:'pending'},unset(removals[input.stage])):null;
const invalidateDownstreamWorkflow=input=>patch(input,{workflow_stale:true,workflow_stale_at:new Date(),workflow_stale_reason:input.reason,workflow_stale_source:input.source||'upstream_change'},{status:'pending'},unset([...removals.comparison,'operational_recommendation_generated_by_user_id','operational_recommendation_count','operational_recommendation_reviewed_by_user_id','operational_recommendation_id','report_generated_by_user_id']));
const clearWorkflowStale=input=>patch(input,{}, {},unset(['workflow_stale','workflow_stale_at','workflow_stale_reason','workflow_stale_source']));
async function replaceAnalysisResults({analysisRunId,ranked}){const run=d.required(await d.one('analysis_runs',filter(analysisRunId)));return d.withMongoTransaction(async(db,session)=>{const c=db.collection('analysis_results');await c.deleteMany(filter(analysisRunId,run.organization_id),{session});for(const r of ranked){await c.insertOne({...filter(analysisRunId,run.organization_id),analysis_result_id:await d.nextId('analysis_results',session),rank_position:r.rank_position,candidate_name:r.candidate_name,location_id:r.location_id||null,score_total:r.score_total,score_by_dimension:r.score_by_dimension||{},metrics:r.metrics||{},explanation:{criteria:r.explanation}},{session});}});}
const markComparisonCompleted=input=>patch(input,{...input.metadata,comparison_completed_at:new Date()},{criteria_weights:input.criteriaWeights||{},status:'completed'});
async function getOperationalRisksByRun({analysisRunId,organizationId}){const run=await getAnalysisRunByIdForOrganization(analysisRunId,organizationId);if(!run)return [];const ids=[...new Set(run.ranking.map(r=>r.location_id).filter(Boolean))];return Promise.all(ids.map(async location_id=>{const q={...d.org(organizationId),location_id};const l=await d.one('locations',q);const r=await d.one('risk_assessments',q,{assessed_at:-1,risk_id:-1});return {...r,location_id,location_name:l?.name,city:l?.city};}));}
async function guardedPatch(input,metadata){return d.withMongoTransaction(async(database,session)=>{
 await require('../services/businessRules.service').service.assertFreshnessIn(database,session,{organizationId:input.organizationId,userId:input.userId},input.analysisRunId);
 return d.cleanDocument(await database.collection('analysis_runs').findOneAndUpdate(filter(input.analysisRunId,input.organizationId),{$set:{...Object.fromEntries(Object.entries(metadata).map(([k,v])=>[`metadata.${k}`,v])),updated_at:new Date()}},{session,returnDocument:'after',includeResultMetadata:false}));
});}
const saveRiskReview=input=>guardedPatch(input,{risk_review:input.riskSummary||{},risk_reviewed_at:new Date(),risk_reviewed_by_user_id:input.userId||null});
const getLatestOperationalRecommendation=input=>d.one('recommendations',filter(input.analysisRunId,input.organizationId),{requested_at:-1,recommendation_id:-1});
const markReportGenerated=input=>guardedPatch(input,{report_generated_at:new Date(),report_generated_by_user_id:input.userId||null,report_snapshot:input.snapshot||{}});
async function getRecoveryState(input){const row=await d.one('analysis_runs',filter(input.analysisRunId,input.organizationId));return row?.metadata?.auto_recovery?.[input.action]||null;}
const safeAction=action=>{if(typeof action!=='string'||!/^[a-z_]+$/.test(action))throw new Error('Acción inválida.');return action;};
const recordRecoveryAttempt=input=>patch(input,{[`auto_recovery.${safeAction(input.action)}`]:input.state||{}});
const clearRecoveryState=input=>patch(input,{}, {},unset([`auto_recovery.${safeAction(input.action)}`]));
async function listOperationalBoard({organizationId,limit=20}){const runs=await d.find('analysis_runs',d.org(organizationId),{updated_at:-1},Math.min(Number(limit)||20,100));return Promise.all(runs.map(async run=>{const ranking=await d.find('analysis_results',filter(run.analysis_run_id,organizationId));return {...run,result_count:ranking.length,linked_locations:ranking.filter(r=>r.location_id!=null).length,candidate_count:await (await d.collection('analysis_run_candidates')).countDocuments(filter(run.analysis_run_id,organizationId))};}));}
module.exports = {
  findLocationById,
  buildCandidateFromCoordinates,
  computeCandidateMetrics,
  createAnalysisRun,
  insertAnalysisResult,
  setAnalysisRecommendation,
  getAnalysisRunById,
  getAnalysisRunByIdForOrganization,
  listAnalysisRuns,
  listOperationalBoard,
  saveProbabilityResult,
  getProbabilityResult,
  getOperationalRisksByRun,
  saveRiskReview,
  getLatestOperationalRecommendation,
  markReportGenerated,
  createOperationalProject,
  listProjectCandidates,
  addProjectCandidate,
  removeProjectCandidate,
  replaceAnalysisResults,
  markComparisonCompleted,
  invalidateDownstreamWorkflow,
  clearWorkflowStale,
  bumpDependencyVersion,
  syncDependencyVersion,
  resetWorkflowFromStage,
  getRecoveryState,
  recordRecoveryAttempt,
  clearRecoveryState,
};
