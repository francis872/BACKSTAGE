const d=require('../infrastructure/atlasDocuments');
const ApiError=require('../utils/ApiError');
function record(data){if(!data.name||!data.city)throw new ApiError(400,'name y city son requeridos.');return {country:'Colombia',...d.pick(data,'name city region country population_density pedestrian_traffic_score vehicle_traffic_score purchasing_power_index')};}
const listZones=org=>d.find('retail_zones',d.org(org),{retail_zone_id:1});
const getZoneById=async(id,org)=>d.required(await d.one('retail_zones',{...d.org(org),retail_zone_id:d.id(id)}));
const createZone=(data,org)=>d.insert('retail_zones','retail_zone_id',{...record(data),...d.org(org)});
const updateZone=async(id,data,org)=>d.required(await d.update('retail_zones',{...d.org(org),retail_zone_id:d.id(id)},record(data)));
const deleteZone=async(id,org)=>d.required(await d.remove('retail_zones',{...d.org(org),retail_zone_id:d.id(id)}));
module.exports={listZones,getZoneById,createZone,updateZone,deleteZone};
