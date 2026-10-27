const test = require('node:test');
const assert = require('node:assert/strict');
const { ownedFilters, plan, COLLECTIONS } = require('../scripts/verify-platform-core-atlas');
test('Atlas validation defaults to a plan and cleanup selectors cannot become unscoped', () => {
  assert.equal(plan().mode, 'plan_only');
  assert.deepEqual(Object.keys(plan().indexes), ['identity_invitations']);
  assert.equal(plan().indexes.identity_invitations.length, 3);
  const ownership = { run_id: 'atlas-core-20261022000000-aabbccddeeff', organization_ids: [7, 8], user_ids: [1, 2] };
  const filters = ownedFilters(ownership);
  assert.deepEqual(Object.keys(filters), COLLECTIONS);
  assert.deepEqual(filters.identity_users, { user_id: { $in: [1, 2] } });
  assert.deepEqual(filters.identity_memberships, { organization_id: { $in: [7, 8] } });
  assert.deepEqual(filters.soi_audit_heads, { _id: { $in: ['organization:7', 'organization:8'] } });
  for (const changes of [{ organization_ids: [] }, { user_ids: [] }, { user_ids: [null] }, { organization_ids: [-1] }, { run_id: '../unsafe' }]) assert.throws(() => ownedFilters({ ...ownership, ...changes }));
  assert(!COLLECTIONS.includes('soi_counters'), 'Shared counters must never be deleted or rewound');
});
