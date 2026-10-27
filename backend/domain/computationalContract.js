const ApiError = require('../utils/ApiError');
const {hash,canonicalJson}=require('../services/intelligenceContract.service');
const VERSION='backstage-bco-1';
const TERMINAL=['COMPLETED','FAILED','CANCELLED','TIMED_OUT'];
const TRANSITIONS={PENDING:['QUEUED','CANCELLED'],QUEUED:['RUNNING','CANCELLED'],RUNNING:[...TERMINAL,'RETRY_PENDING'],RETRY_PENDING:['RUNNING','CANCELLED','FAILED']};
const fail=(message,status=400)=>{throw new ApiError(status,message);};
function object(value,fields){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k)))fail('Contrato inválido o campos no admitidos.');return value;}
function integer(value,low,high,label){if(!Number.isSafeInteger(value)||value<low||value>high)fail(`${label} fuera de rango.`);return value;}
function identifier(value){const n=Number(value);if(!['string','number'].includes(typeof value))fail('Identificador inválido.');return integer(n,1,Number.MAX_SAFE_INTEGER,'Identificador');}
function text(value,label,max=200){if(typeof value!=='string'||!value.trim()||value.length>max)fail(`${label} requerido o demasiado largo.`);return value.trim();}
function safeJson(value,depth=0){if(depth>16)fail('JSON demasiado anidado.');if(value&&typeof value==='object'){for(const [k,v]of Object.entries(value)){if(k.startsWith('$')||['__proto__','prototype','constructor'].includes(k))fail('Clave JSON no admitida.');safeJson(v,depth+1);}}canonicalJson(value);}
function workflow(input,registry){
 object(input,['name','tasks','project_id','priority','timeout_ms','retention_days']);safeJson(input);
 if(Buffer.byteLength(JSON.stringify(input))>1000000)fail('El flujo supera 1 MB.',413);
 if(!Array.isArray(input.tasks)||input.tasks.length<1||input.tasks.length>8)fail('El flujo requiere entre una y ocho tareas.');
 const tasks=input.tasks.map(task=>{
  object(task,['id','algorithm','version','parameters','depends_on']);
  const id=text(task.id,'ID de tarea',40);if(!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id))fail('ID de tarea inválido.');
  const algorithm=registry.get(task.algorithm);if(task.version!=null&&task.version!==algorithm.version)fail('Versión de algoritmo no disponible.',409);
  if(!task.parameters||typeof task.parameters!=='object'||Array.isArray(task.parameters)||Buffer.byteLength(JSON.stringify(task.parameters))>200000)fail('Los parámetros deben ser un objeto de hasta 200 KB.');
  const depends_on=task.depends_on??[];if(!Array.isArray(depends_on)||depends_on.length>7||new Set(depends_on).size!==depends_on.length||depends_on.some(v=>typeof v!=='string'||v===id))fail('Dependencias inválidas.');
  algorithm.validate?.(task.parameters);
  return {id,algorithm:task.algorithm,version:algorithm.version,engine_sha256:algorithm.source_sha256,parameters:structuredClone(task.parameters),depends_on:[...depends_on]};
 });
 const byId=new Map(tasks.map(t=>[t.id,t]));if(byId.size!==tasks.length)fail('Los IDs de tarea deben ser únicos.');
 const visited=new Set(),stack=new Set();function visit(id){if(stack.has(id))fail('El flujo contiene un ciclo.');if(visited.has(id))return;const task=byId.get(id);if(!task)fail('Dependencia desconocida.');stack.add(id);task.depends_on.forEach(visit);stack.delete(id);visited.add(id);}tasks.forEach(t=>visit(t.id));
 const sensitive=tasks.some(t=>t.algorithm==='perception.positions');if(sensitive&&input.retention_days==null)fail('Las posiciones requieren retención explícita.');
 return {name:text(input.name,'Nombre'),tasks,project_id:input.project_id==null?null:identifier(input.project_id),priority:integer(input.priority??0,0,5,'Prioridad'),timeout_ms:integer(input.timeout_ms??120000,100,120000,'Timeout'),retention_days:integer(input.retention_days??30,1,30,'Retención'),sensitivity:sensitive?'restricted_positions':'organization'};
}
function transition(from,to){if(!TRANSITIONS[from]?.includes(to))fail(`Transición ${from} → ${to} no permitida.`,409);}
function authorize(action,actor,resource){
 if(!actor||!['admin','analyst','viewer'].includes(actor.role))fail('Permiso denegado.',403);
 if(resource&&resource.organization_id!==actor.organizationId)fail('Recurso no encontrado.',404);
 if(resource?.sensitivity==='restricted_positions'&&actor.role!=='admin'&&resource.created_by!==actor.userId)fail('Recurso no encontrado.',404);
 if(action==='read')return;
 if(action==='create'&&['admin','analyst'].includes(actor.role))return;
 if(action==='approve'&&actor.role==='admin'&&resource.created_by!==actor.userId)return;
 if(['update','queue','cancel','archive','retry'].includes(action)&&['admin','analyst'].includes(actor.role)&&(actor.role==='admin'||resource.created_by===actor.userId))return;
 fail('La acción requiere permisos vigentes sobre este recurso.',403);
}
function availableActions(actor,row){
 const possible=['read',...(row.status==='PENDING'?['update','queue']:[]),...(['PENDING','QUEUED','RUNNING','RETRY_PENDING'].includes(row.status)?['cancel']:[]),...(TERMINAL.includes(row.status)?['archive','repeat']:[]),...(['FAILED','TIMED_OUT','CANCELLED'].includes(row.status)?['retry']:[]),...(row.status==='COMPLETED'&&row.tasks?.length===1&&row.tasks[0].algorithm==='defense.evaluate'&&!row.defense_approval?['approve']:[])];
 return possible.filter(action=>{try{authorize(action==='repeat'?'retry':action,actor,row);return true;}catch{return false;}});
}
module.exports={VERSION,TERMINAL,TRANSITIONS,object,integer,identifier,text,safeJson,workflow,transition,authorize,availableActions,hash,fail};
