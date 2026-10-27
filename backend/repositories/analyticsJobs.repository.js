const d=require('../infrastructure/atlasDocuments');
const createJob=({organizationId,requestedByUserId,algorithmName,algorithmVersion,params,context})=>d.insert('analytics_jobs','analytics_job_id',{...d.org(organizationId),requested_by_user_id:requestedByUserId,algorithm_name:algorithmName,algorithm_version:algorithmVersion,status:'running',params:params||{},context:context||{},started_at:new Date()});
async function completeJob(jobId,{result,durationMs,analysis,organizationId,userId,projectId}) {
 if(!analysis)return d.update('analytics_jobs',{analytics_job_id:d.id(jobId)},{status:'succeeded',result,duration_ms:durationMs,completed_at:new Date()});
 return d.withMongoTransaction(async(database,session)=>{
  const filter={analytics_job_id:d.id(jobId),...d.org(organizationId),status:'running'};
  const now=new Date();
  const row=await database.collection('analytics_jobs').findOneAndUpdate(filter,{$set:{status:'succeeded',result,analysis,duration_ms:durationMs,completed_at:now,updated_at:now}},{session,returnDocument:'after',includeResultMetadata:false});
  if(!row)throw new (require('../utils/ApiError'))(409,'La ejecución ya no está disponible para completarse.');
  if(projectId){
   const linked=await database.collection('analysis_runs').updateOne({...d.org(organizationId),analysis_run_id:d.id(projectId)},{$addToSet:{'metadata.analytics_evidence':{analytics_job_id:d.id(jobId),algorithm:row.algorithm_name,version:row.algorithm_version,manifest_sha256:analysis.manifest_sha256}},$set:{updated_at:now}},{session});
   if(linked.matchedCount!==1)throw new (require('../utils/ApiError'))(404,'Proyecto no encontrado.');
  }
  if(userId)await require('../services/platformAudit.service').appendPlatformAudit(d,database,session,{organizationId,userId},'analysis.saved','analytics_jobs',jobId,{engine:row.algorithm_name,version:row.algorithm_version,manifest_sha256:analysis.manifest_sha256,analysis_run_id:projectId||null});
  return d.cleanDocument(row);
 });
}
const failJob=(jobId,{error,durationMs})=>d.update('analytics_jobs',{analytics_job_id:d.id(jobId)},{status:'failed',error:String(error).slice(0,2000),duration_ms:durationMs,completed_at:new Date()});
const listJobs=({organizationId,algorithmName,limit=20,projectId})=>d.find('analytics_jobs',{...d.org(organizationId),kind:{$ne:'bco.workflow'},...(algorithmName?{algorithm_name:algorithmName}:{}),...(projectId!=null?{'context.analysis_run_id':d.id(projectId)}:{})},{created_at:-1},Math.min(Number(limit)||20,100));
const getJobById=(jobId,organizationId)=>d.one('analytics_jobs',{...d.org(organizationId),kind:{$ne:'bco.workflow'},analytics_job_id:d.id(jobId)});
module.exports={createJob,completeJob,failJob,listJobs,getJobById};
