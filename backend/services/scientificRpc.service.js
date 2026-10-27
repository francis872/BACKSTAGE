const crypto=require('node:crypto');
const ApiError=require('../utils/ApiError');
async function executeRemote(engine,payload,{signal,organizationId='worker',timeoutMs=30000,fetchImpl=fetch,env=process.env}={}){
 let endpoint;try{endpoint=new URL(env.SOI_SCIENCE_RPC_URL==='self'?`https://${env.VERCEL_URL}/internal/science`:env.SOI_SCIENCE_RPC_URL);}catch{throw new ApiError(503,'Endpoint científico remoto no configurado.');}
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||!env.SOI_SCIENCE_RPC_SECRET||env.SOI_SCIENCE_RPC_SECRET.length<32)throw new ApiError(503,'Configuración científica remota incompleta.');
 const body=JSON.stringify({engine,organization_id:String(organizationId),timestamp_ms:Date.now(),nonce:crypto.randomUUID(),payload});
 if(Buffer.byteLength(body)>4000000)throw new ApiError(413,'La solicitud científica remota supera 4 MB.');
 const signature=crypto.createHmac('sha256',env.SOI_SCIENCE_RPC_SECRET).update(body).digest('hex');
 const headers={'Content-Type':'application/json','X-SOI-Signature':signature};
 // The project's automation credential belongs only to its own deployment.
 if(env.SOI_SCIENCE_RPC_URL==='self'&&env.VERCEL_AUTOMATION_BYPASS_SECRET)headers['x-vercel-protection-bypass']=env.VERCEL_AUTOMATION_BYPASS_SECRET;
 try{
  const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',headers,body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs)});
  if(Number(response.headers?.get?.('content-length')||0)>4000000)throw new ApiError(413,'El resultado científico remoto supera 4 MB.');
  const reader=response.body?.getReader();let raw='';
  if(reader){let size=0;const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4000000){await reader.cancel();throw new ApiError(413,'El resultado científico remoto supera 4 MB.');}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}else raw=await response.text();
  if(Buffer.byteLength(raw)>4000000)throw new ApiError(413,'El resultado científico remoto supera 4 MB.');
  let output;try{output=JSON.parse(raw);}catch{throw new ApiError(503,'El runtime científico remoto no devolvió JSON válido.');}
  if(!response.ok||!output.ok)throw new ApiError([400,408,413,422,429].includes(response.status)?response.status:503,typeof output.error==='string'&&output.error.length<2000?output.error:'El runtime científico remoto no pudo completar la operación.');
  if(!output.result||output.result.operation!==payload.operation||typeof output.result.version!=='string')throw new ApiError(503,'Respuesta científica remota incompatible.');
  return output.result;
 }catch(error){if(error.statusCode)throw error;if(signal?.aborted)throw new ApiError(409,'Análisis cancelado.');if(error.name==='TimeoutError')throw new ApiError(408,'El proceso científico remoto superó su límite de tiempo.');throw new ApiError(503,'No se pudo consultar el runtime científico remoto.');}
}
module.exports={executeRemote};
