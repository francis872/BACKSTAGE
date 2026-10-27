const d=require('../infrastructure/atlasDocuments');
const ApiError=require('../utils/ApiError');
const analysisRepository=require('../repositories/analysis.repository');
const operationalEvents=require('./operationalEvents.service');
const STATUSES=['proposed','under_review','approved','rejected','in_progress','completed','expired'];
const PRIORITIES=['low','medium','high','critical'];
const TRANSITIONS={proposed:['under_review','approved','rejected'],under_review:['approved','rejected'],approved:['in_progress','expired'],in_progress:['completed','expired'],rejected:[],completed:[],expired:[]};
const scope=(id,org)=>({...d.org(org),recommendation_id:d.id(id)});
async function enrich(row,org){const q=d.org(org);const l=row.location_id?await d.one('locations',{...q,location_id:row.location_id}):null;const u=row.reviewed_by_user_id?await d.one('identity_users',{user_id:row.reviewed_by_user_id}):null;const a=row.analysis_run_id?await d.one('analysis_runs',{...q,analysis_run_id:row.analysis_run_id}):null;return {...row,location_name:l?.name,location_city:l?.city,reviewed_by_name:u?.name,analysis_project_name:a?.project_name};}
function validate(data){if(data.status&&!STATUSES.includes(data.status))throw new ApiError(400,'status inválido.');if(data.priority&&!PRIORITIES.includes(data.priority))throw new ApiError(400,'priority inválida.');}
async function listRecommendations(org,{status,priority,limit=50}={}){validate({status,priority});const rows=await d.find('recommendations',{...d.org(org),...(status?{status}:{}),...(priority?{priority}:{})},{requested_at:-1},200);rows.sort((a,b)=>PRIORITIES.indexOf(b.priority)-PRIORITIES.indexOf(a.priority));return Promise.all(rows.slice(0,Math.min(Number(limit)||50,200)).map(r=>enrich(r,org)));}
async function getSummary(org){const rows=await (await d.collection('recommendations')).aggregate([{$match:d.org(org)},{$group:{_id:'$status',count:{$sum:1}}}]).toArray();const by_status=Object.fromEntries(STATUSES.map(s=>[s,0]));for(const r of rows)by_status[r._id]=r.count;return {by_status,total:Object.values(by_status).reduce((a,b)=>a+b,0),pending_review:by_status.proposed+by_status.under_review};}
const getRecommendationById=async(id,org)=>enrich(d.required(await d.one('recommendations',scope(id,org))),org);
async function inputRecord(data,org){validate(data);if(!data.location_id||!data.query_type)throw new ApiError(400,'location_id y query_type son requeridos.');await require('./locations.service').getLocationById(data.location_id,org);if(data.analysis_run_id)d.required(await d.one('analysis_runs',{...d.org(org),analysis_run_id:d.id(data.analysis_run_id)}));return {...d.pick(data,'location_id query_type parameters result score title priority confidence expected_impact analysis_run_id'),location_id:d.id(data.location_id)};}
async function createRecommendation(data,user,context){return d.insert('recommendations','recommendation_id',{...await inputRecord(data,context.organization_id),...d.org(context.organization_id),requested_by_user_id:user.user_id,requested_at:new Date(),status:'proposed'});}
async function updateRecommendation(id,data,context){return d.required(await d.update('recommendations',scope(id,context.organization_id),await inputRecord(data,context.organization_id)));}
const deleteRecommendation=async(id,context)=>d.required(await d.remove('recommendations',scope(id,context.organization_id)));
async function reviewRecommendation(id,organizationId,sessionUser,{decision,notes}){
 const current=await getRecommendationById(id,organizationId);
 if(!TRANSITIONS[current.status]?.includes(decision))throw new ApiError(400,'Transición inválida.');
 if(['approved','rejected'].includes(decision)&&!notes)throw new ApiError(400,'Se requiere una justificación (notes).');
 const row=await d.withMongoTransaction(async(database,session)=>{
  if(current.analysis_run_id&&['approved','in_progress','completed'].includes(decision))await require('./businessRules.service').service.assertFreshnessIn(database,session,{organizationId,userId:sessionUser.user_id},current.analysis_run_id);
  const changed=d.cleanDocument(await database.collection('recommendations').findOneAndUpdate({...scope(id,organizationId),status:current.status,analysis_run_id:current.analysis_run_id??null,updated_at:current.updated_at??null},{$set:{status:decision,reviewed_by_user_id:sessionUser.user_id,review_notes:notes||null,reviewed_at:new Date(),updated_at:new Date()}},{session,returnDocument:'after',includeResultMetadata:false}));
  if(!changed)throw new ApiError(409,'La recomendación cambió concurrentemente.');
  if(changed.analysis_run_id&&['approved','rejected'].includes(decision))await database.collection('analysis_runs').updateOne({...d.org(organizationId),analysis_run_id:changed.analysis_run_id},{$set:{'metadata.operational_recommendation_reviewed_at':new Date(),'metadata.operational_recommendation_reviewed_by_user_id':sessionUser.user_id,'metadata.operational_recommendation_decision':decision,'metadata.operational_recommendation_id':changed.recommendation_id,updated_at:new Date()}},{session});
  return changed;
 });
 if(row.analysis_run_id)await operationalEvents.emit({organizationId,analysisRunId:row.analysis_run_id,actorUserId:sessionUser.user_id,eventType:`recommendation.${decision}`,severity:decision==='rejected'?'warning':'info',title:'Recomendación actualizada',message:notes||decision,target:decision==='approved'?'reports':'intelligence-recommendations',payload:{recommendation_id:row.recommendation_id,decision}});
 return row;
}
function inferPriority(rankPosition, riskClassification) {
  if (riskClassification?.severity === 'critical') return 'critical';
  if (riskClassification?.severity === 'high') return 'high';
  if (rankPosition === 1) return 'high';
  if (rankPosition === 2) return 'medium';
  return 'low';
}

