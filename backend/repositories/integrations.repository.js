const C=require('../domain/computationalContract');
function createIntegrationsRepository(infrastructure){
 const infra=()=>infrastructure||require('../infrastructure/platformMongo');
 const transaction=work=>infra().withMongoTransaction(work),database=()=>infra().getMongoDatabase();
 const scope=org=>({organization_id:C.identifier(org)});
 async function source(db,session,org,id){const row=await db.collection('integration_sources').findOne({...scope(org),source_id:C.identifier(id)},{session});if(!row)C.fail('Fuente no encontrada.',404);return row;}
 async function event(db,session,org,id){const row=await db.collection('integration_events').findOne({...scope(org),event_id:C.identifier(id)},{session});if(!row)C.fail('Evento no encontrado.',404);return row;}
 return {infra,transaction,database,scope,source,event};
}
module.exports={createIntegrationsRepository};
