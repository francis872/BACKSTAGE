const test=require('node:test'), assert=require('node:assert/strict');
const { fixture }=require('./helpers/soiMongoMemoryFixture');
const { createSoiService }=require('../services/soi.service');
function setup(){const f=fixture({soi_configuration:[{organization_id:7,sector:'general',capabilities:['assets','operations','fleet','incidents','imports','crews','service_orders']}],identity_memberships:[{organization_id:7,user_id:1},{organization_id:8,user_id:2}]}); const infra={getMongoDatabase:async()=>f.options.database,withMongoTransaction:f.options.transaction,nextId:f.options.nextId,cleanDocument:row=>row&&Object.fromEntries(Object.entries(row).filter(([key])=>key!=='_id'))};return{f,service:createSoiService(infra),context:{organizationId:7,userId:1,role:'admin'}};}
test('Mongo isolated: assets, crews, service orders and operations share tenant-owned references',async()=>{
 const {service,context}=setup();const asset=await service.create(context,'assets',{name:'Test-only asset',latitude:0,longitude:0});
 const crew=await service.create(context,'crews',{name:'Test-only crew',member_user_ids:[1]});
 await assert.rejects(service.create(context,'crews',{name:'Denied',member_user_ids:[2]}),{statusCode:404});
 const operation=await service.create(context,'operations',{name:'Test-only operation',operation_type:'maintenance',crew_id:crew.crew_id});
 await service.operationAssets(context,operation.operation_id,{asset_ids:[asset.location_id]});
 assert.deepEqual((await service.operationAssets(context,operation.operation_id)).asset_ids,[asset.location_id]);
 const order=await service.create(context,'service-orders',{name:'Test-only order',crew_id:crew.crew_id,operation_id:operation.operation_id,asset_ids:[asset.location_id]});
 for(const status of ['assigned','in_progress','completed'])assert.equal((await service.updateStatus(context,'service-orders',order.service_order_id,{status})).status,status);
 await assert.rejects(service.updateStatus(context,'service-orders',order.service_order_id,{status:'assigned'}),{statusCode:409});
 await assert.rejects(service.create({...context,organizationId:8},'service-orders',{name:'Denied',asset_ids:[asset.location_id]}),{statusCode:409});
 assert.equal((await service.summary(context)).inventory_assets,1);
});
test('Mongo isolated: imports are atomic, repeat-safe and do not promote source assertions',async()=>{
 const {service,context,f}=setup(); const upload={format:'csv',source:{name:'Isolated fixture'},content:'name,longitude,latitude,external_id\nOne,0,0,A\nTwo,1,1,B'};
 const preview=await service.preview(context,upload);assert.equal(preview.valid,true);await service.commit(context,{...upload,preview_hash:preview.preview_hash});
 assert.equal((await service.list(context,'assets')).length,2);assert.equal((await service.preview(context,upload)).valid,false);
 await assert.rejects(service.commit(context,{...upload,preview_hash:preview.preview_hash}),{statusCode:400});
 const row=(await service.list(context,'assets'))[0];assert.equal(row.metadata.provenance.data_type,'IMPORTED');assert.equal(row.metadata.provenance.validated,false);
 await assert.rejects(service.create({...context,role:'viewer'},'assets',{name:'Denied'}),{statusCode:403});
 const before=(f.data().soi_assets||[]).length;await assert.rejects(service.operationAssets(context,999,{asset_ids:[row.location_id]}),{statusCode:404});assert.equal((f.data().soi_assets||[]).length,before);
});
test('Mongo isolated: assigned order cannot remove its crew and asset ID is removable',async()=>{
 const {service,context}=setup();const asset=await service.create(context,'assets',{name:'Asset',latitude:0,longitude:0,external_id:'EXT'});
 assert.equal((await service.updateAsset(context,asset.location_id,{external_id:''})).external_id,undefined);
 const crew=await service.create(context,'crews',{name:'Crew',member_user_ids:[1]});const order=await service.create(context,'service-orders',{name:'Order',crew_id:crew.crew_id,status:'assigned'});
 await assert.rejects(service.updateStatus(context,'service-orders',order.service_order_id,{crew_id:null}),{statusCode:400});
});

test('Mongo sanitary incident workflow requires assignment, evidence and authorized closure',async()=>{
 const{service,context}=setup();const incident=await service.create(context,'incidents',{title:'Isolated sanitary incident'});
 await assert.rejects(service.updateStatus(context,'incidents',incident.incident_id,{status:'resolved'}),{statusCode:409});
 for(const state of ['triaged','assigned','in_progress','verified'])await service.updateStatus(context,'incidents',incident.incident_id,{workflow_state:state,reason:'Isolated verifiable action',...(state==='assigned'?{assigned_user_id:1}:{})});
 await assert.rejects(service.updateStatus({...context,role:'analyst'},'incidents',incident.incident_id,{workflow_state:'closed',reason:'Isolated review'}),{statusCode:403});
 const closed=await service.updateStatus(context,'incidents',incident.incident_id,{workflow_state:'closed',reason:'Isolated supervisor review'});assert.equal(closed.status,'resolved');assert.equal(closed.workflow_history.length,6);
 await assert.rejects(service.updateStatus(context,'incidents',incident.incident_id,{workflow_state:'triaged',reason:'Denied reopen'}),{statusCode:409});
});
