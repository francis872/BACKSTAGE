// Compatibility facade. All persistence and parent/tenant checks live in the service/repository.
const service=require('./services/integrations.service');
const registerIntegrationSource=(name,type,config,org,userId)=>service.registerSource(name,type,config,org,userId);
const recordIntegrationEvent=(sourceId,externalId,payload,org,userId)=>service.recordEvent(sourceId,externalId,payload,org,userId);
const getPendingEvents=(limit,org,userId)=>service.listPending(limit,org,userId);
const markEventProcessed=(id,status,org,userId)=>{if(status!=='processed')throw new (require('./utils/ApiError'))(409,'Transición de evento no permitida.');return service.completeEvent(id,org,userId);};
module.exports={registerIntegrationSource,recordIntegrationEvent,getPendingEvents,markEventProcessed};
