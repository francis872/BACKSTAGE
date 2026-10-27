// Logical snapshot and isolated restore of ONLY this owned automation database.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {MongoClient,BSON}=require('mongodb');
const {encrypt,decrypt,restoreIndex}=require('./atlas-backup');
const root=path.resolve(__dirname,'../..'),digest=value=>crypto.createHash('sha256').update(value).digest('hex');
async function run(){
 const {state,database,guard}=require('../../scripts/automation-staging');guard();
 const {mongo,db:source}=await database(),report={started_at:new Date().toISOString(),run_id:state.run_id,scope:'owned_automation_staging_database_only',source_writes:0,production_changes:false,managed_backup_or_pitr:false,scheduled_production_backup:false,checks:[]};
 const directory=path.join(root,'.vercel',`automation-backup-${Date.now()}`),keyDirectory=path.join(root,'.vercel/automation-backup-keys');fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(keyDirectory,{recursive:true});
 let client,session,restoreDb;
 try{
  assert.notEqual(source.databaseName,state.original_database);assert.equal((await source.collection('soi_schema_versions').findOne({_id:'automation-ownership'})).run_id,state.run_id);
  client=new MongoClient(process.env.MONGODB_URI,{...require('../infrastructure/mongoDns').configureMongoDns(),appName:'backstage-owned-staging-restore-verification',maxPoolSize:3,serverSelectionTimeoutMS:15000});await client.connect();
  const sourceDb=client.db(state.database),metadata=(await sourceDb.listCollections({},{nameOnly:false}).toArray()).sort((a,b)=>a.name.localeCompare(b.name));
  const collections=[];session=client.startSession({snapshot:true});
  for(const meta of metadata){assert.equal(meta.type,'collection');assert(!meta.options?.timeseries&&!meta.options?.encryptedFields&&!meta.options?.capped);
   const chunks=[],hash=crypto.createHash('sha256');let bytes=0;
   for await(const row of sourceDb.collection(meta.name).find({},{session,promoteValues:false,promoteLongs:false,bsonRegExp:true}).sort({_id:1})){const raw=BSON.serialize(row);bytes+=raw.length;assert(bytes<64*1024*1024);hash.update(raw);chunks.push(raw);}
   collections.push({name:meta.name,options:meta.options||{},indexes:await sourceDb.collection(meta.name).listIndexes().toArray(),documents:chunks,sha256:hash.digest('hex')});
  }
  assert(session.snapshotTime);report.snapshot_at_cluster_time=BSON.EJSON.serialize(session.snapshotTime,{relaxed:false});await session.endSession();session=null;
  const plaintext=BSON.serialize({format:'backstage-owned-automation-backup-1',run_id:state.run_id,database:state.database,collections}),key=crypto.randomBytes(32),encrypted=encrypt(plaintext,key),file=path.join(directory,'data.bson.aes256gcm'),keyFile=path.join(keyDirectory,`${state.run_id}-${Date.now()}.key`);
  fs.writeFileSync(file,encrypted,{mode:0o600,flag:'wx'});fs.writeFileSync(keyFile,key,{mode:0o600,flag:'wx'});const saved=decrypt(fs.readFileSync(file),fs.readFileSync(keyFile));assert.equal(digest(saved),digest(plaintext));const damaged=Buffer.from(encrypted);damaged[damaged.length-1]^=1;assert.throws(()=>decrypt(damaged,key));
  report.backup={encrypted:'AES-256-GCM',sha256:digest(encrypted),readback_verified:true,tamper_rejected:true,key_separate:true,external_custody_verified:false};
  const decoded=BSON.deserialize(saved,{promoteBuffers:true}),name=`bs_ar_${state.run_id.slice(-8)}_${crypto.randomBytes(4).toString('hex')}`;
  assert.notEqual(name,state.database);assert.notEqual(name,state.original_database);assert(!(await client.db('admin').admin().listDatabases({nameOnly:true,authorizedDatabases:true})).databases.some(d=>d.name===name));
  fs.writeFileSync(path.join(directory,'restore-ownership.json'),JSON.stringify({name,run_id:state.run_id,source:state.database,backup_sha256:report.backup.sha256}),{mode:0o600});
  restoreDb=client.db(name);const started=performance.now();let documents=0,ttl=0,indexes=0;
  for(const item of decoded.collections){await restoreDb.createCollection(item.name,item.options);
   if(item.documents.length)await restoreDb.collection(item.name).insertMany(item.documents.map(raw=>BSON.deserialize(raw,{promoteValues:false,promoteLongs:false,bsonRegExp:true})),{ordered:true});
   for(const index of item.indexes){if(index.name==='_id_')continue;if('expireAfterSeconds'in index)ttl++;const spec=restoreIndex(index);await restoreDb.collection(item.name).createIndex(spec.key,spec.options);indexes++;}
   const hash=crypto.createHash('sha256');let count=0;for await(const row of restoreDb.collection(item.name).find({},{promoteValues:false,promoteLongs:false,bsonRegExp:true}).sort({_id:1})){hash.update(BSON.serialize(row));count++;}
   assert.equal(count,item.documents.length);assert.equal(hash.digest('hex'),item.sha256);documents+=count;
   const actual=await restoreDb.collection(item.name).listIndexes().toArray();assert.equal(actual.length,item.indexes.length);
   for(const original of item.indexes){const found=actual.find(i=>i.name===original.name);assert(found);assert.deepEqual(restoreIndex(found),restoreIndex(original));}
  }
  report.restore={passed:true,collections:decoded.collections.length,documents,non_default_indexes:indexes,ttl_suspended_during_verification:ttl,restore_and_validation_ms:Math.round(performance.now()-started),source_overwritten:false};
  const owned=JSON.parse(fs.readFileSync(path.join(directory,'restore-ownership.json'),'utf8'));assert.equal(owned.name,restoreDb.databaseName);assert(restoreDb.databaseName.startsWith(`bs_ar_${state.run_id.slice(-8)}_`));assert.equal((await restoreDb.collection('soi_schema_versions').findOne({_id:'automation-ownership'})).run_id,state.run_id);await restoreDb.dropDatabase();report.restore.owned_temporary_database_removed=true;
  report.rpo={measured_seconds:null,note:'No production backup schedule configured; snapshot time is recorded, not an achieved RPO.'};report.rto={measured_restore_validation_ms:report.restore.restore_and_validation_ms,scope:'small_owned_staging_dataset_not_full_production_recovery'};
  report.status='passed';
 }catch(error){report.status='failed';report.failure={name:error.name,code:error.code||null};if(restoreDb)report.isolated_restore_needs_review=true;process.exitCode=1;}
 finally{await session?.endSession();await client?.close();await mongo.closeMongoConnection();report.completed_at=new Date().toISOString();fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2),{mode:0o600});const evidence=path.join(root,'docs/evidence/automation-staging-restore.json');if(fs.existsSync(evidence))fs.copyFileSync(evidence,evidence.replace('.json',`-${Date.now()}.json`));fs.writeFileSync(evidence,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
if(require.main===module){if(process.argv.includes('--apply')&&process.argv.includes('--test-environment'))run();else console.log(JSON.stringify({mode:'plan_only',source:'owned_automation_staging_only',source_writes:0,restore:'new_owned_database_removed_after_verification',production_changes:false}));}
module.exports={run};
