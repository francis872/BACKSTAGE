const d=require('../infrastructure/atlasDocuments');
const {evaluateLocation}=require('../scoring');
const evaluate=(locationId,modelId,org)=>evaluateLocation(locationId,modelId||null,org);
const getLatest=async(locationId,org)=>d.required(await d.one('scoring_results',{...d.org(org),location_id:d.id(locationId)},{evaluated_at:-1}));
module.exports={evaluate,getLatest};
