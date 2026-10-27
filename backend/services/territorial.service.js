const d=require('../infrastructure/atlasDocuments');
const ApiError=require('../utils/ApiError');
const engine=require('../earthart');
function record(data){if(!data.name||!data.unit_type)throw new ApiError(400,'name y unit_type son requeridos.');const row={country:'Colombia',...d.pick(data,'external_id name unit_type parent_unit_id city region country population population_growth_pct area_km2 latitude longitude')};row.geometry=row.latitude!=null&&row.longitude!=null?{type:'Point',coordinates:[Number(row.longitude),Number(row.latitude)]}:null;return row;}
const listUnits=org=>d.find('territorial_units',d.org(org),{unit_id:1});
const getUnitById=async(id,org)=>d.required(await d.one('territorial_units',{...d.org(org),unit_id:d.id(id)}));
async function validateParent(data,org){if(data.parent_unit_id)await getUnitById(data.parent_unit_id,org);}
async function createUnit(data,org){await validateParent(data,org);return d.insert('territorial_units','unit_id',{...record(data),...d.org(org)});}
async function updateUnit(id,data,org){await validateParent(data,org);return d.required(await d.update('territorial_units',{...d.org(org),unit_id:d.id(id)},record(data)));}
const deleteUnit=async(id,org)=>d.required(await d.remove('territorial_units',{...d.org(org),unit_id:d.id(id)}));
async function listFacilities(unitId,org){if(unitId)await getUnitById(unitId,org);return d.find('territorial_facilities',{...d.org(org),...(unitId?{unit_id:d.id(unitId)}:{})},{facility_id:1},200);}
async function createFacility(data,org){if(!data.unit_id||!data.facility_type||!data.name)throw new ApiError(400,'unit_id, facility_type y name son requeridos.');await getUnitById(data.unit_id,org);if(data.location_id)await require('./locations.service').getLocationById(data.location_id,org);return d.insert('territorial_facilities','facility_id',{...d.pick(data,'unit_id location_id facility_type name capacity latitude longitude'),unit_id:d.id(data.unit_id),...d.org(org),geometry:data.latitude!=null&&data.longitude!=null?{type:'Point',coordinates:[Number(data.longitude),Number(data.latitude)]}:null});}
async function listDimensionScores(unitId,org){if(unitId)await getUnitById(unitId,org);return d.find('territorial_dimension_scores',{...d.org(org),...(unitId?{unit_id:d.id(unitId)}:{})},{dimension:1,measured_at:-1},200);}
async function upsertDimensionScore(data,org){if(!data.unit_id||!data.dimension||data.score===undefined)throw new ApiError(400,'unit_id, dimension y score son requeridos.');await getUnitById(data.unit_id,org);const q={...d.org(org),unit_id:d.id(data.unit_id),dimension:data.dimension,measured_at:data.measured_at||new Date().toISOString().slice(0,10)};return d.cleanDocument(await (await d.collection('territorial_dimension_scores')).findOneAndUpdate(q,{$set:{score:data.score,details:data.details||{}},$setOnInsert:{...q,score_id:await d.nextId('territorial_dimension_scores')}},{upsert:true,returnDocument:'after',includeResultMetadata:false}));}
async function getUnitIndex(id,org){await getUnitById(id,org);return await engine.getLatestIndexSnapshot(id)||(await engine.computeTerritorialIndex(id)).snapshot;}
async function recomputeUnitIndex(id,org){await getUnitById(id,org);return (await engine.computeTerritorialIndex(id)).snapshot;}
async function listUnitGaps(id,org){await getUnitById(id,org);return d.find('territorial_gaps',{...d.org(org),unit_id:d.id(id)},{detected_at:-1},50);}
async function detectUnitGaps(id,org){await getUnitById(id,org);return engine.detectGaps(id,org);}
async function listGlobalGaps(org){return Promise.all((await d.find('territorial_gaps',{...d.org(org),resolved:false},{detected_at:-1},100)).map(async row=>({...row,unit_name:(await getUnitById(row.unit_id,org)).name})));}
async function simulateUnit(id,params,org){await getUnitById(id,org);return engine.simulateInfrastructure(id,params||{},org);}
async function listUnitSimulations(id,org){await getUnitById(id,org);return d.find('territorial_simulations',{...d.org(org),unit_id:d.id(id)},{created_at:-1,simulation_id:-1},50);}
async function getUnitGap(unitId,gapId,org){await getUnitById(unitId,org);return d.required(await d.one('territorial_gaps',{...d.org(org),unit_id:d.id(unitId),gap_id:d.id(gapId)}));}
module.exports={listUnits,getUnitById,createUnit,updateUnit,deleteUnit,listFacilities,createFacility,listDimensionScores,upsertDimensionScore,getUnitIndex,recomputeUnitIndex,listUnitGaps,detectUnitGaps,listGlobalGaps,simulateUnit,listUnitSimulations,getUnitGap};
