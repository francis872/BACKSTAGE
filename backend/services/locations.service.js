const d=require('../infrastructure/atlasDocuments');
const ApiError=require('../utils/ApiError');
const {geometry:validateGeometry}=require('../domain/geometry');
const {haversineDistance}=require('../spatial/core');
function record(input) {
 if(input?.metadata && Object.hasOwn(input.metadata,'horizontal_property'))throw new ApiError(400,'Usa la capa Propiedad Horizontal para registrar o modificar su jerarquía.');
 const data=d.pick(input,'external_id name type address city region country latitude longitude capacity metadata geometry');
 if(typeof data.name!=='string'||!data.name.trim()||data.name.length>200||typeof data.type!=='string'||!data.type.trim()||data.type.length>100)throw new ApiError(400,'name y type son requeridos.');
 if(data.latitude!=null&&data.longitude!=null){data.latitude=Number(data.latitude);data.longitude=Number(data.longitude);data.geometry ||= {type:'Point',coordinates:[data.longitude,data.latitude]};}
 if(data.geometry)data.geometry=validateGeometry(data.geometry);
 if(JSON.stringify(data.metadata||{}).length>100000)throw new ApiError(413,'La metadata del activo excede el límite permitido.');
 return data;
}
const listLocations=({organizationId,limit=100}={})=>d.find('locations',d.org(organizationId),{location_id:1},Math.min(Number(limit)||100,500));
const getLocationById=async(id,org)=>d.required(await d.one('locations',{...d.org(org),location_id:d.id(id)}));
async function createLocation(data,org,{database,session,nextId=d.nextId,actor}={}) {
 const values={...record(data),...d.org(org)};
 if(!database){
  if(!actor)return d.insert('locations','location_id',values);
  return d.withMongoTransaction((db,tx)=>createLocation(data,org,{database:db,session:tx,actor}));
 }
 const now=new Date();const row={...values,location_id:await nextId('locations',session),created_at:now,updated_at:now};
 await database.collection('locations').insertOne(row,{session});
 if(actor)await require('./platformAudit.service').appendPlatformAudit({nextId,cleanDocument:d.cleanDocument},database,session,{organizationId:org,userId:actor},'asset.created','locations',row.location_id);
 return d.cleanDocument(row);
}
const updateLocation=async(id,data,org,actor)=>{
 if((await getLocationById(id,org)).metadata?.horizontal_property)throw new ApiError(409,'Edita este activo desde la capa Propiedad Horizontal.');
 return actor?d.withMongoTransaction(async(db,session)=>{
 const filter={...d.org(org),location_id:d.id(id)};const values=record(data);
 const row=d.required(await db.collection('locations').findOneAndUpdate(filter,{$set:{...values,updated_at:new Date()}},{session,returnDocument:'after',includeResultMetadata:false}));
 await require('./platformAudit.service').appendPlatformAudit(d,db,session,{organizationId:org,userId:actor},'asset.updated','locations',id);
 return d.cleanDocument(row);
}):d.required(await d.update('locations',{...d.org(org),location_id:d.id(id)},record(data)));
};
const deleteLocation=async(id,org,actor)=>{
 if((await getLocationById(id,org)).metadata?.horizontal_property)throw new ApiError(409,'Archiva este activo desde la capa Propiedad Horizontal para conservar su evidencia.');
 return actor?d.withMongoTransaction(async(db,session)=>{
 const row=d.required(await db.collection('locations').findOneAndDelete({...d.org(org),location_id:d.id(id)},{session,includeResultMetadata:false}));
 await require('./platformAudit.service').appendPlatformAudit(d,db,session,{organizationId:org,userId:actor},'asset.deleted','locations',id);
 return d.cleanDocument(row);
}):d.required(await d.remove('locations',{...d.org(org),location_id:d.id(id)}));
};
async function findNearby({lat,lng,radius=2000,organizationId}) {
 if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new ApiError(400,'Latitud y longitud válidas son requeridas.');
 const rows=await d.find('locations',{...d.org(organizationId),latitude:{$ne:null},longitude:{$ne:null}});
 const result=await Promise.all(rows.map(async row=>({...row,risk_score:(await d.one('risk_assessments',{...d.org(organizationId),location_id:row.location_id},{assessed_at:-1,risk_id:-1}))?.score??null,distance_m:haversineDistance({lat,lng},{lat:Number(row.latitude),lng:Number(row.longitude)})})));
 return result.filter(row=>row.distance_m<=radius).sort((a,b)=>a.distance_m-b.distance_m).slice(0,100);
}
module.exports={listLocations,getLocationById,createLocation,updateLocation,deleteLocation,findNearby};
