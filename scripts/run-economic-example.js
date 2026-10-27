const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function run(){
 const file=path.resolve(__dirname,'../docs/examples/economic-planning.json'),example=JSON.parse(fs.readFileSync(file,'utf8'));
 const result=(await import('../shared/economics.v1.mjs')).runEconomics(example.snapshot,example.assumptions),expected=example.expected;
 assert.equal(result.current.cash_estimate_minor,expected.cash_minor);assert.equal(result.current.receivables.outstanding_minor,expected.outstanding_minor);
 assert.deepEqual(result.optimization.allocations.map(r=>r.allocated_minor),expected.allocations_minor);assert.equal(result.optimization.reserve_minor,expected.reserve_minor);
 assert.equal(result.fees.total_minor,expected.fee_total_minor);assert.deepEqual(result.fees.components[0].allocations.map(r=>r.amount_minor),expected.fee_by_entity_minor);assert.equal(result.forecast.scenarios.length,expected.forecast_scenarios);
 for(const scenario of result.forecast.scenarios)for(const p of scenario.periods)assert.equal(BigInt(p.receivables_open_minor)+BigInt(p.billed_minor)-BigInt(p.receipts_minor),BigInt(p.receivables_close_minor));
 const output={nature:example.nature,verified:true,result};fs.writeFileSync(path.resolve(__dirname,'../docs/examples/economic-planning-result.json'),JSON.stringify(output,null,2));console.log(JSON.stringify({verified:true,cash_minor:expected.cash_minor,outstanding_minor:expected.outstanding_minor,scenarios:result.forecast.scenarios.length,atlas_writes:false}));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
