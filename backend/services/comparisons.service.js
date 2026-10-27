const ApiError = require('../utils/ApiError');
const { DATA_TYPES } = require('../domain/provenance');
const intelligence = require('./intelligenceContract.service');
function createComparisonService(infrastructure = require('../infrastructure/platformMongo')) {
 const { getMongoDatabase: db, withMongoTransaction, nextId, cleanDocument } = infrastructure;
 const reject = message => { throw new ApiError(400, message); };
 const identifier = value => { if (!['string','number'].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) reject('Identificador inválido.'); return Number(value); };
 const scoped = context => ({ organization_id: identifier(context.organizationId) });
 const inputObject = value => { if (!value || typeof value !== 'object' || Array.isArray(value)) reject('Se requiere un objeto.'); };
 const writer = context => { scoped(context); identifier(context.userId); if (!['admin','analyst'].includes(context.role)) throw new ApiError(403,'Permiso denegado.'); };
 const text = (value, field) => { if (typeof value !== 'string' || !value.trim() || value.length > 200) reject(`${field} inválido.`); return value.trim(); };
 // Keep historical collection/IDs: this is a platform contract over existing snapshots.
 async function list(context) { return (await (await db()).collection('soi_comparisons').find(scoped(context)).sort({ comparison_id: -1 }).limit(100).toArray()).map(cleanDocument); }
 async function get(context, value) { const row=await (await db()).collection('soi_comparisons').findOne({...scoped(context),comparison_id:identifier(value)}); if(!row)throw new ApiError(404,'Comparación no disponible.'); return cleanDocument(row); }
  async function save(context,input) {
    inputObject(input);
    writer(context); const name = text(input.project_name,'project_name'); if (JSON.stringify(input).length > 500000) reject('Comparación demasiado grande.');
    const { evaluateComparison } = await import('../../shared/comparison.mjs');
    const payload = { candidates:input.candidates,criteria:input.criteria,observations:input.observations };
    const result = evaluateComparison(payload); if (result.status !== 'ready') { const error = new ApiError(400,'Comparación incompleta o inválida.'); error.details=result; throw error; }
    // Persist explicit public input only; reject claimed result/tenant/user fields from caller.
    const pick = (value,fields)=>Object.fromEntries(fields.filter((key)=>Object.hasOwn(value,key)).map((key)=>[key,value[key]]));
    const candidates=payload.candidates.map((c)=>pick(c,['id','name','lat','lng']));
    const criteria=payload.criteria.map((c)=>pick(c,['id','name','definition','unit','source','weight','direction','normalization','missing','min','max']));
    for (const item of [...candidates,...criteria]) if (/^[\$]|\./.test(item.id) || ['__proto__','constructor','prototype'].includes(item.id)) reject('Identificador de comparación inválido.');
    const observations=Object.create(null);
    for (const candidate of candidates) { observations[candidate.id]=Object.create(null); for (const criterion of criteria) {
      const value=payload.observations?.[candidate.id]?.[criterion.id]; if (value) {
        if (typeof value !== 'object' || Array.isArray(value) || value.value != null && !['number','string'].includes(typeof value.value)) reject('Observación inválida.');
        for (const field of ['source','observed_at']) if (value[field] != null && typeof value[field] !== 'string') reject('Procedencia de observación inválida.');
        observations[candidate.id][criterion.id]={ ...pick(value,['value','source','observed_at','unit']),data_type:DATA_TYPES.includes(value.data_type)&&value.data_type!=='REAL_VERIFIED'?value.data_type:'UNKNOWN' };
      }
    } }
    const canonicalInput = await intelligence.canonicalComparisonInput({ candidates, criteria, observations });
    const canonicalResult = evaluateComparison(canonicalInput);
    if (canonicalResult.status !== 'ready') reject('Comparación canónica inválida.');
    const analysis = intelligence.buildComparisonAnalysis(canonicalInput, canonicalResult);
    const {workspaceTerritory}=require('../domain/workspaceContext');
    const candidate_context=payload.candidates.map(candidate=>({
      ...workspaceTerritory({...candidate,coordinates:[Number(candidate.lng),Number(candidate.lat)]}),
      source_identifier:typeof candidate.source_identifier==='string'?candidate.source_identifier.slice(0,2000):null,
      source_metadata:candidate.source&&typeof candidate.source==='object'?pick(candidate.source,['name','license','attribution','url','dataMode']):null,
    }));
    const candidate_context_sha256=require('node:crypto').createHash('sha256').update(JSON.stringify(candidate_context)).digest('hex');
    return withMongoTransaction(async(database,session)=>{
      const record={ ...scoped(context),comparison_id:await nextId('soi_comparisons',session),project_name:name,input:canonicalInput,result:canonicalResult,analysis,candidate_context,candidate_context_sha256,created_by:context.userId,created_at:new Date() };
      await database.collection('soi_comparisons').insertOne(record,{ session });
      await require('./platformAudit.service').appendPlatformAudit(infrastructure,database,session,context,'analysis.saved','soi_comparisons',record.comparison_id,{method:record.result.version,manifest_sha256:analysis.manifest_sha256});
      return cleanDocument(record);
    });
  }
 async function createProject(context,value,input={}){
  writer(context);inputObject(input);
  const id=identifier(value);
  const requestedProject=input.analysis_run_id==null?null:identifier(input.analysis_run_id);
  const snapshot=await get(context,id);
  if(snapshot.project_analysis_run_id){
   if(requestedProject&&requestedProject!==snapshot.project_analysis_run_id)throw new ApiError(409,'La comparación ya está vinculada a otro proyecto.');
   const project=await (await db()).collection('analysis_runs').findOne({...scoped(context),analysis_run_id:snapshot.project_analysis_run_id});
   if(!project)throw new ApiError(409,'El proyecto vinculado ya no está disponible.');
   return cleanDocument(project);
  }
  if (!(await intelligence.verifyComparisonSnapshot(snapshot)).verified) throw new ApiError(409,'No se puede crear un proyecto: el análisis guardado no pudo reproducirse.');
  const assets=require('./assets.service').createAssetsService(infrastructure);
  const selected=[];
  for(const candidate of snapshot.input.candidates){
   if(/^(platform|soi):[1-9][0-9]*$/.test(candidate.id)){
    const asset=await assets.get(context.organizationId,candidate.id);
    selected.push({asset_id:asset.asset_id,origin:asset.origin,source_record_id:asset.source_record_id,name:asset.name,type:asset.type,latitude:asset.latitude,longitude:asset.longitude});
   }
  }
  const {workspaceTerritory}=require('../domain/workspaceContext');
  const territory=workspaceTerritory(input.territory||{name:snapshot.input.candidates[0].name,coordinates:[snapshot.input.candidates[0].lng,snapshot.input.candidates[0].lat]});
  return withMongoTransaction(async(database,session)=>{
   const current=await database.collection('soi_comparisons').findOne({...scoped(context),comparison_id:id},{session});
   if(!current)throw new ApiError(404,'Comparación no disponible.');
   if(current.project_analysis_run_id){
    if(requestedProject&&requestedProject!==current.project_analysis_run_id)throw new ApiError(409,'La comparación ya está vinculada a otro proyecto.');
    const project=await database.collection('analysis_runs').findOne({...scoped(context),analysis_run_id:current.project_analysis_run_id},{session});
    if(!project)throw new ApiError(409,'El proyecto vinculado ya no está disponible.');
    return cleanDocument(project);
   }
   const verified = await intelligence.verifyComparisonSnapshot(current);
   if (!verified.verified) throw new ApiError(409,'No se puede crear un proyecto: el análisis guardado no pudo reproducirse.');
   const comparison_candidates=current.input.candidates.map(candidate=>({...current.candidate_context?.find(item=>item.id===candidate.id),...candidate}));
   if(requestedProject){
    const project=await database.collection('analysis_runs').findOne({...scoped(context),analysis_run_id:requestedProject},{session});
    if(!project||project.metadata?.analysis_type!=='operational_project')throw new ApiError(404,'Proyecto operativo no disponible.');
    const metadata={...project.metadata,comparison_snapshot_id:id,comparison_candidates,comparison_evidence:intelligence.comparisonReference(current),comparison_history:[...new Set([...(project.metadata.comparison_history||[]),project.metadata.comparison_snapshot_id,id].filter(Boolean))]};
    const updated_at=new Date();
    await database.collection('analysis_runs').updateOne({...scoped(context),analysis_run_id:requestedProject},{$set:{metadata,updated_at}},{session});
    await database.collection('soi_comparisons').updateOne({...scoped(context),comparison_id:id},{$set:{project_analysis_run_id:requestedProject}},{session});
    await require('./platformAudit.service').appendPlatformAudit(infrastructure,database,session,context,'comparison.project_linked','analysis_runs',requestedProject,{comparison_id:id,manifest_sha256:current.analysis?.manifest_sha256||null});
    return cleanDocument({...project,metadata,updated_at});
   }
   const project=await require('../repositories/analysis.repository').createOperationalProject({
    organizationId:identifier(context.organizationId),requestedByUserId:identifier(context.userId),projectName:input.project_name==null?current.project_name:text(input.project_name,'project_name'),city:territory.city,objective:'Evaluar alternativas con la evidencia del análisis guardado.',
    metadata:{territory,project_type:'custom',selected_assets:selected,comparison_snapshot_id:id,comparison_candidates,analysis_context:intelligence.comparisonReference(current),map_context:{center:territory.coordinates,zoom:12}},
   },{database,session,nextId});
   await database.collection('soi_comparisons').updateOne({...scoped(context),comparison_id:id},{$set:{project_analysis_run_id:project.analysis_run_id}},{session});
   return project;
  });
 }
 async function verify(context, value) { return intelligence.verifyComparisonSnapshot(await get(context, value)); }
 async function exportSnapshot(context, value) { const snapshot = await get(context, value); return { format: 'backstage-comparison-export-1', snapshot, verification: await intelligence.verifyComparisonSnapshot(snapshot) }; }
 return { list, get, save, createProject, verify, exportSnapshot };
}
module.exports = { createComparisonService, service: createComparisonService() };
