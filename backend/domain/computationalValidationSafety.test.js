const test=require('node:test'),assert=require('node:assert/strict');
test('real acceptance cleanup covers workflow, event and source collections while excluding shared counters',()=>{
 const {OWNED_COLLECTIONS}=require('../scripts/verify-computational-atlas');
 for(const collection of['analytics_jobs','operational_events','integration_sources','integration_events','identity_users','identity_organizations','identity_memberships'])assert(OWNED_COLLECTIONS.includes(collection),`Acceptance cleanup omitted ${collection}`);
 assert(!OWNED_COLLECTIONS.includes('soi_counters'));assert(!OWNED_COLLECTIONS.includes('soi_provider_locks'));
});
