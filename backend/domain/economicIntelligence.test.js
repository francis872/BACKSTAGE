const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {setup}=require('./helpers/computationalFixture');
const {createHebraCipher}=require('../services/hebraCipher.service');
const {createPackedDocument}=require('../services/hebraPackedDocument.service');
const {createHorizontalPropertyService}=require('../services/horizontalProperty.service');
const {createPropertyOperationsService}=require('../services/propertyOperations.service');
const {createEconomicIntelligenceService}=require('../services/economicIntelligence.service');
const key=()=>crypto.randomUUID();
async function fixture(){const s=setup();s.now=Date.now;const cipher=createHebraCipher({HEBRA_ACTIVE_KEY_ID:'synthetic',HEBRA_ENCRYPTION_KEYS:JSON.stringify({synthetic:crypto.randomBytes(32).toString('base64')})}),ph=createHorizontalPropertyService(s.infra),ops=createPropertyOperationsService({infrastructure:s.infra,cipher,now:s.now});
const root=(await ph.create(s.owner,{kind:'coproperty',name:'Synthetic economic root',source_name:'Synthetic fixture'},key())).data,units=[];
for(let i=0;i<2;i++)units.push((await ph.create(s.owner,{kind:'private_unit',parent_id:root.location_id,name:`Synthetic unit ${i}`,source_name:'Synthetic fixture',coefficient_pct:i?'66.6667':'33.3333',geometry:{type:'Point',coordinates:[-74+i*.01,4]}},key())).data);
const create=async(type,body,id=root.location_id)=>(await ops.create(s.owner,id,type,{source_name:'Synthetic economic fixture',...body},key())).data;
const budget=await create('budget',{title:'Operating plan',amount_minor:10001,currency:'COP',scale:2,starts_at:new Date(s.now()-1000).toISOString(),ends_at:new Date(s.now()+86400000).toISOString()});
const approved=(await ops.transition(s.owner,root.location_id,budget.record_id,{revision:1,status:'approved',note:'Synthetic minutes reference; internal approval only'},key())).data;
const q={title:'Synthetic scenario',currency:'COP',scale:2,from:new Date(s.now()).toISOString().slice(0,7),to:new Date(s.now()).toISOString().slice(0,7),opening_cash_minor:'1000',opening_source_ref:'Synthetic opening evidence',optimization:{budget_ids:[String(approved.record_id)],reserve_minor:'1000',items:[{id:'Operations',min_minor:'3000',max_minor:'5000',priority:'2',source_ref:'Synthetic requirement'},{id:'Maintenance',min_minor:'2000',max_minor:'6000',priority:'1',source_ref:'Synthetic requirement'}]},fees:{installments:3,components:[{id:'Common fee',budget_id:String(approved.record_id),amount_minor:'10001',kind:'common',basis:'coefficient',rule_reference:'Synthetic rules',normative_reference:'Human applicability review required'}]}};
return{...s,cipher,ph,ops,root,units,create,budget:approved,q,engine:createEconomicIntelligenceService({infrastructure:s.infra,operations:ops,cipher,now:s.now})};}

