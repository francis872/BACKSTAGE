const crypto=require('node:crypto');
const C=require('../domain/computationalContract');
const {createComputationalRepository,KIND}=require('../repositories/computationalWorkflows.repository');
const defaultRegistry=require('../infrastructure/analytics/computationalRegistry');
function createComputationalOrchestrator({infrastructure,registry=defaultRegistry,runner=require('./algorithmRuntime.service').execute,now=Date.now,heartbeatMs=10000}={}){
 const repo=createComputationalRepository(infrastructure);
 function publicRun(row,{summary=false}={}){const {_id,worker_owner,slot,lease_until,creation_sha256,...rest}=row;return summary?{analytics_job_id:row.analytics_job_id,name:row.name,status:row.status,revision:row.revision,created_by:row.created_by,created_at:row.created_at,updated_at:row.updated_at,project_id:row.project_id,priority:row.priority,expires_at:row.expires_at,duration_ms:row.duration_ms??null}:rest;}
 async function project(db,session,org,id){if(id!=null){const p=await db.collection('analysis_runs').findOne({organization_id:org,analysis_run_id:id},{session});if(!p||p.status==='archived')C.fail('Proyecto no encontrado.',404);}}
 async function create(context,input,key,{retryOf=null,repeatOf=null}={}){
  const definition=C.workflow(input,registry),requestKey=C.text(key,'Idempotency-Key',128);if(!/^[a-zA-Z0-9._:-]{8,128}$/.test(requestKey))C.fail('Idempotency-Key requiere entre 8 y 128 caracteres seguros.');
  const creationHash=C.hash({input,retry_of:retryOf,repeat_of:repeatOf}),recordKey=`bco:${C.identifier(context.organizationId)}:${C.hash(requestKey)}`;
  async function write(){return repo.transaction(async(db,session)=>{
   const actor=await repo.actor(db,session,context);C.authorize('create',actor);
   const existing=await db.collection('analytics_jobs').findOne({_id:recordKey,kind:KIND,organization_id:actor.organizationId},{session});
   if(existing){C.authorize('read',actor,existing);if(existing.expires_at<=new Date(now())||existing.archived)C.fail('La ejecución anterior venció o fue archivada; usa una nueva clave.',410);if(existing.creation_sha256!==creationHash)C.fail('La clave idempotente ya pertenece a otro contenido.',409);return {run:publicRun(existing),created:false};}
   await project(db,session,actor.organizationId,definition.project_id);
   const count=await db.collection('analytics_jobs').countDocuments({kind:KIND,organization_id:actor.organizationId,status:{$in:['PENDING','QUEUED','RUNNING','RETRY_PENDING']},expires_at:{$gt:new Date(now())}},{session});if(count>=3)C.fail('Máximo tres flujos pendientes por organización.',429);
   const row={_id:recordKey,kind:KIND,algorithm_name:KIND,algorithm_version:C.VERSION,organization_id:actor.organizationId,analytics_job_id:await repo.infra().nextId('analytics_jobs',session),created_by:actor.userId,requested_by_user_id:actor.userId,...definition,tasks:definition.tasks.map(t=>({...t,state:'PENDING'})),input_sha256:C.hash(definition),creation_sha256:creationHash,status:'PENDING',revision:0,attempts:0,created_at:new Date(now()),updated_at:new Date(now()),expires_at:new Date(now()+definition.retention_days*86400000),correlation_id:context.correlationId||crypto.randomUUID(),retry_of:retryOf,repeat_of:repeatOf,archived:false};
   await db.collection('analytics_jobs').insertOne(row,{session});await repo.event(db,session,row,'created',now());return {run:publicRun(row),created:true};
  });}
  try{return await write();}catch(error){if(error.code===11000)return write();throw error;}
 }
 async function get(context,id){const db=await repo.database(),actor=await repo.actor(db,undefined,context),row=await repo.get(db,undefined,actor.organizationId,id,now());C.authorize('read',actor,row);return {...publicRun(row),available_actions:C.availableActions(actor,row)};}
 async function list(context,query={}){
  C.object(query,['limit','after','status']);const limit=C.integer(query.limit==null?20:Number(query.limit),1,100,'Límite');if(query.status&&!['PENDING','QUEUED','RUNNING','RETRY_PENDING',...C.TERMINAL].includes(query.status))C.fail('Estado de filtro inválido.');
  const db=await repo.database(),actor=await repo.actor(db,undefined,context),rows=await db.collection('analytics_jobs').find({kind:KIND,organization_id:actor.organizationId,archived:{$ne:true},expires_at:{$gt:new Date(now())},...(query.after?{analytics_job_id:{$lt:C.identifier(query.after)}}:{}),...(query.status?{status:query.status}:{}),...(actor.role==='admin'?{}:{$or:[{sensitivity:{$ne:'restricted_positions'}},{created_by:actor.userId}]})},{projection:{tasks:0,creation_sha256:0,worker_owner:0,lease_until:0}}).sort({analytics_job_id:-1}).limit(limit+1).toArray();
  return {data:rows.slice(0,limit).map(row=>publicRun(row,{summary:true})),pagination:{limit,next:rows.length>limit?rows[limit-1].analytics_job_id:null}};
 }
 async function mutate(context,id,action,input={}){
  C.object(input,action==='update'?['revision','workflow']:action==='approve'?['revision','result_sha256','reason']:['revision']);C.integer(input.revision,0,Number.MAX_SAFE_INTEGER,'Revisión');
  return repo.transaction(async(db,session)=>{
   const actor=await repo.actor(db,session,context),row=await repo.get(db,session,actor.organizationId,id,now());C.authorize(action,actor,row);if(row.revision!==input.revision)C.fail('Revisión desactualizada.',409);
   let fields={},type=action;
   if(action==='update'){if(row.status!=='PENDING')C.fail('Solo se edita un flujo pendiente.',409);const def=C.workflow(input.workflow,registry);await project(db,session,actor.organizationId,def.project_id);fields={...def,tasks:def.tasks.map(t=>({...t,state:'PENDING'})),input_sha256:C.hash(def),expires_at:new Date(row.created_at.getTime()+def.retention_days*86400000)};type='updated';}
   else if(action==='queue'){C.transition(row.status,'QUEUED');await project(db,session,actor.organizationId,row.project_id);fields={status:'QUEUED',queued_at:new Date(now())};type='queued';}
   else if(action==='cancel'){C.transition(row.status,'CANCELLED');fields={status:'CANCELLED',completed_at:new Date(now()),tasks:row.tasks.map(t=>t.state==='COMPLETED'?t:{...t,state:'CANCELLED'})};type='cancelled';}
   else if(action==='archive'){if(!C.TERMINAL.includes(row.status))C.fail('Solo se archivan ejecuciones terminadas.',409);fields={archived:true,archived_at:new Date(now())};type='archived';}
   else if(action==='approve'){
    if(row.status!=='COMPLETED'||row.tasks.length!==1||row.tasks[0].algorithm!=='defense.evaluate'||row.defense_approval)C.fail('Solo se aprueba una evaluación defensiva terminada y sin aprobación previa.',409);
    if(input.result_sha256!==row.result_sha256)C.fail('El resultado revisado no coincide.',409);fields={defense_approval:{approved_by:actor.userId,approved_at:new Date(now()),reason:C.text(input.reason,'Motivo',2000),result_sha256:row.result_sha256,applied_to_sensitive_policy:false}};type='defense_approved';
   }else C.fail('Acción desconocida.');
   const saved=await repo.save(db,session,row,fields,now());await repo.event(db,session,saved,type,now(),{actorId:actor.userId});return publicRun(saved);
  });
 }
 async function retry(context,id,input,key,{repeat=false}={}){C.object(input,['revision']);const original=await get(context,id);C.authorize('retry',await repo.actor(await repo.database(),undefined,context),original);if(input.revision!==original.revision||!(repeat?C.TERMINAL:['FAILED','TIMED_OUT','CANCELLED']).includes(original.status))C.fail('La ejecución no admite este reintento o repetición.',409);const {name,tasks,project_id,priority,timeout_ms,retention_days}=original;return create(context,{name,tasks:tasks.map(({id,algorithm,version,parameters,depends_on})=>({id,algorithm,version,parameters,depends_on})),project_id,priority,timeout_ms,retention_days},key,repeat?{repeatOf:original.analytics_job_id}:{retryOf:original.analytics_job_id});}
 async function verify(context,id){
  const row=await get(context,id),definition={name:row.name,tasks:row.tasks.map(({id,algorithm,version,engine_sha256,parameters,depends_on})=>({id,algorithm,version,engine_sha256,parameters,depends_on})),project_id:row.project_id,priority:row.priority,timeout_ms:row.timeout_ms,retention_days:row.retention_days,sensitivity:row.sensitivity};
  const inputMatches=C.hash(definition)===row.input_sha256;
  const resultsMatch=row.tasks.filter(t=>t.state==='COMPLETED').every(t=>C.hash(t.result)===t.result_sha256&&C.hash({algorithm:t.algorithm,version:t.version,engine_sha256:t.engine_sha256,parameters:t.parameters})===t.input_sha256);
  const manifestMatches=row.status!=='COMPLETED'||row.tasks.every(t=>t.state==='COMPLETED')&&C.hash(row.tasks.map(t=>({id:t.id,algorithm:t.algorithm,version:t.version,input_sha256:t.input_sha256,result_sha256:t.result_sha256})))===row.result_sha256;
  const compatible=row.tasks.every(t=>{try{const a=registry.get(t.algorithm);return t.version===a.version&&t.engine_sha256===a.source_sha256;}catch{return false;}});
  return {analytics_job_id:row.analytics_job_id,input_matches:inputMatches,results_match:resultsMatch,manifest_matches:manifestMatches,historical_integrity:inputMatches&&resultsMatch&&manifestMatches,current_engines_match:compatible,numeric_execution_repeated:false,repeat_command:'POST /computational/runs/{id}/repeat',checked_at:new Date(now())};
 }
 async function metrics(context){const sample=await list(context,{limit:100}),durations=sample.data.map(row=>row.duration_ms).filter(v=>typeof v==='number'&&Number.isFinite(v)).sort((a,b)=>a-b);return {scope:'latest_100_visible_nonexpired_nonarchived_runs',organization_id:context.organizationId,cutoff:new Date(now()),sample_size:sample.data.length,truncated:sample.pagination.next!==null,states:Object.fromEntries(['PENDING','QUEUED','RUNNING','RETRY_PENDING',...C.TERMINAL].map(state=>[state,sample.data.filter(row=>row.status===state).length])),execution_duration_ms:{n:durations.length,p95:durations.length?durations[Math.ceil(.95*durations.length)-1]:null,formula:'nearest_rank_p95_of_recorded_attempt_duration_ms'},availability:null,worker_heartbeat:'leases_do_not_prove_continuous_worker_availability'};}
 async function taskUpdate(job,index,fields){return repo.transaction(async(db,session)=>{const actor=await repo.actor(db,session,{organizationId:job.organization_id,userId:job.created_by});C.authorize('create',actor);const current=await repo.get(db,session,job.organization_id,job.analytics_job_id,now());if(current.status!=='RUNNING'||current.worker_owner!==job.worker_owner||current.lease_until<=new Date(now()))C.fail('Ejecución cancelada o lease vencido.',409);const tasks=[...current.tasks];tasks[index]={...tasks[index],...fields};return repo.save(db,session,current,{tasks},now());});}
 async function processNext(options={}){
  const job=await repo.claim({...options,now});if(!job)return null;
  if(options.onClaim)await options.onClaim(job);
  const controller=new AbortController(),started=performance.now();let timedOut=false,lost=false,checking=false,polling=false,renewal=Promise.resolve(),poll=Promise.resolve();
  const deadline=setTimeout(()=>{timedOut=true;controller.abort();},job.timeout_ms);
  const heartbeat=setInterval(()=>{if(checking)return;checking=true;renewal=(async()=>{try{if(!await repo.renew(job,now)){lost=true;controller.abort();}}catch{lost=true;controller.abort();}finally{checking=false;}})();},heartbeatMs);
  const cancellationWatch=setInterval(()=>{if(polling)return;polling=true;poll=(async()=>{try{if(!await repo.stillRunning(job,now)){lost=true;controller.abort();}}catch{lost=true;controller.abort();}finally{polling=false;}})();},Math.min(1000,heartbeatMs));
  const stopWatches=async()=>{clearInterval(heartbeat);clearInterval(cancellationWatch);await Promise.allSettled([renewal,poll]);};

  const completed=new Set(job.tasks.filter(t=>t.state==='COMPLETED').map(t=>t.id));
  try{
   while(completed.size<job.tasks.length){
    if(controller.signal.aborted)throw Error('aborted');
    const ready=[];for(const candidate of job.tasks.map((t,index)=>({t,index})).filter(({t})=>!completed.has(t.id)&&t.depends_on.every(id=>completed.has(id)))){
     if(ready.length>=2)break;
     if(registry.get(candidate.t.algorithm).runtime==='existing_python_runner'&&ready.some(({t})=>registry.get(t.algorithm).runtime==='existing_python_runner'))continue;
     ready.push(candidate);
    }if(!ready.length)throw Error('unresolvable_dag');
    await Promise.all(ready.map(async({t,index})=>{try{
     await taskUpdate(job,index,{state:'RUNNING',started_at:new Date(now())});const time=performance.now();
     const execution=runner(t,{signal:controller.signal,context:{organizationId:job.organization_id,userId:job.created_by,role:(await repo.actor(await repo.database(),undefined,{organizationId:job.organization_id,userId:job.created_by})).role},timeoutMs:Math.min(30000,job.timeout_ms)});
     let abort;const interrupted=new Promise((resolve,reject)=>{abort=()=>reject(Error('aborted'));if(controller.signal.aborted)abort();else controller.signal.addEventListener('abort',abort,{once:true});});
     let result;try{result=await Promise.race([execution,interrupted]);}finally{controller.signal.removeEventListener('abort',abort);}
     if(Buffer.byteLength(JSON.stringify(result))>1000000)C.fail('Resultado de tarea superior a 1 MB.',413);
     C.safeJson(result);await taskUpdate(job,index,{state:'COMPLETED',result,result_sha256:C.hash(result),input_sha256:C.hash({algorithm:t.algorithm,version:t.version,engine_sha256:t.engine_sha256,parameters:t.parameters}),duration_ms:performance.now()-time,completed_at:new Date(now())});completed.add(t.id);
    }catch(error){await taskUpdate(job,index,{state:timedOut||error.statusCode===408?'TIMED_OUT':'FAILED',error:{code:timedOut||error.statusCode===408?'TASK_TIMEOUT':'TASK_FAILED',message:error.statusCode?error.message:'La tarea no pudo completarse.'}}).catch(()=>{});throw error;}
    }));
   }
   await stopWatches();if(controller.signal.aborted)throw Error('aborted');await finish('COMPLETED');
  }catch(error){controller.abort();await stopWatches();await finish(timedOut||error.statusCode===408?'TIMED_OUT':'FAILED',timedOut?'WORKFLOW_TIMEOUT':lost?'LEASE_OR_AUTHORIZATION_LOST':error.statusCode===408?'TASK_TIMEOUT':'TASK_FAILED');}
  finally{await stopWatches();clearTimeout(deadline);controller.abort();await repo.release(job,now());}
  return job.analytics_job_id;
  async function finish(status,code){await repo.transaction(async(db,session)=>{
   const row=await db.collection('analytics_jobs').findOne({...repo.filter(job.organization_id,job.analytics_job_id),status:'RUNNING',worker_owner:job.worker_owner},{session});if(!row)return;
   if(row.lease_until<=new Date(now())||row.expires_at<=new Date(now()))return;
   if(status==='COMPLETED'){const actor=await repo.actor(db,session,{organizationId:job.organization_id,userId:job.created_by});C.authorize('create',actor);await project(db,session,actor.organizationId,row.project_id);}
   const tasks=row.tasks.map(t=>['COMPLETED','FAILED','TIMED_OUT'].includes(t.state)?t:{...t,state:status==='TIMED_OUT'?'TIMED_OUT':'CANCELLED',error:{code:code||'DEPENDENCY_NOT_COMPLETED'}});
   const resultHash=status==='COMPLETED'?C.hash(tasks.map(t=>({id:t.id,algorithm:t.algorithm,version:t.version,input_sha256:t.input_sha256,result_sha256:t.result_sha256}))):null;
   const saved=await repo.save(db,session,row,{status,tasks,worker_owner:null,lease_until:null,completed_at:new Date(now()),duration_ms:performance.now()-started,result_sha256:resultHash,...(code?{error:{code}}:{})},now());
   if(status==='COMPLETED'&&row.project_id){const linked=await db.collection('analysis_runs').updateOne({organization_id:row.organization_id,analysis_run_id:row.project_id},{$addToSet:{'metadata.computational_evidence':{analytics_job_id:row.analytics_job_id,input_sha256:row.input_sha256,result_sha256:resultHash}},$set:{updated_at:new Date(now())}},{session});if(linked.matchedCount!==1)C.fail('Proyecto no encontrado.',404);}
   await repo.event(db,session,saved,status.toLowerCase(),now(),{actorType:'worker_on_behalf_of_creator'});
  });}
 }
 return {create,get,list,mutate,retry,verify,metrics,processNext,catalog:()=>({version:C.VERSION,algorithms:registry.list(),unavailable:registry.unavailable||[],worker:'separate_cli_required',limits:{global_workflows:2,per_organization:1,tasks_per_workflow:8,parallel_tasks:2,task_timeout_ms:30000,workflow_timeout_ms:120000,max_attempts:3}}),repository:repo};
}
module.exports={createComputationalOrchestrator,service:createComputationalOrchestrator()};
