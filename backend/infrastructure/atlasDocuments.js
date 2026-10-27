const mongo = require('./platformMongo');
const ApiError = require('../utils/ApiError');
const clean = mongo.cleanDocument;
const org = value => { const n=Number(value); if(!Number.isSafeInteger(n)||n<=0) throw new ApiError(401,'Se requiere una organización activa.'); return {organization_id:n}; };
const id = value => { const n=Number(value); if(!Number.isSafeInteger(n)||n<=0) throw new ApiError(400,'Identificador inválido.'); return n; };
const collection = async name => (await mongo.getMongoDatabase()).collection(name);
async function find(name,filter={},sort={},limit=5000) { return (await (await collection(name)).find(filter).sort(sort).limit(Math.min(Math.max(Number(limit)||100,1),5000)).toArray()).map(clean); }
async function one(name,filter,sort={}) { return clean(await (await collection(name)).findOne(filter,{sort})); }
async function insert(name,key,data) { const now=new Date(); const row={...data,[key]:await mongo.nextId(name),created_at:now,updated_at:now}; await (await collection(name)).insertOne(row);return clean(row); }
async function update(name,filter,set,extra={}) { return clean(await (await collection(name)).findOneAndUpdate(filter,{$set:{...set,updated_at:new Date()},...extra},{returnDocument:'after',includeResultMetadata:false})); }
async function remove(name,filter) { return clean(await (await collection(name)).findOneAndDelete(filter,{includeResultMetadata:false})); }
const required = row => { if(!row) throw new ApiError(404,'Registro no encontrado en la organización activa.'); return row; };
const pick=(input,fields)=>Object.fromEntries(fields.split(' ').filter(k=>input[k]!==undefined).map(k=>[k,input[k]]));
module.exports={...mongo,org,id,collection,find,one,insert,update,remove,required,pick};
