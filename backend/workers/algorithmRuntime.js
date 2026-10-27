// Closed, reviewed catalog only. No eval, uploaded modules, URLs or shell commands.
const {parentPort,workerData}=require('node:worker_threads');
const {runPure}=require('../infrastructure/analytics/computationalRegistry');
(async()=>{
 try{const output=await runPure(workerData.algorithm,workerData.parameters);if(Buffer.byteLength(JSON.stringify(output))>1000000)throw Error('result_too_large');parentPort.postMessage({ok:true,output});}
 catch(error){parentPort.postMessage({ok:false,error:error.statusCode?error.message:'El contrato o los recursos del algoritmo impidieron completar la tarea.',status:error.statusCode||422});}
})().finally(()=>parentPort.close());
