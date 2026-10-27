// Metadata/counts only, against the already authorized test connection.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
async function run() {
  const root = path.resolve(__dirname, '..'); require('../backend/node_modules/dotenv').config({ path: path.join(root, 'backend/.env'), quiet: true });
  const original = process.env.MONGODB_DB || process.env.MONGODB_SPATIAL_DB || 'backstage_spatial';
  const guard = JSON.parse(fs.readFileSync(path.join(root, '.vercel/backstage-staging-private.json'), 'utf8'));
  assert.equal(crypto.createHash('sha256').update(`${process.env.MONGODB_URI}\n${original}`).digest('hex'), guard.target_fingerprint);
  const mongo = require('../backend/infrastructure/platformMongo');
  try {
    const db = await mongo.getMongoDatabase({ requireSchema: false });
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(v => v.name);
    const collections = {};
    for (const name of ['locations', 'operational_events', 'soi_audit_events', 'identity_memberships']) collections[name] = { exists: names.includes(name), count: names.includes(name) ? await db.collection(name).countDocuments({}, { maxTimeMS: 10000 }) : 0 };
    const financial = names.includes('operational_events') ? await db.collection('operational_events').countDocuments({ kind: 'ph.record.version', 'ph.type': { $in: ['charge', 'payment', 'budget', 'expense'] } }, { maxTimeMS: 10000 }) : 0;
    const report = { audited_at: new Date().toISOString(), scope: 'authorized_test_database_metadata_only', collections, financial_versions: financial, sensitive_rows_read: false, mutations: false, production_changes: false, validation_policy: 'fresh_owned_synthetic_namespace_only' };
    fs.writeFileSync(path.join(root, 'docs/evidence/economics-data-audit.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } finally { await mongo.closeMongoConnection(); }
}
run().catch(e => { console.error(JSON.stringify({ failed: true, name: e.name })); process.exitCode = 1; });
