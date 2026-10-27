const test=require('node:test'),assert=require('node:assert/strict');
process.env.JWT_SECRET='sanitary-http-fixture-secret';
const{fixture}=require('./helpers/soiMongoMemoryFixture');
const{createSanitaryService,CAPABILITIES}=require('../services/soiSanitary.service');
const{createSanitaryAnalytics}=require('../services/soiSanitaryAnalytics.service');
const{createSanitaryIntegrations}=require('../services/soiSanitaryIntegrations.service');
const context={organizationId:7,userId:1,role:'admin'};
function setup(runner){const memory=fixture({soi_configuration:[{organization_id:7,capabilities:[...CAPABILITIES,'assets','fleet','operations']}],soi_assets:[{organization_id:7,location_id:1,name:'Depot',geometry:{type:'Point',coordinates:[0,0]}},{organization_id:7,location_id:2,name:'Point',geometry:{type:'Point',coordinates:[.001,0]}},{organization_id:8,location_id:3,geometry:{type:'Point',coordinates:[0,0]}},{organization_id:7,location_id:4,name:'Zone',geometry:{type:'Polygon',coordinates:[[[-.01,-.01],[.01,-.01],[.01,.01],[-.01,.01],[-.01,-.01]]]}}],soi_vehicles:[{organization_id:7,vehicle_id:3,name:'Isolated vehicle',status:'available',capacity:10,capacity_unit:'kg'}],soi_route_plans:[{organization_id:7,route_plan_id:5,name:'Isolated route',coordinates:[[0,0],[.001,0]],result:{routes:[{distanceM:1000}]}}]});
 const infra={getMongoDatabase:async()=>memory.options.database,withMongoTransaction:memory.options.transaction,nextId:memory.options.nextId};return{memory,infra,sanitary:createSanitaryService(infra),analytics:createSanitaryAnalytics(infra,runner|| (async()=>require('./helpers/routeEvidenceFixture').goldenResult()))};}
function scenario(){return{name:'Isolated scenario',nodes:[{asset_id:1,demand_kg:0},{asset_id:2,demand_kg:5}],vehicles:[{vehicle_id:3,capacity_kg:10}],matrix:{node_ids:['1','2'],distance_m:[[0,1000],[1000,0]],duration_s:[[0,100],[100,0]],source:{name:'Synthetic isolated matrix',data_kind:'simulated'}}};}
test('sanitary optimization snapshots tenant resources, deduplicates and requires supervisor approval',async()=>{
 const{analytics,memory}=setup();const record=await analytics.optimize(context,scenario());assert.equal(record.state,'PROPOSED');assert.equal(record.input.vehicles[0].id,'3');
 assert.equal((await analytics.optimize(context,scenario())).record_id,record.record_id);
 await assert.rejects(analytics.approve({...context,role:'analyst'},record.record_id,{revision:record.revision}),{statusCode:403});
 const approved=await analytics.approve(context,record.record_id,{revision:record.revision});assert.equal(approved.state,'APPROVED');assert.equal(approved.approved_by,1);
 const denied=scenario();denied.nodes[1].asset_id=3;await assert.rejects(analytics.optimize(context,denied),{statusCode:404});
 memory.data().soi_vehicles[0].status='maintenance';await assert.rejects(analytics.optimize(context,scenario()),{statusCode:409});
});
test('optimization does not invent kg capacity, road distances or estimated emissions',async()=>{
 const{analytics,memory}=setup();const input=scenario();memory.data().soi_vehicles[0].capacity_unit='m3';
 await assert.rejects(analytics.prepareOptimization(context,input),{statusCode:400});input.vehicles[0].capacity_kg_source='Explicit isolated payload weight calibration';
 const payload=await analytics.prepareOptimization(context,input);assert.equal(payload.matrix.source.verification,'ORGANIZATION_DECLARED_NOT_INDEPENDENTLY_VERIFIED');
 assert.equal(payload.vehicles[0].emission_kgco2e_per_km,undefined);
 input.matrix.node_ids=['2','1'];await assert.rejects(analytics.prepareOptimization(context,input),{statusCode:400});
 await assert.rejects(analytics.predict(context,{name:'Undeclared history',operation:'forecast',unit:'kg',source:{name:'Fixture'},history:[]}),{statusCode:400});
});

