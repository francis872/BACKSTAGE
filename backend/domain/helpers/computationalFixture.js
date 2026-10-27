const {fixture}=require('./soiMongoMemoryFixture');
const {createComputationalOrchestrator}=require('../../services/computationalOrchestrator.service');
function setup(options={}){
 const f=fixture({identity_users:[1,2,3,4,5,6].map(user_id=>({user_id,status:'active',session_version:0})),identity_organizations:[10,20,30].map(organization_id=>({organization_id,status:'active'})),identity_memberships:[{user_id:1,organization_id:10,role:'admin'},{user_id:2,organization_id:10,role:'admin'},{user_id:3,organization_id:10,role:'analyst'},{user_id:4,organization_id:10,role:'viewer'},{user_id:5,organization_id:20,role:'admin'},{user_id:6,organization_id:30,role:'admin'}]});
 let queue=Promise.resolve(),clock=Date.now();const infra={getMongoDatabase:async()=>f.options.database,nextId:f.options.nextId,cleanDocument:r=>r,withMongoTransaction:work=>{const next=queue.then(()=>f.options.transaction(work));queue=next.catch(()=>{});return next;}};
 const service=createComputationalOrchestrator({infrastructure:infra,now:()=>clock,heartbeatMs:10,...options});
 return {f,infra,service,owner:{organizationId:10,userId:1},other:{organizationId:20,userId:5},analyst:{organizationId:10,userId:3},viewer:{organizationId:10,userId:4},advance:ms=>{clock+=ms;},now:()=>clock};
}
const definition=(count=1)=>({name:'Declared computation fixture',tasks:Array.from({length:count},(_,i)=>({id:`task${i}`,algorithm:'risk.components',parameters:{threat:.5,exposure:.5,vulnerability:.5},depends_on:i===2?['task0','task1']:[]}))});
async function queued(s,context=s.owner,input=definition(),key='owned-fixture-key'){const r=await s.service.create(context,input,key);return s.service.mutate(context,r.run.analytics_job_id,'queue',{revision:r.run.revision});}

module.exports={setup,definition,queued};
