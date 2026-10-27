const test=require('node:test');
const assert=require('node:assert/strict');
process.env.JWT_SECRET='isolated-platform-recovery-test-key';
const {fixture}=require('./helpers/soiMongoMemoryFixture');
const {createAssetsService}=require('../services/assets.service');
const {createComparisonService}=require('../services/comparisons.service');
const {createRequireOrganizationContext}=require('../middleware/organizationContext');
const {resolveMembership}=require('../services/organization.service');
const {createToken}=require('../auth');
const express=require('express');
const context={organizationId:7,userId:1,role:'admin'};
function setup(){const f=fixture({locations:[{organization_id:7,location_id:1,name:'General',type:'equipment',longitude:0,latitude:0},{organization_id:8,location_id:2,name:'Private'}],soi_assets:[{organization_id:7,location_id:1,name:'Sanitary',geometry:{type:'Point',coordinates:[1,2]}}],soi_configuration:[{organization_id:7,capabilities:['assets']}]});const infra={getMongoDatabase:async()=>f.options.database,withMongoTransaction:f.options.transaction,nextId:f.options.nextId,cleanDocument:row=>row&&Object.fromEntries(Object.entries(row).filter(([key])=>key!=='_id'))};return {f,infra};}
test('platform assets preserve distinct identities, scope, coordinates and cross-source pagination without copying data',async()=>{
 const {f,infra}=setup(),service=createAssetsService(infra),before=structuredClone(f.data());
 const list=await service.list(7);assert.deepEqual(list.data.map(a=>a.asset_id),['platform:1','soi:1']);assert.equal(list.data[0].longitude,0);assert.equal(list.data[1].longitude,1);assert.equal(list.data[1].location_id,null);
 assert.deepEqual((await service.list(7,{limit:1,offset:1})).data.map(a=>a.asset_id),['soi:1']);assert.equal((await service.list(7,{limit:1})).pagination.next,1);
 await assert.rejects(service.get(8,'platform:1'),{statusCode:404});await assert.rejects(service.get(7,'other:1'),{statusCode:400});await assert.rejects(service.list(7,{limit:501}),{statusCode:400});assert.deepEqual(f.data(),before);
});
test('platform inventory respects disabled module capability and does not claim verification',async()=>{
 const {f,infra}=setup();f.data().soi_configuration[0].capabilities=[];
 const rows=await createAssetsService(infra).list(7);assert.deepEqual(rows.data.map(a=>a.origin),['platform']);assert.equal(rows.data[0].provenance.validated,false);
});
test('universal comparison recalculates, preserves snapshots and blocks tenant spoofing and incomplete evidence',async()=>{
 const {infra}=setup(),service=createComparisonService(infra);
 const input={project_name:'Neutral case',organization_id:99,result:{forged:true},candidates:[{id:'a',name:'A',lat:0,lng:0},{id:'b',name:'B',lat:1,lng:1}],criteria:[{id:'cost',name:'Cost',definition:'Declared cost',unit:'unit',source:'fixture',weight:1,direction:'cost',normalization:'minmax',missing:'block'}],observations:{a:{cost:{value:1}},b:{cost:{value:2}}}};
 const row=await service.save(context,input);assert.equal(row.organization_id,7);assert.equal(row.result.ranking[0].id,'a');assert.equal(row.result.forged,undefined);
 input.observations.a.cost.data_type='REAL_VERIFIED';
 const claimed=await service.save(context,input);assert.equal(claimed.input.observations.a.cost.data_type,'UNKNOWN');assert.equal(claimed.result.ranking[0].breakdown[0].data_type,'UNKNOWN');
 assert.equal((await service.get(context,row.comparison_id)).project_name,'Neutral case');await assert.rejects(service.get({...context,organizationId:8},row.comparison_id),{statusCode:404});
 await assert.rejects(service.save({...context,role:'viewer'},input),{statusCode:403});await assert.rejects(service.save(context,{...input,observations:{}}),{statusCode:400});
});
test('platform HTTP uses current membership and role instead of claims for generic asset access',async t=>{
 const {infra}=setup();let memberships=[{organization_id:7,role:'viewer'}];
 const app=express();app.use(express.json());app.use('/assets',require('../routes/assets.routes').createAssetsRouter(createAssetsService(infra),{getUserMemberships:async()=>memberships,resolveMembership}));app.use((err,req,res,next)=>res.status(err.statusCode||500).json({error:err.message}));
 const server=app.listen(0,'127.0.0.1');t.after(()=>server.close());await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const token=createToken({user_id:1,organization_id:7,role:'admin',memberships:[{organization_id:7,role:'admin'}]});const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/assets',{headers})).status,200);assert.equal((await fetch(base+'/assets',{method:'POST',headers,body:'{}'})).status,403);
 memberships=[];assert.equal((await fetch(base+'/assets',{headers})).status,403);
});

