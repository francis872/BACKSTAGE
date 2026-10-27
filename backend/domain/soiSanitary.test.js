const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/soiMongoMemoryFixture');
const {createSanitaryService,CAPABILITIES}=require('../services/soiSanitary.service');
const context={organizationId:7,userId:1,role:'admin'};
function setup(){const memory=fixture({soi_configuration:[{organization_id:7,capabilities:[...CAPABILITIES,'assets','operations']},{organization_id:8,capabilities:CAPABILITIES}],soi_assets:[{organization_id:7,location_id:1,name:'Isolated asset',geometry:{type:'Point',coordinates:[0,0]}},{organization_id:8,location_id:9,name:'Other tenant'}],identity_memberships:[{organization_id:7,user_id:1},{organization_id:8,user_id:2}],soi_vehicles:[{organization_id:7,vehicle_id:3}],soi_route_plans:[{organization_id:7,route_plan_id:8,result:{routes:[{distanceM:1000}]}}]});
 const infra={getMongoDatabase:async()=>memory.options.database,withMongoTransaction:memory.options.transaction,nextId:memory.options.nextId};return{service:createSanitaryService(infra),memory,infra};}
const at='2026-01-15T12:00:00Z';
async function waste(service){const category=await service.create(context,'waste-categories',{name:'Isolated category',code:'TEST'});const facility=await service.create(context,'facilities',{name:'Isolated facility',facility_type:'treatment',asset_id:1,capacity_kg_per_day:1000});return{category,facility};}
test('sanitary waste ledger links tenants, preserves units and completes with durable events',async()=>{
 const{service,memory}=setup();const{category,facility}=await waste(service);
 const container=await service.create(context,'containers',{name:'Isolated container',asset_id:1,category_id:category.record_id,capacity_kg:500,fill_percent:90,observed_at:at,source:'manual isolated test'});
 const input={event_id:'TEST-COLLECT',name:'Isolated movement',movement_type:'collection',category_id:category.record_id,origin_asset_id:1,destination_id:facility.record_id,quantity:.25,unit:'t',occurred_at:at,data_kind:'measured',source:'test fixture, no actual weighbridge',container_id:container.record_id};
 const record=await service.create(context,'waste-movements',input);assert.equal(record.quantity_kg,250);
 assert.equal((await service.create(context,'waste-movements',input)).record_id,record.record_id);
 await assert.rejects(service.create(context,'waste-movements',{...input,quantity:1}),{statusCode:409});
 const inProgress=await service.update(context,'waste-movements',record.record_id,{revision:1,status:'in_progress'});
 await service.update(context,'waste-movements',record.record_id,{revision:inProgress.revision,status:'completed'});
 assert.equal(new Date((await service.get(context,'containers',container.record_id)).last_collection_at).toISOString(),at.replace('Z','.000Z'));
 await assert.rejects(service.update(context,'waste-movements',record.record_id,{revision:1,status:'cancelled'}),{statusCode:409});
 await assert.rejects(service.create(context,'facilities',{name:'Denied',facility_type:'landfill',asset_id:9,capacity_kg_per_day:10}),{statusCode:404});
 assert.equal((await service.list({...context,organizationId:8},'waste-movements')).data.length,0);
 assert.ok(memory.data().soi_domain_events.length>=5);
 const history=await service.history(context,'waste-movements',record.record_id);assert.equal(history.history.length,2);assert.equal(history.history.at(-1).snapshot.status,'planned');
});
test('sanitary data source, permissions and immutable ledgers cannot be promoted by the client',async()=>{
 const{service}=setup();await assert.rejects(service.create({...context,role:'viewer'},'waste-categories',{name:'Denied',code:'X'}),{statusCode:403});
 await assert.rejects(service.create(context,'waste-categories',{name:'Denied',code:'X',organization_id:8}),{statusCode:400});
 await assert.rejects(service.create(context,'reports',{}),{statusCode:405});
 await assert.rejects(service.list(context,'__proto__'),{statusCode:404});
 await assert.rejects(service.list(context,'sensors',{limit:'1;DROP'}),{statusCode:400});
});
async function monitoring(service){const station=await service.create(context,'stations',{name:'Isolated station',asset_id:1,source:'isolated source'});const sensor=await service.create(context,'sensors',{name:'Isolated sensor',station_id:station.record_id,variable:'PM2.5',unit:'ug/m3',instrument:'test instrument',method:'test method',source:'isolated source',expected_interval_s:60});const rule=await service.create(context,'alert-rules',{name:'Declared test threshold',sensor_id:sensor.record_id,operator:'gt',threshold:20});return{sensor,rule};}
test('measurement ingestion deduplicates alerts, respects data kind, timestamps and unit',async()=>{
 const{service}=setup();const{sensor}=await monitoring(service);
 const reading={event_id:'READ-1',sensor_id:sensor.record_id,value:30,unit:'ug/m3',observed_at:at,data_kind:'measured',source:'isolated test source',method:'isolated test'};
 await service.create(context,'measurements',reading);await service.create(context,'measurements',reading);
 assert.equal((await service.list(context,'measurements')).data.length,1);
 assert.equal((await service.list(context,'alerts')).data.length,1);
 await service.create(context,'measurements',{...reading,event_id:'READ-2',observed_at:'2026-01-15T12:01:00Z',value:40});
 assert.equal((await service.list(context,'alerts')).data[0].occurrences,2);
 await service.create(context,'measurements',{...reading,event_id:'OLD',observed_at:'2026-01-15T11:00:00Z',value:5});
 assert.equal((await service.list(context,'alerts')).data[0].status,'open');
 await service.create(context,'measurements',{...reading,event_id:'CLEAR',observed_at:'2026-01-15T12:02:00Z',value:5});
 assert.equal((await service.list(context,'alerts')).data[0].status,'resolved');
 await service.create(context,'measurements',{...reading,event_id:'SIM',observed_at:'2026-01-15T12:03:00Z',value:999,data_kind:'simulated'});
 assert.equal((await service.list(context,'alerts')).data.length,1);
 await assert.rejects(service.create(context,'measurements',{...reading,event_id:'BAD',unit:'mg/L'}),{statusCode:400});
 await assert.rejects(service.update(context,'measurements',1,{revision:1,value:0}),{statusCode:409});
});
test('carbon calculation freezes factor version, converts compatible units and rejects double counting',async()=>{
 const{service}=setup();const source=await service.create(context,'emission-sources',{name:'Isolated source',source_type:'treatment',scope:'1',boundary:'isolated calculation boundary'});
 const factor=await service.create(context,'emission-factors',{name:'Explicit test factor',version:'test-only-v1',source:'synthetic isolated fixture, not official factor',source_url:'https://example.invalid/test-factor',methodology:'test-only kgCO2e per kg',activity_unit:'kg',kgco2e_per_unit:2,valid_from:'2026-01-01T00:00:00Z',valid_until:'2026-12-31T23:59:59Z'});
 const input={event_id:'C-1',activity_reference:'ACTIVITY-1',source_id:source.record_id,factor_id:factor.record_id,occurred_at:at,quantity:.5,activity_unit:'t',data_kind:'simulated',source:'isolated scenario'};
 const entry=await service.create(context,'carbon-entries',input);assert.equal(entry.kgco2e,1000);assert.equal(entry.factor_snapshot.version,'test-only-v1');assert.equal(entry.calculation.result_kind,'simulated');
 assert.equal((await service.create(context,'carbon-entries',input)).record_id,entry.record_id);
 await assert.rejects(service.create(context,'carbon-entries',{...input,event_id:'C-2'}),{statusCode:409});
 await assert.rejects(service.create(context,'carbon-entries',{...input,event_id:'C-3',activity_reference:'B',activity_unit:'kWh'}),{statusCode:400});
 await assert.rejects(service.create(context,'carbon-entries',{...input,event_id:'C-4',activity_reference:'C',occurred_at:'2027-01-01T00:00:00Z'}),{statusCode:400});
 await assert.rejects(service.update(context,'emission-factors',factor.record_id,{revision:1,kgco2e_per_unit:0}),{statusCode:409});
 const voided=await service.voidRecord(context,'carbon-entries',entry.record_id,{revision:1,reason:'Isolated correction test'});assert.ok(voided.voided_at);assert.equal(voided.kgco2e,1000);
 const corrected=await service.create(context,'carbon-entries',{...input,event_id:'C-CORRECTED',activity_reference:'ACTIVITY-1-R2',correction_of_id:entry.record_id,quantity:.25});assert.equal(corrected.kgco2e,500);assert.equal(corrected.business_activity_reference,'ACTIVITY-1');
 await assert.rejects(service.create(context,'carbon-entries',{...input,event_id:'C-DOUBLE',activity_reference:'ACTIVITY-1-R3',correction_of_id:entry.record_id}),{statusCode:409});
});

