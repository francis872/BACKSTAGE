const d=require('../infrastructure/atlasDocuments');
const ApiError=require('../utils/ApiError');
const {normalizeRiskComponent,canonicalComponentType}=require('../domain/riskComponent');
async function enrich(row,org){const risk=await require('./riskAssessments.service').getAssessmentById(row.risk_id,org);return {...risk,...row,component_type:canonicalComponentType(row.component_type),assessment_score:risk.score};}
async function listComponents(org){return Promise.all((await d.find('risk_components',d.org(org),{component_id:-1},500)).map(row=>enrich(row,org)));}
async function getComponentById(id,org){return enrich(d.required(await d.one('risk_components',{...d.org(org),component_id:d.id(id)})),org);}
async function normalized(data,org){let input;try{input=normalizeRiskComponent(data);}catch(error){throw new ApiError(400,error.message);}await require('./riskAssessments.service').getAssessmentById(input.risk_id,org);return input;}
async function createComponent(data,org){return d.insert('risk_components','component_id',{...await normalized(data,org),...d.org(org)});}
async function updateComponent(id,data,org){return d.required(await d.update('risk_components',{...d.org(org),component_id:d.id(id)},await normalized(data,org)));}
async function deleteComponent(id,org){return d.required(await d.remove('risk_components',{...d.org(org),component_id:d.id(id)}));}
module.exports={listComponents,getComponentById,createComponent,updateComponent,deleteComponent};
