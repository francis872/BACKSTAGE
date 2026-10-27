const {Worker}=require('node:worker_threads');
const path=require('node:path');
const ApiError=require('../utils/ApiError');
const registry=require('../infrastructure/analytics/computationalRegistry');
async function execute(task,{signal,context,timeoutMs=30000}={}){
 const algorithm=registry.get(task.algorithm);if(task.version!==algorithm.version||task.engine_sha256&&task.engine_sha256!==algorithm.source_sha256)throw new ApiError(409,'La versión o el código registrado cambió; crea una ejecución con el catálogo vigente.');
 if(algorithm.runtime==='existing_python_runner'){
  const {service,executePython}=require('./bsie.service');const operation=task.algorithm.slice(5);
  const payload=await service.prepare(context,{...task.parameters,operation});const result=await executePython(payload,{signal,organizationId:context.organizationId,timeoutMs});return {algorithm:task.algorithm,version:algorithm.version,source_sha256:algorithm.source_sha256,result};
 }
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new ApiError(409,'Tarea cancelada.'));
  const worker=new Worker(path.resolve(__dirname,'../workers/algorithmRuntime.js'),{workerData:{algorithm:task.algorithm,parameters:task.parameters},env:{NODE_ENV:'production'},execArgv:[],stdout:true,stderr:true,resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
  // Do not copy runtime secrets or echo parameters through worker stdout/stderr.
  worker.stdout.resume();worker.stderr.resume();let settled=false;
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);void worker.terminate();if(error)reject(error);else resolve(result);};
  const cancel=()=>finish(new ApiError(409,'Tarea cancelada.'));
  const timer=setTimeout(()=>finish(new ApiError(408,'La tarea superó su tiempo permitido.')),timeoutMs);
  signal?.addEventListener('abort',cancel,{once:true});
  worker.once('message',message=>message.ok?finish(null,message.output):finish(new ApiError(message.status,message.error)));
  worker.once('error',()=>finish(new ApiError(503,'El runtime aislado no pudo completar la tarea.')));
  worker.once('exit',()=>{if(!settled)finish(new ApiError(503,'El runtime terminó sin resultado.'));});
 });
}
module.exports={execute};
