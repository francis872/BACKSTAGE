const crypto=require('node:crypto');
const {publishOperationalEvent}=require('../realtime/operationalEvents');
function createComputationalOutbox({infrastructure,publish=publishOperationalEvent,now=Date.now}={}){
 const infra=()=>infrastructure||require('../infrastructure/platformMongo');
 async function dispatch({organizationId}={}){
  const db=await infra().getMongoDatabase(),timestamp=new Date(now()),owner=crypto.randomUUID();
  await db.collection('operational_events').updateMany({'outbox.state':'DELIVERING','outbox.attempts':{$gte:5},'outbox.lease_until':{$lte:timestamp},...(organizationId?{organization_id:Number(organizationId)}:{})},{$set:{'outbox.state':'FAILED','outbox.failure_code':'DELIVERY_ATTEMPTS_EXHAUSTED'},$unset:{'outbox.owner':'','outbox.lease_until':''}});
  const row=await db.collection('operational_events').findOneAndUpdate({event_version:1,...(organizationId?{organization_id:Number(organizationId)}:{}),'outbox.attempts':{$lt:5},$or:[{'outbox.state':'PENDING','outbox.next_attempt_at':{$lte:timestamp}},{'outbox.state':'DELIVERING','outbox.lease_until':{$lte:timestamp}}]},{$set:{'outbox.state':'DELIVERING','outbox.owner':owner,'outbox.lease_until':new Date(now()+30000)},$inc:{'outbox.attempts':1}},{sort:{operational_event_id:1},returnDocument:'after',includeResultMetadata:false});
  if(!row)return null;
  const filter={organization_id:row.organization_id,operational_event_id:row.operational_event_id,'outbox.owner':owner,'outbox.state':'DELIVERING'};
  try{
   // The local bus is a notification sink, not cross-process durable transport.
   const {outbox,_id,...message}=row;await publish({...message,delivery_id:outbox.delivery_id});
   await db.collection('operational_events').updateOne(filter,{$set:{'outbox.state':'PUBLISHED','outbox.published_at':new Date(now()),'outbox.sink':'process_local_bus'},$unset:{'outbox.owner':'','outbox.lease_until':''}});
  }catch{
   await db.collection('operational_events').updateOne(filter,{$set:{'outbox.state':row.outbox.attempts>=5?'FAILED':'PENDING','outbox.next_attempt_at':new Date(now()+Math.min(60000,2**row.outbox.attempts*1000))},$unset:{'outbox.owner':'','outbox.lease_until':''}});
  }
  return row.operational_event_id;
 }
 return {dispatch};
}
module.exports={createComputationalOutbox,service:createComputationalOutbox()};
