const test = require('node:test'), assert = require('node:assert/strict');
const core = () => import('../../shared/economics.v1.mjs');
const date = value => value + 'T00:00:00.000Z';
function fixture() {
  const entities = ['1','2'].map((id,i) => ({ id, kind:'private_unit', ancestry_ids:['9'], coefficient_units:i?666667:333333, archived:false }));
  const events = [
    {id:'a',sequence:1,record_id:'10',entity_id:'1',kind:'charge',amount_minor:'10001',at:date('2026-01-01'),due_at:date('2026-02-01')},
    {id:'b',sequence:2,record_id:'11',entity_id:'1',kind:'receipt',charge_id:'10',amount_minor:'6000',at:date('2026-02-01')},
    {id:'c',sequence:3,record_id:'12',entity_id:'2',kind:'expense',amount_minor:'2000',at:date('2026-02-02')},
  ];
  const budgets = [{id:'30',revision:2,entity_id:'9',amount_minor:'10001',currency:'COP',scale:2,status:'approved',starts_at:date('2026-02-01'),ends_at:date('2026-02-28'),source_ref:'Synthetic approved budget'}];
  const snapshot = {captured_at:date('2026-10-26'),currency:'COP',scale:2,entities,events,budgets,coefficient_scope_complete:true};
  const q = {title:'Synthetic case',currency:'COP',scale:2,from:'2026-01',to:'2026-10',opening_cash_minor:'0',opening_source_ref:'Synthetic opening balance'};
  return {snapshot,q};
}
test('economic arithmetic preserves exact ledger balances, aging, cash and budget variance',async()=>{
  const {runEconomics}=await core(),{snapshot,q}=fixture(),r=runEconomics(snapshot,q);
  assert.equal(r.current.receivables.outstanding_minor,'4001');assert.equal(r.current.receivables.overdue_minor,'4001');assert.equal(r.current.receivables.aging.over_90,'4001');
  assert.equal(r.current.cash_estimate_minor,'4000');assert.equal(r.history[1].net_minor,'4000');assert.equal(r.history[1].budget_variance_minor,'8001');
  assert.equal(r.current.receivables.concentration_hhi.decimal,'1.00000000');assert.equal(r.forecast.status,'requires_history_review');
  const threshold=runEconomics(snapshot,{...q,overdue_alert_ratio:'0.5',threshold_source_ref:'Synthetic operator policy'});assert(threshold.alerts.some(a=>a.type==='operator_defined_overdue_threshold_exceeded'));
});
test('recorded reversals preserve cash/debt conservation and historical states',async()=>{
  const {runEconomics}=await core(),{snapshot,q}=fixture();
  snapshot.events.push({id:'d',sequence:4,record_id:'11',entity_id:'1',kind:'void_receipt',amount_minor:'6000',at:date('2026-03-01')});
  snapshot.events.push({id:'e',sequence:5,record_id:'10',entity_id:'1',kind:'void_charge',amount_minor:'10001',at:date('2026-03-02')});
  const r=runEconomics(snapshot,q);assert.equal(r.history[1].outstanding_minor,'4001');assert.equal(r.history[2].outstanding_minor,'0');assert.equal(r.current.cash_estimate_minor,'-2000');assert.equal(r.current.receivables.overdue_share,null);
  assert(r.alerts.some(a=>a.type==='recorded_cash_deficit'));
});
test('large monetary strings retain precision beyond binary64 and reject fractional minor units',async()=>{
  const {runEconomics}=await core(),{snapshot,q}=fixture();snapshot.events=[];q.opening_cash_minor='900719925474099312345';
  assert.equal(runEconomics(snapshot,q).current.cash_estimate_minor,q.opening_cash_minor);
  assert.throws(()=>runEconomics(snapshot,{...q,opening_cash_minor:'0.29'}));
  assert.throws(()=>runEconomics(snapshot,{...q,opening_cash_minor:9007199254740992}));
});
test('optimizer honors reserve, lower/upper bounds and proves infeasibility',async()=>{
  const {runEconomics}=await core(),{snapshot,q}=fixture();q.optimization={budget_ids:['30'],reserve_minor:'1000',items:[{id:'A',min_minor:'3000',max_minor:'5000',priority:'2',source_ref:'Mandatory expense'},{id:'B',min_minor:'2000',max_minor:'6000',priority:'1',source_ref:'Operational priority'}]};
  const r=runEconomics(snapshot,q).optimization;assert.equal(r.status,'optimal');assert.deepEqual(r.allocations.map(v=>v.allocated_minor),['5000','4001']);assert.equal(r.unallocated_minor,'0');
  q.optimization.reserve_minor='9000';const bad=runEconomics(snapshot,q).optimization;assert.equal(bad.status,'infeasible');assert.equal(bad.certificate.deficit_minor,'3999');
});
test('greedy bounded allocation agrees with exhaustive independent integer enumeration',async()=>{
  const {optimizeBudget}=await import('../../shared/economicPlanning.mjs');
  for(let budget=0;budget<=12;budget++)for(let a=0;a<=3;a++)for(let b=0;b<=3;b++){
    const model={budget_ids:['1'],reserve_minor:'0',items:[{id:'a',min_minor:'0',max_minor:'5',priority:String(a),source_ref:'Synthetic'},{id:'b',min_minor:'0',max_minor:'6',priority:String(b),source_ref:'Synthetic'}]};
    const r=optimizeBudget(model,[{id:'1',status:'approved',amount_minor:String(budget),currency:'COP'}]);let best=0;for(let x=0;x<=5;x++)for(let y=0;y<=6;y++)if(x+y<=budget)best=Math.max(best,a*x+b*y);
    assert.equal(Number(r.objective.decimal),best);
  }
});
test('fee components conserve approved budget and installments, with explicit different allocation rules',async()=>{
  const {runEconomics}=await core(),{snapshot,q}=fixture();q.fees={installments:12,components:[{id:'common',budget_id:'30',amount_minor:'8000',kind:'common',basis:'coefficient',rule_reference:'Synthetic rule A',normative_reference:'Requires human applicability review'},{id:'reserve',budget_id:'30',amount_minor:'2001',kind:'reserve',basis:'equal',rule_reference:'Synthetic distinct rule B',normative_reference:'Requires human applicability review'}]};
  const r=runEconomics(snapshot,q).fees;assert.equal(r.status,'calculated_proposal');assert.equal(r.total_minor,'10001');assert.equal(r.creates_charges,false);
  for(const c of r.components){assert.equal(c.allocations.reduce((s,v)=>s+BigInt(v.amount_minor),0n),BigInt(c.amount_minor));for(const a of c.allocations)assert.equal(a.installments_minor.reduce((s,v)=>s+BigInt(v),0n),BigInt(a.amount_minor));}
  snapshot.coefficient_scope_complete=false;assert.equal(runEconomics(snapshot,q).fees.status,'requires_review');
});
test('fee calculation refuses incomplete coefficients, unapproved budgets and incomplete custom weights',async()=>{
  const {runEconomics}=await core(),{snapshot,q}=fixture();q.fees={installments:1,components:[{id:'fee',budget_id:'30',amount_minor:'10001',kind:'extraordinary',basis:'coefficient',rule_reference:'Synthetic',normative_reference:'Human review required'}]};
  snapshot.entities[0].coefficient_units=null;assert.equal(runEconomics(snapshot,q).fees.status,'requires_review');
  q.fees.components[0]={...q.fees.components[0],basis:'custom',weights:{'1':'1'}};assert.equal(runEconomics(snapshot,q).fees.status,'requires_review');
  snapshot.budgets[0].status='planned';assert.equal(runEconomics(snapshot,q).fees.status,'requires_review');
});
test('forecast uses past-only rolling validation, identified supplied data and conserves projected receivables',async()=>{
  const {runEconomics,normalizeEconomicAssumptions}=await core(),{snapshot,q}=fixture();
  q.forecast={window:3,horizon:3,supplied_history:{nature:'SIMULATED',source_ref:'Synthetic monthly reference',rows:Array.from({length:9},(_,i)=>({month:`2026-${String(i+1).padStart(2,'0')}`,receipts_minor:String(8000+i*10),expenses_minor:'7000',billed_minor:'10000'}))},variants:[{id:'optimistic',billing_factor:'1',collection_factor:'1.1',expense_factor:'0.9',source_ref:'Synthetic assumptions'},{id:'pessimistic',billing_factor:'1',collection_factor:'0.9',expense_factor:'1.1',source_ref:'Synthetic assumptions'}]};
  const r=runEconomics(snapshot,q);assert.equal(r.forecast.status,'estimated_conditionally');assert.equal(r.forecast.scenarios.length,3);assert(r.forecast.backtest.receipts_minor.samples>=3);
  for(const s of r.forecast.scenarios)for(const p of s.periods){assert.equal(BigInt(p.receivables_open_minor)+BigInt(p.billed_minor)-BigInt(p.receipts_minor),BigInt(p.receivables_close_minor));assert(BigInt(p.interval.cash_lower_minor)<=BigInt(p.cash_minor));assert(BigInt(p.interval.cash_upper_minor)>=BigInt(p.cash_minor));}
  const original=r.forecast.backtest.receipts_minor.errors_minor; q.forecast.supplied_history.rows[8].receipts_minor='999999';const changed=runEconomics(snapshot,q).forecast.backtest.receipts_minor.errors_minor;assert.deepEqual(changed.slice(0,-1),original.slice(0,-1));
  assert.deepEqual(normalizeEconomicAssumptions(normalizeEconomicAssumptions(q)),normalizeEconomicAssumptions(q));
});
test('zero denominator, invalid references, future months and forged configuration are explicit',async()=>{
  const {runEconomics}=await core(),{snapshot,q}=fixture();snapshot.events=[];assert.equal(runEconomics(snapshot,q).current.receivables.overdue_share,null);
  assert.throws(()=>runEconomics(snapshot,{...q,to:'2027-01'}));assert.throws(()=>runEconomics(snapshot,{...q,organization_id:999}));
  snapshot.events=[{id:'a',sequence:1,record_id:'1',entity_id:'foreign',kind:'expense',amount_minor:'1',at:date('2026-01-01')}];assert.throws(()=>runEconomics(snapshot,q));
});
