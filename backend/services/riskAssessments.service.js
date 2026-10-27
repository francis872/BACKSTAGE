const d=require('../infrastructure/atlasDocuments');
const ApiError=require('../utils/ApiError');
const {normalizeAssessmentInput,classifyAssessment}=require('../domain/riskAssessment');
async function enrich(row,org){const l=await d.one('locations',{...d.org(org),location_id:row.location_id});return {...row,location_name:l?.name,city:l?.city,latitude:l?.latitude,longitude:l?.longitude,severity:classifyAssessment(row)};}
async function listAssessments(org){return Promise.all((await d.find('risk_assessments',d.org(org),{assessed_at:-1},200)).map(row=>enrich(row,org)));}
async function getAssessmentById(id,org){return enrich(d.required(await d.one('risk_assessments',{...d.org(org),risk_id:d.id(id)})),org);}
async function getLocationHistory(locationId,org){await require('./locations.service').getLocationById(locationId,org);return Promise.all((await d.find('risk_assessments',{...d.org(org),location_id:d.id(locationId)},{assessed_at:-1,risk_id:-1},100)).map(row=>enrich(row,org)));}
function normalize(data,options){try{return normalizeAssessmentInput(data,options);}catch(error){throw new ApiError(400,error.message);}}
async function createAssessment(data,org){const input=normalize(data,{requireLocation:true});await require('./locations.service').getLocationById(input.location_id,org);return d.insert('risk_assessments','risk_id',{...input,...d.org(org),assessed_at:new Date()});}
async function updateAssessment(id,data,org){return d.required(await d.update('risk_assessments',{...d.org(org),risk_id:d.id(id)},normalize(data)));}
async function deleteAssessment(id,org){return d.required(await d.remove('risk_assessments',{...d.org(org),risk_id:d.id(id)}));}
module.exports={listAssessments,getAssessmentById,getLocationHistory,createAssessment,updateAssessment,deleteAssessment};
