// Default is a dry plan. Only the already confirmed Atlas test fingerprint may apply.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {INDEXES}=require('../infrastructure/mongoIndexRegistry');
const indexes=['analytics_jobs','operational_events'].flatMap(collection=>INDEXES[collection].filter(i=>i.options.name?.startsWith('bco_')).map(i=>({collection,...i})));
async function main(){
 if(!process.argv.includes('--apply'))return console.log(JSON.stringify({mode:'plan',migration:'core.phase2.1',destructive:false,new_collections:[],indexes}));
 assert(process.argv.includes('--test-environment'),'This command requires the confirmed test environment');
 const mongo=require('../infrastructure/platformMongo'),root=path.resolve(__dirname,'../..');
 try{const state=JSON.parse(fs.readFileSync(path.join(root,'.vercel/backstage-staging-private.json'),'utf8')),db=await mongo.getMongoDatabase();const fingerprint=crypto.createHash('sha256').update(`${process.env.MONGODB_URI}\n${db.databaseName}`).digest('hex');assert.equal(fingerprint,state.target_fingerprint,'Unexpected Atlas target');
  const applied=[];for(const spec of indexes){await db.collection(spec.collection).createIndex(spec.key,spec.options);const actual=(await db.collection(spec.collection).listIndexes().toArray()).find(i=>i.name===spec.options.name);assert(actual);assert.deepEqual(actual.key,spec.key);assert.deepEqual(actual.partialFilterExpression,spec.options.partialFilterExpression);if('expireAfterSeconds'in spec.options)assert.equal(actual.expireAfterSeconds,spec.options.expireAfterSeconds);applied.push({collection:spec.collection,name:actual.name});}
  await db.collection('soi_schema_versions').updateOne({_id:'core.phase2'},{$set:{version:1,applied_at:new Date(),indexes:applied}},{upsert:true});
  const result={mode:'applied',target:'confirmed_atlas_test',target_fingerprint:fingerprint,migration:'core.phase2.1',indexes:applied,destructive:false,existing_schema_version_preserved:2};fs.writeFileSync(path.join(root,'docs/evidence/phase2-indexes.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await mongo.closeMongoConnection();}
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({failed:true,code:error.code||error.name}));process.exitCode=1;});
module.exports={indexes};