function buildExpectedImpact(candidate, probabilityResult, riskClassification) {
  const dims = Object.entries(candidate.score_by_dimension || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => key.replace(/_/g, ' '));
  const parts = [];
  if (dims.length > 0) parts.push(`Fortalezas principales: ${dims.join(' y ')}.`);
  if (probabilityResult?.selected_distribution) {
    const survival = Number(probabilityResult.observation_evaluation?.survival_probability);
    parts.push(
      Number.isFinite(survival)
        ? `Motor probabilístico: ${probabilityResult.selected_distribution}, cola derecha ${(survival * 100).toFixed(1)}%.`
        : `Motor probabilístico: ${probabilityResult.selected_distribution}.`
    );
  }
  if (riskClassification?.severity && riskClassification.severity !== 'missing') {
    parts.push(`Riesgo territorial: ${riskClassification.severity} (${((riskClassification.average || 0) * 100).toFixed(1)}% promedio).`);
  }
  return parts.join(' ') || 'Impacto esperado no cuantificado con la información disponible.';
}

function classifyCandidateRisk(candidate, riskRows) {
  const row = (riskRows || []).find((item) => Number(item.location_id) === Number(candidate.location_id));
  if (!row || !row.risk_id) return { severity: 'missing', average: null, max_component: null };
  const values = [row.flood_risk, row.landslide_risk, row.crime_risk, row.climate_exposure]
    .map(Number)
    .filter(Number.isFinite);
  if (!values.length) return { severity: 'missing', average: null, max_component: null };
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const maxComponent = Math.max(...values);
  let severity = 'low';
  if (average >= 0.70 || maxComponent >= 0.80) severity = 'critical';
  else if (average >= 0.40) severity = 'high';
  else if (average >= 0.20) severity = 'medium';
  return { severity, average: Number(average.toFixed(4)), max_component: Number(maxComponent.toFixed(4)) };
}