test('packed Hebra preserves large documents, rejects reordered chunks, wrong binding and oversized content',()=>{
 const cipher=createHebraCipher({HEBRA_ACTIVE_KEY_ID:'test',HEBRA_ENCRYPTION_KEYS:JSON.stringify({test:crypto.randomBytes(32).toString('base64')})}),store=createPackedDocument(cipher),value={private:crypto.randomBytes(200000).toString('hex')},binding={organization_id:1};
 const sealed=store.seal(value,binding);assert(sealed.packet.parts.length>1);assert.deepEqual(store.open(sealed.packet,sealed.commitment,binding),value);assert.throws(()=>store.open(sealed.packet,sealed.commitment,{organization_id:2}),{statusCode:409});
 const swapped=structuredClone(sealed.packet);swapped.parts.reverse();const commitment=require('../services/hebraCipher.service').digest(swapped);assert.throws(()=>store.open(swapped,commitment,binding),{statusCode:409});
 assert.throws(()=>store.seal({value:'a'.repeat(1000001)},binding),{statusCode:413});
});
test('economic snapshot authenticates versions and preserves receipt/expense reversals as dated bookkeeping events',async()=>{
 const s=await fixture(),charge=await s.create('charge',{title:'Fee',amount_minor:10001,currency:'COP',scale:2,issued_at:new Date(s.now()-10000).toISOString(),due_at:new Date(s.now()-1000).toISOString()},s.units[0].location_id);
 const payment=await s.create('payment',{charge_id:charge.record_id,amount_minor:6000,reference:'Synthetic receipt'},s.units[0].location_id);
 const expense=await s.create('expense',{title:'Repair',amount_minor:2000,currency:'COP',scale:2,paid_at:new Date(s.now()-1000).toISOString(),reference:'Synthetic expense'});
 const r=await s.engine.create(s.owner,s.root.location_id,s.q,key());assert.equal(r.data.result.current.receivables.outstanding_minor,'4001');assert.equal(r.data.result.current.cash_estimate_minor,'5000');
 await s.ops.transition(s.owner,s.units[0].location_id,payment.record_id,{revision:1,status:'voided',note:'Correction'},key());
 await s.ops.transition(s.owner,s.root.location_id,expense.record_id,{revision:1,status:'voided',note:'Correction'},key());
 const current=await s.engine.create(s.owner,s.root.location_id,s.q,key());assert.equal(current.data.result.current.cash_estimate_minor,'1000');assert.equal(current.data.result.current.receivables.outstanding_minor,'10001');
 assert.equal((await s.engine.reproduce(s.owner,s.root.location_id,r.data.scenario_id)).verified,true);
});
test('economic versions are private, idempotent, immutable and use current roles and organization boundaries',async()=>{
 const s=await fixture(),command=key(),a=await s.engine.create(s.owner,s.root.location_id,s.q,command),again=await s.engine.create(s.owner,s.root.location_id,s.q,command);assert.equal(again.created,false);assert.equal(a.data.scenario_id,again.data.scenario_id);
 assert(!JSON.stringify(s.f.data().operational_events.filter(r=>r.kind==='economic.scenario.version')).includes('Synthetic opening evidence'));
 await assert.rejects(s.engine.create(s.owner,s.root.location_id,{...s.q,opening_cash_minor:'5'},command),{statusCode:409});
 await assert.rejects(s.engine.get(s.viewer,s.root.location_id,a.data.scenario_id),{statusCode:403});await assert.rejects(s.engine.get(s.other,s.root.location_id,a.data.scenario_id),{statusCode:404});
 const revised=await s.engine.create(s.owner,s.root.location_id,{...s.q,title:'Revision 2'},key(),{priorId:a.data.scenario_id,revision:1});assert.equal(revised.data.revision,2);assert.equal((await s.engine.get(s.owner,s.root.location_id,a.data.scenario_id)).data.assumptions.title,s.q.title);
 await assert.rejects(s.engine.create(s.owner,s.root.location_id,s.q,key(),{priorId:a.data.scenario_id,revision:1}),{statusCode:409});
 s.f.data().identity_memberships.find(m=>m.user_id===1&&m.organization_id===10).role='viewer';await assert.rejects(s.engine.get(s.owner,s.root.location_id,revised.data.scenario_id),{statusCode:403});
});
test('planning approval requires current basis, administrator review and preserves ledger without creating charges',async()=>{
 const s=await fixture(),a=await s.engine.create(s.owner,s.root.location_id,s.q,key()),before=s.f.data().operational_events.filter(r=>r.kind==='ph.record.version').length;
 await assert.rejects(s.engine.approve(s.analyst,s.root.location_id,a.data.scenario_id,{revision:1,reference:'Synthetic review'},key()),{statusCode:403});
 const approved=await s.engine.approve(s.owner,s.root.location_id,a.data.scenario_id,{revision:1,reference:'Synthetic administrative and rule review'},key());assert.equal(approved.data.state,'approved_for_planning');assert.equal(approved.data.revision,2);assert.equal(s.f.data().operational_events.filter(r=>r.kind==='ph.record.version').length,before);
 const next=await s.engine.create(s.owner,s.root.location_id,s.q,key());await s.ph.update(s.owner,s.units[0].location_id,{revision:1,coefficient_pct:'30'});
 await assert.rejects(s.engine.approve(s.owner,s.root.location_id,next.data.scenario_id,{revision:1,reference:'Stale review'},key()),{statusCode:409});
});
test('budget approval and expense permissions are real, future disbursements and unreviewed allocation are blocked',async()=>{
 const s=await fixture();await assert.rejects(s.ops.create(s.analyst,s.root.location_id,'expense',{title:'Unauthorized',amount_minor:1,currency:'COP',scale:2,paid_at:new Date(s.now()-1).toISOString(),reference:'Synthetic',source_name:'Synthetic'},key()),{statusCode:403});
 await assert.rejects(s.create('expense',{title:'Future',amount_minor:1,currency:'COP',scale:2,paid_at:new Date(s.now()+10000).toISOString(),reference:'Synthetic'}),{statusCode:400});
 await assert.rejects(s.ph.archive(s.owner,s.root.location_id,{revision:1}),{statusCode:409});
 const bad=await s.engine.create(s.owner,s.root.location_id,{...s.q,optimization:{...s.q.optimization,reserve_minor:'900000'}},key());assert.equal(bad.data.result.optimization.status,'infeasible');await assert.rejects(s.engine.approve(s.owner,s.root.location_id,bad.data.scenario_id,{revision:1,reference:'Cannot approve infeasible'},key()),{statusCode:409});
});
test('economic writes reject revocation during calculation and corrupted journal audit timestamps',async()=>{
 const s=await fixture(),engine=createEconomicIntelligenceService({infrastructure:s.infra,operations:s.ops,cipher:s.cipher,calculate:async(snapshot,q)=>{const r=(await import('../../shared/economics.v1.mjs')).runEconomics(snapshot,q);s.f.data().identity_memberships.find(m=>m.user_id===1&&m.organization_id===10).role='viewer';return r;}});
 await assert.rejects(engine.create(s.owner,s.root.location_id,s.q,key()),{statusCode:403});
 s.f.data().identity_memberships.find(m=>m.user_id===1&&m.organization_id===10).role='admin';const row=s.f.data().soi_audit_events.find(r=>r.action==='ph.operation.created');row.created_at=new Date(0);await assert.rejects(s.ops.economicSnapshot(s.owner,s.root.location_id,s.q),{statusCode:409});
});
test('HTTP economic evidence enforces native role/tenant isolation, no-store and private alert exclusions',async t=>{
 process.env.JWT_SECRET||='isolated-economic-http-test-secret';const s=await fixture(),express=require('express'),identity=require('../services/mongoIdentity.service').createMongoIdentityService(s.infra),app=express();app.use(express.json());
 app.use('/assets',require('../routes/assets.routes').createAssetsRouter({}, {getUserMemberships:identity.getUserMemberships,resolveMembership:require('../services/organization.service').resolveMembership},s.ph,s.ops,undefined,s.engine));app.use(require('../middleware/errorHandler'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
 const url=`http://127.0.0.1:${server.address().port}/assets/layers/horizontal-property/${s.root.location_id}/economics/scenarios`,{createToken}=require('../auth');
 const req=async(user_id,body)=>fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${createToken({user_id,organization_id:user_id===5?20:10,role:'admin'})}`,'Content-Type':'application/json','Idempotency-Key':key()},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await fetch(url)).status,401);assert.equal((await req(4,s.q)).status,403);assert.equal((await req(5,s.q)).status,404);
 const response=await req(1,s.q);assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');const id=(await response.json()).data.scenario_id;
 const infra=require('../infrastructure/platformMongo');t.mock.method(infra,'getMongoDatabase',s.infra.getMongoDatabase);const repo=require('../repositories/operationalEvents.repository');assert.deepEqual(await repo.listEvents({organizationId:10}),[]);assert.equal(await repo.acknowledgeEvent({organizationId:10,eventId:id,userId:4}),null);assert.equal(await repo.resolveEvent({organizationId:10,eventId:id,userId:4}),null);
});
