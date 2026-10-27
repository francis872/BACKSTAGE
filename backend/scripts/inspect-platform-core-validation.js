// Read-only confirmation from a fresh process after the authorized live validation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ownedFilters, COLLECTIONS } = require('./verify-platform-core-atlas');
async function inspect() {
  const root = path.resolve(__dirname, '../..');
  const evidence = path.join(root, 'docs/backstage-2.0/evidence');
  const report = JSON.parse(fs.readFileSync(path.join(evidence, 'atlas-core-live.json'), 'utf8'));
  assert.equal(report.status, 'passed');
  assert.equal(report.cleanup.status, 'passed');
  assert.match(report.run_id, /^atlas-core-\d{14}-[a-f0-9]{12}$/);
  const archive = path.join(root, '.vercel', report.run_id, 'owned-test-records.bson');
  const ownership = JSON.parse(fs.readFileSync(path.join(path.dirname(archive), 'ownership.json'), 'utf8'));
  const filters = ownedFilters(ownership);
  assert.equal(ownership.run_id, report.run_id);
  const mongo = require('../infrastructure/platformMongo');
  try {
    const db = await mongo.getMongoDatabase();
    assert.equal(crypto.createHash('sha256').update(`${process.env.MONGODB_URI}\n${db.databaseName}`).digest('hex'), report.target_fingerprint);
    for (const name of COLLECTIONS) assert.equal(await db.collection(name).countDocuments(filters[name]), 0, `Owned records remain in ${name}`);
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name);
    assert(!names.some(name => name.startsWith(`__backstage_restore_${report.run_id.replaceAll('-', '_')}_`)));
    const indexes = await db.collection('identity_invitations').listIndexes().toArray();
    for (const expected of mongo.INDEXES.identity_invitations) assert(indexes.some(index => JSON.stringify(index.key) === JSON.stringify(expected.key) && Boolean(index.unique) === Boolean(expected.options.unique)));
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), report.backup.sha256);
    const result = { checked_at: new Date().toISOString(), run_id: report.run_id, mode: 'fresh_process_read_only_postflight', status: 'passed', owned_test_records_remaining: 0, restored_temporary_collections_remaining: 0, invitation_indexes_verified: 3, private_backup_sha256_verified: true, writes: false };
    fs.writeFileSync(path.join(evidence, 'atlas-core-postflight.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally { await mongo.closeMongoConnection(); }
}
if (require.main === module) inspect().catch(error => { console.error(JSON.stringify({ status: 'failed', code: error.statusCode || error.code || error.name })); process.exitCode = 1; });
module.exports = { inspect };
