// Independent validation only. SciPy is not a production dependency of the JS engine.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{performance}=require('node:perf_hooks');
async function run(){
 const {optimizeBudget}=await import('../shared/economicPlanning.mjs'),{runEconomics}=await import('../shared/economics.v1.mjs');
 const cases=Array.from({length:48},(_,k)=>({budget_ids:['1'],reserve_minor:String(k%7),items:Array.from({length:2+k%8},(_,i)=>({id:String(i),min_minor:String((k+i)%5),max_minor:String(8+(k*3+i)%21),priority:String((k+i*3)%11/4),source_ref:'Synthetic independent reference'}))}));
 const budgets=cases.map((_,k)=>[{id:'1',status:'approved',amount_minor:String(8+k*3),currency:'COP'}]);
 const python=process.env.BACKSTAGE_REFERENCE_PYTHON||path.resolve(__dirname,'../.venv-bsie/Scripts/python.exe');
 const comparison=spawnSync(python,['-c',`import sys,json,scipy
from scipy.optimize import linprog
rows=json.load(sys.stdin); out=[]
for r in rows:
 m=r['model']; n=len(m['items']); bounds=[(int(x['min_minor']),int(x['max_minor'])) for x in m['items']]
 if any(lo>hi for lo,hi in bounds): out.append({'status':'infeasible'}); continue
 result=linprog([-float(x['priority']) for x in m['items']], A_ub=[[1.0]*n], b_ub=[int(r['budget'])-int(m['reserve_minor'])], bounds=bounds, method='highs')
 out.append({'status':'optimal' if result.success else 'infeasible','objective': -float(result.fun) if result.success else None})
json.dump({'version':scipy.__version__,'results':out},sys.stdout)`],{input:JSON.stringify(cases.map((model,i)=>({model,budget:budgets[i][0].amount_minor}))),encoding:'utf8',timeout:60000,windowsHide:true});
 assert.equal(comparison.status,0,comparison.stderr);const reference=JSON.parse(comparison.stdout);
 for(let i=0;i<cases.length;i++){const r=optimizeBudget(cases[i],budgets[i]);assert.equal(r.status,reference.results[i].status);if(r.status==='optimal')assert(Math.abs(Number(r.objective.decimal)-reference.results[i].objective)<1e-6);}
 const entities=Array.from({length:500},(_,i)=>({id:String(i+1),kind:'private_unit',ancestry_ids:[],archived:false})),events=[];
 for(let i=0;i<2500;i++){const month=String(1+Math.floor(i/250)%12).padStart(2,'0'),year=2024+Math.floor(i/3000);const at=`${year}-${month}-15T00:00:00.000Z`,id=String(i*2+1),entity_id=entities[i%500].id;events.push({id:'charge-'+i,sequence:i*2+1,record_id:id,entity_id,kind:'charge',amount_minor:'10000',at,due_at:at},{id:'receipt-'+i,sequence:i*2+2,record_id:String(i*2+2),entity_id,kind:'receipt',charge_id:id,amount_minor:'6000',at});}
 const snapshot={captured_at:'2026-12-26T12:00:00.000Z',currency:'COP',scale:2,entities,events,budgets:[]},q={title:'Synthetic maximum bounded ledger',currency:'COP',scale:2,from:'2024-01',to:'2026-12',opening_cash_minor:'0',opening_source_ref:'Synthetic zero opening'};
 const times=[];for(let i=0;i<4;i++){const start=performance.now(),r=runEconomics(snapshot,q);times.push(performance.now()-start);assert.equal(r.current.cash_estimate_minor,'15000000');assert.equal(r.current.receivables.outstanding_minor,'10000000');assert.equal(r.history.length,36);}
 times.sort((a,b)=>a-b);const report={status:'passed',completed_at:new Date().toISOString(),optimizer:{independent_reference:'scipy.optimize.linprog HiGHS',reference_version:reference.version,cases:cases.length,objective_tolerance:0.000001,exhaustive_integer_cases_in_unit_tests:208},bounded_pure_engine_performance:{entities:500,events:5000,months:36,runs:times.length,minimum_ms:Math.round(times[0]),median_ms:Math.round((times[1]+times[2])/2),maximum_ms:Math.round(times.at(-1)),environment:'local Node; synthetic in-memory snapshot; no HTTP or Atlas load',production_capacity_certified:false},production_python_dependency_added:false,packages_installed:false};
 fs.writeFileSync(path.resolve(__dirname,'../docs/evidence/economic-reference-performance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