async function generateFromAnalysisRun(analysisRunId, organizationId, sessionUser, { topN = 1 } = {}) {
  const run = await analysisRepository.getAnalysisRunByIdForOrganization(analysisRunId, organizationId);
  if (!run) throw new ApiError(404, 'Análisis no encontrado.');

  const probabilityResult = run.metadata?.probability_result || null;
  const riskReviewed = Boolean(run.metadata?.risk_reviewed_at);
  if (!probabilityResult) {
    throw new ApiError(409, 'Debes completar el Motor Probabilístico antes de generar la recomendación operacional.');
  }
  if (!riskReviewed) {
    throw new ApiError(409, 'Debes completar la revisión de riesgos antes de generar la recomendación operacional.');
  }

  const riskRows = await analysisRepository.getOperationalRisksByRun({ analysisRunId, organizationId });
  const candidates = (run.ranking || []).slice(0, Math.max(1, Math.min(topN, run.ranking.length)));
  if (candidates.length === 0) {
    throw new ApiError(400, 'El análisis no tiene candidatos en su ranking.');
  }

  const created = [];
  for (const candidate of candidates) {
    if (!candidate.location_id) continue;
    if (await d.one('recommendations',{...d.org(organizationId),analysis_run_id:d.id(analysisRunId),location_id:candidate.location_id})) continue;

    const riskClassification = classifyCandidateRisk(candidate, riskRows);
    const probabilityObservation = probabilityResult.observation_evaluation || {};
    const confidenceBase = Number(candidate.score_total || 0) / 100;
    const riskPenalty = riskClassification.severity === 'critical' ? 0.25
      : riskClassification.severity === 'high' ? 0.15
        : riskClassification.severity === 'medium' ? 0.05 : 0;
    const confidence = Math.max(0, Math.min(1, confidenceBase - riskPenalty));

    const resultPayload = {
      candidate_name: candidate.candidate_name,
      score_total: candidate.score_total,
      score_by_dimension: candidate.score_by_dimension,
      probability: {
        dataset_key: probabilityResult.dataset_key,
        selected_distribution: probabilityResult.selected_distribution,
        percentile: probabilityObservation.percentile ?? null,
        cdf: probabilityObservation.cdf ?? null,
        survival_probability: probabilityObservation.survival_probability ?? null,
      },
      risk: riskClassification,
      rationale: {
        ranking_position: candidate.rank_position,
        ranking_score: candidate.score_total,
        risk_adjusted_confidence: Number(confidence.toFixed(4)),
        human_review_required: true,
      },
    };

    const row=await createRecommendation({location_id:candidate.location_id,query_type:'operational_decision',parameters:{analysis_run_id:Number(analysisRunId),rank_position:candidate.rank_position,weights:run.criteria_weights,probability_completed_at:run.metadata?.probability_completed_at||null,risk_reviewed_at:run.metadata?.risk_reviewed_at||null},result:resultPayload,score:candidate.score_total,title:`${run.project_name}: ${candidate.candidate_name}`,priority:inferPriority(candidate.rank_position,riskClassification),confidence:Number(confidence.toFixed(4)),expected_impact:buildExpectedImpact(candidate,probabilityResult,riskClassification),analysis_run_id:Number(analysisRunId)},sessionUser,{organization_id:organizationId});
    created.push(row);
  }
  await d.update('analysis_runs',{...d.org(organizationId),analysis_run_id:d.id(analysisRunId)},{'metadata.operational_recommendation_generated_at':new Date(),'metadata.operational_recommendation_generated_by_user_id':sessionUser.user_id,'metadata.operational_recommendation_count':created.length});

  await operationalEvents.emit({
    organizationId,
    analysisRunId: Number(analysisRunId),
    actorUserId: sessionUser?.user_id,
    eventType: 'recommendation.generated',
    severity: 'warning',
    title: 'Recomendación pendiente de decisión humana',
    message: `${created.length} recomendación(es) operacional(es) generadas.`,
    target: 'intelligence-recommendations',
    payload: { recommendation_count: created.length },
  });

  return created;
}

async function getExampleRecommendation(){return {message:'No hay datos de ejemplo configurados.'};}
module.exports = {
  STATUSES,
  PRIORITIES,
  listRecommendations,
  getSummary,
  getRecommendationById,
  createRecommendation,
  updateRecommendation,
  deleteRecommendation,
  reviewRecommendation,
  generateFromAnalysisRun,
  getExampleRecommendation,
};