test('general asset registration flows through the original repository, map projection and comparison snapshot',async t=>{
 const {f,infra}=setup();
 const runtime=require('../infrastructure/platformMongo'),originals={...runtime};
 Object.assign(runtime,infra);t.after(()=>Object.assign(runtime,originals));
 const memberships={getUserMemberships:async()=>[{organization_id:7,role:'analyst'}],resolveMembership};
 const app=express();app.use(express.json());
 app.use('/assets',require('../routes/assets.routes').createAssetsRouter(createAssetsService(infra),memberships));
 app.use('/comparisons',require('../routes/comparisons.routes').createComparisonsRouter(createComparisonService(infra),memberships));
 app.use((err,req,res,next)=>res.status(err.statusCode||500).json({error:err.message}));
 const server=app.listen(0,'127.0.0.1');t.after(()=>server.close());await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`,headers={Authorization:`Bearer ${createToken({user_id:1,organization_id:7,role:'analyst'})}`,'Content-Type':'application/json'};
 const post=async(url,body)=>{const response=await fetch(base+url,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(response.status,201);return (await response.json()).data;};
 const originalSoi=structuredClone(f.data().soi_assets);
 const asset=await post('/assets',{name:'Fixture generator',type:'equipment',longitude:0,latitude:0,organization_id:8,metadata:{provenance:{data_type:'REAL_VERIFIED',validated:true}}});
 assert.equal(asset.organization_id,7);assert.equal(asset.provenance.data_type,'ORGANIZATION_PROVIDED');assert.equal(asset.provenance.validated,false);
 assert.equal(f.data().locations.filter(row=>row.name==='Fixture generator').length,1);assert.deepEqual(f.data().soi_assets,originalSoi);
 const list=await (await fetch(base+'/assets',{headers})).json();assert(list.data.some(row=>row.asset_id===asset.asset_id));
 const {assetsToGeoJSON}=await import('../../frontend/src/lib/assetGeometry.mjs');
 const feature=assetsToGeoJSON(list.data).features.find(row=>row.id===asset.asset_id);assert.deepEqual(feature.geometry.coordinates,[0,0]);
 const snapshot=await post('/comparisons',{project_name:'Fixture equipment selection',candidates:[{id:asset.asset_id,name:asset.name,lng:0,lat:0},{id:'soi:1',name:'Existing sanitary fixture',lng:1,lat:2}],criteria:[{id:'cost',name:'Cost',definition:'Fixture quoted cost',unit:'test-unit',source:'isolated fixture',weight:1,direction:'cost',normalization:'minmax',missing:'block'}],observations:{[asset.asset_id]:{cost:{value:1}},'soi:1':{cost:{value:2}}}});
 const restored=(await (await fetch(base+'/comparisons/'+snapshot.comparison_id,{headers})).json()).data;
 assert.equal(restored.result.ranking[0].id,asset.asset_id);assert.deepEqual(restored.input,snapshot.input);
 assert.equal((await fetch(base+'/assets/'+asset.asset_id,{headers:{...headers,'X-Organization-Id':'8'}})).status,403);
});

test('original writer routes cannot restore a stale admin token after current membership downgrades',async t=>{
 const organizationService=require('../services/organization.service');
 const original=organizationService.getUserMemberships;t.after(()=>{organizationService.getUserMemberships=original;});
 let memberships=[{organization_id:7,role:'viewer'}];organizationService.getUserMemberships=async()=>memberships;
 const app=express();app.use(express.json());
 for(const name of ['integrations','retailZones','scoring'])app.use('/'+name,require('../routes/'+name+'.routes'));
 app.use((err,req,res,next)=>res.status(err.statusCode||500).json({error:err.message}));
 const server=app.listen(0,'127.0.0.1');t.after(()=>server.close());await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`,headers={Authorization:`Bearer ${createToken({user_id:1,organization_id:7,role:'admin'})}`,'Content-Type':'application/json'};
 for(const url of ['/integrations/sources','/integrations/events','/integrations/events/1/complete','/retailZones','/scoring/evaluate'])assert.equal((await fetch(base+url,{method:'POST',headers,body:'{}'})).status,403,url);
 assert.equal((await fetch(base+'/retailZones/1',{method:'DELETE',headers})).status,403);
 memberships=[];assert.equal((await fetch(base+'/scoring/latest/1',{headers})).status,403);
});