test('voided and invalid readings cannot remain current, and simulations cannot suppress measured alerts',async()=>{
 const{service}=setup();const{sensor}=await monitoring(service);
 const input={event_id:'VALID',sensor_id:sensor.record_id,value:30,unit:'ug/m3',observed_at:at,data_kind:'measured',source:'isolated fixture',method:'test'};
 const valid=await service.create(context,'measurements',input);
 await service.create(context,'measurements',{...input,event_id:'SIM-NEW',observed_at:'2026-01-15T12:10:00Z',data_kind:'simulated',value:999});
 const measured=await service.create(context,'measurements',{...input,event_id:'MEASURED-NEW',observed_at:'2026-01-15T12:05:00Z',value:40});
 assert.equal((await service.list(context,'alerts')).data[0].measurement_id,measured.record_id);
 await service.create(context,'measurements',{...input,event_id:'INVALID',observed_at:'2026-01-15T12:20:00Z',quality:'invalid',value:10000});
 assert.equal((await service.get(context,'sensors',sensor.record_id)).latest_value,999);
 await service.voidRecord(context,'measurements',measured.record_id,{revision:1,reason:'Invalidated test observation'});
 const current=await service.get(context,'sensors',sensor.record_id);assert.equal(current.latest_by_kind.measured.measurement_id,valid.record_id);
 const alerts=(await service.list(context,'alerts')).data;assert.equal(alerts.filter(row=>row.status==='open').length,1);assert.equal(alerts.find(row=>row.status==='open').measurement_id,valid.record_id);
 assert.equal((await service.history(context,'measurements',measured.record_id)).history.length,1);
});
test('sanitation work and actual route compliance retain their tenant-owned references',async()=>{
 const{service}=setup();const network=await service.create(context,'networks',{name:'Isolated sewer',asset_id:1,network_type:'sewer'});
 const inspection=await service.create(context,'inspections',{name:'Isolated inspection',network_id:network.record_id,occurred_at:at,inspection_type:'inspection',severity:'low',findings:'Test finding'});assert.equal(inspection.network_id,network.record_id);
 const execution=await service.create(context,'route-executions',{name:'Isolated execution',route_plan_id:8,vehicle_id:3,started_at:at,distance_m:1100,planned_asset_ids:[1],served_asset_ids:[],data_kind:'simulated',source:'isolated fixture'});
 assert.equal(execution.compliance_percent,0);assert.equal(execution.distance_difference_percent,10);
 await assert.rejects(service.create(context,'route-executions',{name:'Denied',route_plan_id:8,vehicle_id:3,started_at:at,planned_asset_ids:[],served_asset_ids:[1],data_kind:'simulated',source:'isolated fixture'}),{statusCode:400});
});
