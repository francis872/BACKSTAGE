const d=require('../infrastructure/atlasDocuments');
const startExecution=input=>d.insert('command_executions','command_execution_id',{...d.org(input.organizationId),correlation_id:input.correlationId,analysis_run_id:input.analysisRunId||null,actor_user_id:input.actorUserId||null,source:input.source||'manual',command:input.command,stage:input.stage||null,input_payload:input.inputPayload||{},status:'running',started_at:new Date()});
async function finish(id,fields){const filter={command_execution_id:d.id(id)};const row=await d.one('command_executions',filter);if(!row)return null;return d.update('command_executions',filter,{...fields,completed_at:new Date(),duration_ms:Math.max(0,Date.now()-new Date(row.started_at).getTime())});}
const completeExecution=(id,resultPayload)=>finish(id,{status:'completed',result_payload:resultPayload||{}});
const failExecution=(id,errorMessage)=>finish(id,{status:'failed',error_message:String(errorMessage||'Unknown command error')});
const listExecutions=({organizationId,analysisRunId,limit=30})=>d.find('command_executions',{...d.org(organizationId),...(analysisRunId?{analysis_run_id:d.id(analysisRunId)}:{})},{started_at:-1},Math.min(Number(limit)||30,100));
module.exports={startExecution,completeExecution,failExecution,listExecutions};
