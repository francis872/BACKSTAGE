// Build-time, read-only inspection. No secrets, records or database names in logs.
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { getMongoDatabase, closeMongoConnection, SCHEMA_VERSION } = require('../infrastructure/platformMongo');

async function main() {
  assert(process.env.MONGODB_URI?.startsWith('mongodb+srv://'), 'Atlas connection required');
  assert.equal(process.env.SPATIAL_STORE, 'atlas');
  assert.equal(process.env.BACKSTAGE_DATA_STORE, 'mongodb');
  assert.equal(process.env.NODE_ENV, 'production');
  assert(process.env.JWT_SECRET?.length >= 32, 'Existing JWT secret required');
  assert(process.env.SOI_SCIENCE_RPC_SECRET?.length >= 32, 'Existing RPC secret required');
  assert.equal(process.env.SOI_SCIENCE_RPC_URL, 'self');
  const db = await getMongoDatabase();
  await db.command({ ping: 1, maxTimeMS: 5000 });
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const required = ['soi_schema_versions', 'identity_users', 'identity_organizations', 'identity_memberships', 'soi_provider_locks'];
  for (const name of required) assert(collections.some(c => c.name === name), 'Required collection unavailable');
  const fingerprint = crypto.createHash('sha256').update(`${process.env.MONGODB_URI}\n${db.databaseName}`).digest('hex');
  console.log('BACKSTAGE_RELEASE_PREFLIGHT ' + JSON.stringify({
    checked_at: new Date().toISOString(), passed: true, target_fingerprint: fingerprint,
    schema_version: SCHEMA_VERSION, collections: collections.length, source_writes: 0,
    store: 'mongodb_atlas', existing_credentials_preserved: true,
  }));
}

if (require.main === module) main().catch(error => {
  console.error('BACKSTAGE_RELEASE_PREFLIGHT ' + JSON.stringify({ passed: false, code: error.code || 'CONFIGURATION_OR_ATLAS_CHECK_FAILED' }));
  process.exitCode = 1;
}).finally(closeMongoConnection);
module.exports = { main };
