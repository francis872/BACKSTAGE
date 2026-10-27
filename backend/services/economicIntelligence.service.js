const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const C = require('../utils/inputValidation');
const { currentActor } = require('./resourceAuthorization.service');
const { appendPlatformAudit } = require('./platformAudit.service');
const { digest, canonical, createHebraCipher } = require('./hebraCipher.service');
const { createPackedDocument } = require('./hebraPackedDocument.service');
const KIND = 'economic.scenario.version';
const core = () => import('../../shared/economics.v1.mjs');
const engineHash = () => digest(['shared/economics.v1.mjs','shared/economicPlanning.mjs','shared/economicMoney.mjs','shared/decimal.mjs'].map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../..',file))).digest('hex') })));
function createEconomicIntelligenceService({ infrastructure = require('../infrastructure/platformMongo'), operations, cipher = createHebraCipher(), now = Date.now, calculate } = {}) {
  operations ||= require('./propertyOperations.service').createPropertyOperationsService({ infrastructure, cipher, now });
  const documents = createPackedDocument(cipher);
  const scope = (actor, location) => ({ organization_id:actor.organizationId,kind:KIND,'economic.location_id':C.identifier(location) });
  const binding = row => ({ kind:KIND,organization_id:row.organization_id,event_id:row.operational_event_id,location_id:row.economic.location_id,family_id:row.economic.family_id,revision:row.economic.revision,state:row.economic.state,actor_user_id:row.actor_user_id,command_key:row.economic.command_key });
  const view = row => ({ scenario_id:row.operational_event_id,family_id:row.economic.family_id,revision:row.economic.revision,state:row.economic.state,location_id:row.economic.location_id,created_at:row.created_at,commitment:row.economic.commitment });
  const open = row => documents.open(row.economic.packet,row.economic.commitment,binding(row));
  async function access(db,session,context,location) {
    const actor=await currentActor(db,session,context);
    if(!['admin','analyst'].includes(actor.role))C.fail('El análisis económico requiere administración o análisis.',403);
    if(!await db.collection('locations').findOne({organization_id:actor.organizationId,location_id:C.identifier(location),'metadata.horizontal_property.version':1,'metadata.archived':{$ne:true}},{session}))C.fail('Objeto territorial no disponible en esta organización.',404);
    return actor;
  }
  async function normalize(input){try{return(await core()).normalizeEconomicAssumptions(input);}catch(e){C.fail(e.message);}}
  async function evaluate(snapshot,assumptions){try{return calculate?await calculate(snapshot,assumptions):(await core()).runEconomics(snapshot,assumptions);}catch(e){if(e.statusCode)throw e;C.fail(e.message,422);}}
  const audit=(db,session,actor,location,action,metadata)=>appendPlatformAudit(infrastructure,db,session,actor,`economics.${action}`,'locations',C.identifier(location),metadata);
  async function preview(context,location,{currency,scale}={}) {
    if(typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency)||!Number.isInteger(scale)||scale<0||scale>4)C.fail('Selecciona moneda y decimales válidos.');
    const snapshot=await operations.economicSnapshot(context,location,{currency,scale});
    return {captured_at:snapshot.captured_at,currency,scale,entities:snapshot.entities.map(e=>({id:e.id,kind:e.kind,archived:e.archived,coefficient_units:e.coefficient_units,located:!!e.geometry})),budgets:snapshot.budgets,event_count:snapshot.events.length,source:snapshot.provenance.source,complete_coefficients_scope:snapshot.coefficient_scope_complete,encryption_configured:cipher.configured()};
  }
  async function list(context,location){const db=await infrastructure.getMongoDatabase(),actor=await access(db,undefined,context,location);const rows=await db.collection('operational_events').find({...scope(actor,location),'economic.current':true}).sort({operational_event_id:-1}).limit(31).toArray();return{data:rows.slice(0,30).map(view),truncated:rows.length>30};}
  async function rowIn(db,session,actor,location,id){const row=await db.collection('operational_events').findOne({...scope(actor,location),operational_event_id:C.identifier(id)},{session});if(!row)C.fail('Escenario no disponible para este objeto.',404);return row;}
  async function get(context,location,id){return infrastructure.withMongoTransaction(async(db,session)=>{const actor=await access(db,session,context,location),row=await rowIn(db,session,actor,location,id),content=open(row);await audit(db,session,actor,location,'read',{scenario_id:row.operational_event_id,commitment:row.economic.commitment});return{data:{...view(row),...content}};});}
  async function publish(context,location,key,request,content,priorId,expectedRevision,state='draft',expectedScopeRevision) {
    return infrastructure.withMongoTransaction(async(db,session)=>{
      const actor=await access(db,session,context,location);
      if(state==='approved_for_planning'&&actor.role!=='admin')C.fail('La aprobación requiere administración.',403);
      const orgFilter={organization_id:actor.organizationId,status:'active',...(expectedScopeRevision!=null?{membership_revision:expectedScopeRevision}:{})};
      const locked=await db.collection('identity_organizations').updateOne(orgFilter,{$inc:{membership_revision:1}},{session});
      if(expectedScopeRevision!=null&&!locked.matchedCount)C.fail('Los datos cambiaron durante la revisión; vuelve a comprobarlos.',409);
      const repeat=await db.collection('operational_events').findOne({...scope(actor,location),'economic.command_key':key},{session});
      if(repeat){const saved=open(repeat);if(repeat.actor_user_id!==actor.userId||canonical(saved.command)!==canonical(request))C.fail('La clave corresponde a otra operación.',409);return{created:false,data:{...view(repeat),...saved}};}
      let prior;
      if(priorId!=null){prior=await rowIn(db,session,actor,location,priorId);if(!prior.economic.current||prior.economic.revision!==expectedRevision)C.fail('La versión cambió; consulta el escenario vigente.',409);}
      const id=await infrastructure.nextId('operational_events',session),row={organization_id:actor.organizationId,operational_event_id:id,actor_user_id:actor.userId,kind:KIND,event_type:'economics.scenario',title:'Evidencia económica cifrada',severity:'info',created_at:new Date(now()),resolved_at:new Date(now()),economic:{location_id:C.identifier(location),family_id:prior?.economic.family_id||id,revision:(prior?.economic.revision||0)+1,current:true,state,command_key:key}};
      const sealed=documents.seal({...content,command:request},binding(row));row.economic.packet=sealed.packet;row.economic.commitment=sealed.commitment;
      if(prior){const changed=await db.collection('operational_events').updateOne({...scope(actor,location),operational_event_id:prior.operational_event_id,'economic.current':true},{$set:{'economic.current':false}},{session});if(!changed.modifiedCount)C.fail('La revisión cambió.',409);}
      await db.collection('operational_events').insertOne(row,{session});await audit(db,session,actor,location,state==='draft'?'calculated':'approved',{scenario_id:id,family_id:row.economic.family_id,revision:row.economic.revision,commitment:row.economic.commitment});
      return{created:true,data:{...view(row),...content}};
    });
  }
  async function create(context,location,input,key,{priorId,revision}={}) {
    key=require('../domain/horizontalProperty').requestKey(key);const assumptions=await normalize(input),db=await infrastructure.getMongoDatabase(),actor=await access(db,undefined,context,location);
    if(!documents.configured())C.fail('Configura las claves del servidor para proteger los escenarios financieros.',503);
    const command={action:priorId?'revise':'create',assumptions,...(priorId?{prior_id:C.identifier(priorId),revision:C.identifier(revision)}:{})};
    const prior=await db.collection('operational_events').findOne({...scope(actor,location),'economic.command_key':key});
    if(prior){const saved=open(prior);if(prior.actor_user_id!==actor.userId||canonical(saved.command)!==canonical(command))C.fail('La clave ya corresponde a otros supuestos.',409);return{created:false,data:{...view(prior),...saved}};}
    const snapshot=await operations.economicSnapshot(context,location,assumptions),result=await evaluate(snapshot,assumptions);
    const content={assumptions,snapshot,result,manifest:{version:result.version,engine_source_sha256:engineHash(),input_sha256:digest({snapshot,assumptions}),result_sha256:digest(result),runtime:process.version,policy:result.policy,review:'planning_proposal_not_legal_or_bank_certification'}};
    return publish(context,location,key,command,content,priorId,revision);
  }
  async function approve(context,location,id,input,key) {
    C.object(input,['revision','reference']);C.identifier(input.revision);if(typeof input.reference!=='string'||!input.reference.trim()||input.reference.length>2000)C.fail('Registra la evidencia de revisión y aprobación interna.');
    key=require('../domain/horizontalProperty').requestKey(key);
    const {data}=await get(context,location,id),db=await infrastructure.getMongoDatabase(),actor=await access(db,undefined,context,location);
    if(actor.role!=='admin')C.fail('La aprobación requiere administración.',403);
    if(data.state!=='draft'||data.revision!==input.revision)C.fail('Solo se aprueba la revisión vigente de un borrador.',409);
    if(data.manifest.engine_source_sha256!==engineHash()||digest({snapshot:data.snapshot,assumptions:data.assumptions})!==data.manifest.input_sha256||digest(data.result)!==data.manifest.result_sha256||digest(await evaluate(data.snapshot,data.assumptions))!==data.manifest.result_sha256)C.fail('Reproduce el cálculo con su motor y evidencia verificables antes de aprobarlo.',409);
    if(data.result.optimization.status==='infeasible'||data.result.optimization.status==='requires_review'||data.result.fees.status==='requires_review')C.fail('Resuelve las restricciones o reglas pendientes antes de aprobar la propuesta.',409);
    const current=await operations.economicSnapshot(context,location,data.assumptions);
    if(current.basis_sha256!==data.snapshot.basis_sha256)C.fail('El libro, presupuesto o coeficientes cambiaron; calcula una revisión nueva.',409);
    const {scenario_id,family_id,revision,state,location_id,created_at,commitment,command,...content}=data;
    content.approval={approved_by:actor.userId,at:new Date(now()).toISOString(),reference:input.reference.trim(),scope:'internal_planning_only_not_legal_certification_or_charge_creation'};
    return publish(context,location,key,{action:'approve',prior_id:C.identifier(id),revision:input.revision,reference:input.reference.trim()},content,id,input.revision,'approved_for_planning',current.scope_revision);
  }
  async function reproduce(context,location,id){const{data}=await get(context,location,id);if(data.manifest.engine_source_sha256!==engineHash())C.fail('Se requiere la versión histórica del motor para reproducir esta evidencia.',409);const expected=digest({snapshot:data.snapshot,assumptions:data.assumptions});if(expected!==data.manifest.input_sha256||digest(data.result)!==data.manifest.result_sha256)C.fail('La evidencia no coincide con su manifiesto.',409);const result=await evaluate(data.snapshot,data.assumptions),verified=digest(result)===data.manifest.result_sha256;await infrastructure.withMongoTransaction(async(db,session)=>{const actor=await access(db,session,context,location);await audit(db,session,actor,location,'reproduced',{scenario_id:C.identifier(id),verified});});return{scenario_id:C.identifier(id),verified,historical_result_modified:false};}
  return{preview,list,get,create,approve,reproduce};
}
module.exports={createEconomicIntelligenceService,KIND};