test('sanitary HTTP refreshes memberships and never trusts JWT role or another tenant header',async(t)=>{
 const express=require('express'),{createToken}=require('../auth');
 const{resolveMembership}=require('../services/organization.service');
 const{createSanitaryRouter}=require('../routes/soiSanitary.routes');const{sanitary,analytics}=setup();
 let memberships=[{organization_id:7,role:'viewer'}];
 const app=express();app.use(express.json());app.use('/soi/sanitary',createSanitaryRouter(sanitary,{analytics,organizationService:{getUserMemberships:async()=>memberships,resolveMembership}}));
 app.use((error,req,res,next)=>res.status(error.statusCode||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');t.after(()=>server.close());await new Promise(resolve=>server.once('listening',resolve));
 const root=`http://127.0.0.1:${server.address().port}/soi/sanitary`,headers={Authorization:`Bearer ${createToken({user_id:1,organization_id:7,role:'admin'})}`,'Content-Type':'application/json'};
 assert.equal((await fetch(root+'/catalog')).status,401);
 assert.equal((await fetch(root+'/catalog',{headers})).status,200);
 assert.equal((await fetch(root+'/resources/waste-categories',{method:'POST',headers,body:JSON.stringify({name:'Denied',code:'X'})})).status,403);
 assert.equal((await fetch(root+'/catalog',{headers:{...headers,'x-organization-id':'8'}})).status,403);
 memberships=[{organization_id:7,role:'analyst'}];const created=await fetch(root+'/resources/waste-categories',{method:'POST',headers,body:JSON.stringify({name:'Isolated HTTP fixture',code:'HTTP'})});assert.equal(created.status,201);
 assert.ok((await(await fetch(root+'/openapi.json',{headers})).json()).paths['/resources/measurements/{id}/void']);
 memberships=[];assert.equal((await fetch(root+'/catalog',{headers})).status,403);
});
test('failed scientific run is persisted with safe errors and cannot be approved',async()=>{
 const{analytics,memory}=setup(async()=>{throw new Error('private internal execution path');});
 await assert.rejects(analytics.optimize(context,scenario()));const record=memory.data().soi_optimization_scenarios[0];assert.equal(record.state,'FAILED');assert.doesNotMatch(record.error,/private/);
 await assert.rejects(analytics.approve(context,record.record_id,{revision:record.revision}),{statusCode:409});
});
test('a routing time limit does not become a false proof of infeasibility',async()=>{
 const{analytics}=setup(async()=>({version:'test-only',result:{feasible:false,status:'NO_SOLUTION_FOUND_WITHIN_LIMIT'}}));
 const record=await analytics.optimize(context,scenario());assert.equal(record.state,'NO_SOLUTION_FOUND');
});
test('scientific retries recover a failed run without duplicating its identity',async()=>{
 let attempts=0;const{analytics,memory}=setup(async()=>{attempts++;if(attempts===1)throw new Error('isolated failure');return{version:'test-only',result:{feasible:true,routes:[]}};});
 await assert.rejects(analytics.optimize(context,scenario()));const first=memory.data().soi_optimization_scenarios[0];const record=await analytics.retry(context,'optimization-scenarios',first.record_id,{revision:first.revision});
 assert.equal(record.record_id,first.record_id);assert.equal(record.attempts,2);assert.equal(record.state,'PROPOSED');assert.equal(memory.data().soi_optimization_scenarios.length,1);
 await assert.rejects(analytics.retry(context,'optimization-scenarios',record.record_id,{revision:record.revision}),{statusCode:409});
});
test('dashboard and report preserve units, provenance kinds and immutable snapshots',async()=>{
 const{analytics,memory}=setup();memory.data().soi_waste_movements=[{organization_id:7,status:'completed',quantity_kg:500,data_kind:'measured',occurred_at:new Date('2026-01-01'),cost:20,currency:'USD'},{organization_id:7,status:'completed',quantity_kg:200,data_kind:'simulated',occurred_at:new Date('2026-01-01')},{organization_id:8,status:'completed',quantity_kg:99999,data_kind:'measured'}];
 memory.data().soi_carbon_entries=[{organization_id:7,scope:'1',kgco2e:50,calculation:{result_kind:'estimated'}},{organization_id:7,scope:'1',kgco2e:100,calculation:{result_kind:'simulated'}},{organization_id:7,scope:'1',kgco2e:999,calculation:{result_kind:'estimated'},voided_at:new Date()}];
 const dashboard=await analytics.dashboard(context);assert.equal(dashboard.metrics.waste_mass_kg_by_kind.measured,500);assert.equal(dashboard.metrics.waste_mass_kg_by_kind.simulated,200);assert.equal(dashboard.metrics.emissions_kgco2e_by_scope_and_kind['scope_1:estimated'],50);
 const report=await analytics.report(context,{name:'Isolated report'});memory.data().soi_waste_movements[0].quantity_kg=900;assert.equal(report.snapshot.metrics.waste_mass_kg_by_kind.measured,500);assert.ok(report.snapshot_sha256);
});
test('coverage uses actual inventory geometries and distinguishes simulated execution',async()=>{
 const{sanitary,analytics}=setup();const execution=await sanitary.create(context,'route-executions',{name:'Isolated execution',route_plan_id:5,vehicle_id:3,started_at:'2026-01-01T00:00:00Z',planned_asset_ids:[1,2],served_asset_ids:[2],data_kind:'simulated',source:'test-only'});
 const result=await analytics.coverage(context,{zone_asset_id:4,execution_id:execution.record_id});assert.equal(result.inventory_points,2);assert.equal(result.coverage_percent,50);assert.equal(result.data_kind,'simulated');
});
test('climate route sampling persists provider failures and never invents rainfall',async()=>{
 const{infra}=setup();const analytics=createSanitaryAnalytics(infra,undefined,{weather:async()=>{throw new Error('no provider');}});
 const result=await analytics.climate(context,{route_plan_id:5,daily_rain_threshold_mm:20});assert.equal(result.status,'unavailable');assert.equal(result.samples[0].threshold_exceeded,null);assert.equal(result.samples[0].current,undefined);
});
test('read-only connector is bound to tenant and handles absent credentials honestly',async()=>{
 const{infra,sanitary}=setup();const integration=await sanitary.create(context,'integrations',{name:'No provider configured',provider:'traccar',authorization_reference:'isolated contract test',configuration_key:'SOI_CONNECTOR_ISOLATED'});
 const connectors=createSanitaryIntegrations(infra,{env:{},fetchImpl:()=>{throw new Error('must not call');}});
 assert.equal((await connectors.status(context,integration.record_id)).status,'not_configured');await assert.rejects(connectors.sync(context,integration.record_id),{statusCode:503});
 const cross=createSanitaryIntegrations(infra,{env:{SOI_CONNECTOR_ISOLATED:JSON.stringify({organization_id:8,provider:'traccar',url:'https://example.invalid'})}});
 await assert.rejects(cross.status(context,integration.record_id),{statusCode:403});
});
test('Traccar adapter fetches GET only, maps declared devices and rejects stale/unknown precision',async()=>{
 const{infra,sanitary}=setup();const integration=await sanitary.create(context,'integrations',{name:'Fixture-only adapter',provider:'traccar',authorization_reference:'isolated test, no real provider',configuration_key:'SOI_CONNECTOR_ISOLATED'});
 const positions=[];const calls=[];const now=Date.now();
 const connector=createSanitaryIntegrations(infra,{env:{SOI_CONNECTOR_ISOLATED:JSON.stringify({organization_id:7,provider:'traccar',url:'https://example.invalid',fleet_source_id:1,device_map:{'12':3}})},fleet:{ingest:async(...args)=>positions.push(args)},fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return{ok:true,text:async()=>JSON.stringify([{id:1,deviceId:12,longitude:0,latitude:0,accuracy:5,fixTime:new Date(now).toISOString(),valid:true,speed:10},{id:2,deviceId:99,accuracy:5},{id:3,deviceId:12,accuracy:0},{id:4,deviceId:12,accuracy:5,fixTime:new Date(0).toISOString()}])};}});
 const result=await connector.sync(context,integration.record_id);assert.equal(result.accepted,1);assert.equal(result.skipped,3);assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.redirect,'error');assert.match(calls[0].url,/api\/positions$/);assert.equal(positions[0][0],7);assert.equal(positions[0][2],3);assert.ok(positions[0][3].positions[0].speed_mps>5);
});
