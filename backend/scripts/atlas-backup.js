// Logical backup of ALL accessible user databases. Never restores over a source DB.
// Keys and ciphertext are deliberately separate and ignored by source packaging.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { MongoClient, BSON } = require('mongodb');
const root = path.resolve(__dirname, '../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const SYSTEM = new Set(['admin', 'config', 'local']);
const MAX_BYTES = 64 * 1024 * 1024; // Fail closed rather than silently truncate a larger database.
const rawOptions = { promoteValues: false, promoteLongs: false, bsonRegExp: true };
function encrypt(bytes, key) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from('BKB1'), iv, cipher.getAuthTag(), body]);
}
function decrypt(bytes, key) {
  assert.equal(bytes.subarray(0, 4).toString(), 'BKB1');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(4, 16));
  cipher.setAuthTag(bytes.subarray(16, 32));
  return Buffer.concat([cipher.update(bytes.subarray(32)), cipher.final()]);
}
function restoreIndex(index) {
  const { key, v, ns, expireAfterSeconds, ...options } = index;
  // No TTL deletion during a restore verification; retain the original definition in the backup.
  return { key, options };
}
function inventoryShape(inventory) {
  return BSON.EJSON.stringify(inventory.map(db => ({ name: db.name, collections: db.collections.map(c => ({ name: c.name, type: c.type, options: c.options, indexes: c.indexes })) })), { relaxed: false });
}
async function inventory(client) {
  const names = (await client.db('admin').admin().listDatabases({ nameOnly: true, authorizedDatabases: true })).databases.map(d => d.name).filter(n => !SYSTEM.has(n)).sort();
  assert(names.length > 0, 'No user databases found');
  const databases = [];
  for (const name of names) {
    assert(!name.startsWith('backstage_restore_') && !name.startsWith('bs_restore_'), 'An earlier isolated restore needs review before another backup');
    const db = client.db(name), collections = [];
    const rows = (await db.listCollections({}, { nameOnly: false }).toArray()).sort((a, b) => a.name.localeCompare(b.name));
    for (const row of rows) {
      assert.equal(row.type, 'collection', 'Views need a dedicated backup implementation');
      assert(!row.options?.timeseries && !row.options?.encryptedFields && !row.options?.capped, 'Unsupported collection type; no partial backup permitted');
      collections.push({ name: row.name, type: row.type, options: row.options || {}, indexes: (await db.collection(row.name).listIndexes().toArray()).sort((a, b) => a.name.localeCompare(b.name)) });
    }
    databases.push({ name, collections });
  }
  return databases;
}
async function run({ restore = false } = {}) {
  const mongo = require('../infrastructure/platformMongo');
  const { configureMongoDns } = require('../infrastructure/mongoDns');
  const runId = `atlas-full-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomBytes(6).toString('hex')}`;
  const directory = path.join(root, '.vercel', runId), keyDirectory = path.join(root, '.vercel', 'atlas-backup-keys');
  const report = { run_id: runId, started_at: new Date().toISOString(), scope: 'all_accessible_user_databases_all_collections', system_databases_excluded: ['admin', 'config', 'local'], cluster_configuration_and_atlas_users_included: false, managed_snapshot_or_pitr: false, source_writes: 0, restore_requested: restore, checks: [] };
  const progress = stage => console.log(JSON.stringify({ stage, run_id: runId }));
  let client, session; const created = [];
  try {
    const configured = await mongo.getMongoDatabase();
    report.target_fingerprint = hash(`${process.env.MONGODB_URI}\n${configured.databaseName}`);
    const staging = JSON.parse(fs.readFileSync(path.join(root, '.vercel/backstage-staging-private.json'), 'utf8'));
    assert.equal(report.target_fingerprint, staging.target_fingerprint, 'Only the confirmed Atlas test connection is authorized');
    client = new MongoClient(process.env.MONGODB_URI, { ...configureMongoDns(), appName: 'backstage-authorized-full-backup', maxPoolSize: 5, serverSelectionTimeoutMS: 15000 });
    await client.connect();
    const before = await inventory(client);
    assert(before.some(d => d.name === configured.databaseName));
    session = client.startSession({ snapshot: true });
    let bytes = 0, documents = 0;
    for (const database of before) for (const collection of database.collections) {
      collection.documents = [];
      const digest = crypto.createHash('sha256');
      for await (const raw of client.db(database.name).collection(collection.name).find({}, { session, raw: true, sort: { _id: 1 }, maxTimeMS: 15000 })) {
        assert(Buffer.isBuffer(raw), 'Raw BSON required'); bytes += raw.length;
        assert(bytes <= MAX_BYTES, 'Backup exceeds guarded 64 MiB limit; use managed backup or database tools');
        digest.update(raw); collection.documents.push(raw); documents++;
      }
      collection.sha256 = digest.digest('hex');
    }
    report.snapshot_at_cluster_time = BSON.EJSON.serialize(session.snapshotTime, { relaxed: false });
    assert(session.snapshotTime, 'A shared snapshot time is required for a coherent backup');
    await session.endSession(); session = null;
    assert.equal(inventoryShape(await inventory(client)), inventoryShape(before), 'DDL changed during backup; refuse certification');
    report.databases = before.length; report.collections = before.reduce((n, d) => n + d.collections.length, 0);
    report.documents = documents; report.bson_document_bytes = bytes;
    report.indexes = before.reduce((n, d) => n + d.collections.reduce((v, c) => v + c.indexes.length, 0), 0);
    const envelope = BSON.serialize({ format: 'backstage-atlas-logical-backup-1', run_id: runId, target_fingerprint: report.target_fingerprint, snapshot_at_cluster_time: report.snapshot_at_cluster_time, databases: before });
    const key = crypto.randomBytes(32), encrypted = encrypt(envelope, key);
    fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(keyDirectory, { recursive: true });
    const backupFile = path.join(directory, 'data.bson.aes256gcm'), keyFile = path.join(keyDirectory, `${runId}.key`);
    fs.writeFileSync(keyFile, key, { mode: 0o600, flag: 'wx' }); fs.writeFileSync(backupFile, encrypted, { mode: 0o600, flag: 'wx' });
    assert.equal(hash(decrypt(fs.readFileSync(backupFile), fs.readFileSync(keyFile))), hash(envelope));
    const damaged = Buffer.from(encrypted); damaged[damaged.length - 1] ^= 1;
    assert.throws(() => decrypt(damaged, key));
    report.backup = { private_file: path.relative(root, backupFile).replaceAll('\\', '/'), sha256: hash(encrypted), plaintext_sha256: hash(envelope), key_storage: 'separate_private_directory_not_packaged', encrypted: 'AES-256-GCM', readback_verified: true, tamper_rejected: true };
    report.checks.push('all_user_databases_inventoried', 'shared_snapshot_time', 'unchanged_collection_and_index_metadata', 'encrypted_backup_readback', 'authenticated_encryption_tamper_rejected');
    fs.writeFileSync(path.join(directory, 'backup-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(root, '.vercel/atlas-full-latest.json'), JSON.stringify({ run_id: runId, directory: path.relative(root, directory).replaceAll('\\', '/') }, null, 2), { mode: 0o600 });
    progress('complete_encrypted_backup_saved');
    if (restore) {
      // Decode the saved ciphertext with its saved key in memory, not the original objects.
      const saved = BSON.deserialize(decrypt(fs.readFileSync(backupFile), fs.readFileSync(keyFile)), { promoteBuffers: true });
      assert.equal(saved.run_id, runId); assert.equal(saved.target_fingerprint, report.target_fingerprint);
      const names = (await client.db('admin').admin().listDatabases({ nameOnly: true })).databases.map(d => d.name);
      // Atlas shared tiers cap database names at 38 bytes (stricter than MongoDB's 63).
      const prefix = `bs_restore_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_${crypto.randomBytes(4).toString('hex')}_`;
      let restoredCollections = 0, restoredDocuments = 0, ttl = 0;
      for (const [ordinal, source] of saved.databases.entries()) {
        const name = prefix + ordinal; assert(Buffer.byteLength(name) <= 38 && !names.includes(name)); assert(!before.some(d => d.name === name));
        const db = client.db(name);
        // Persist exact ownership before the first creation, including the unpredictable prefix.
        created.push(name); fs.writeFileSync(path.join(directory, 'restore-ownership.json'), JSON.stringify({ run_id: runId, prefix, databases: created, source_databases: before.map(d => d.name) }, null, 2), { mode: 0o600 });
        for (const collection of source.collections) {
          await db.createCollection(collection.name, collection.options);
          const target = db.collection(collection.name);
          if (collection.documents.length) await target.insertMany(collection.documents.map(raw => BSON.deserialize(raw, rawOptions)), { ordered: true, bypassDocumentValidation: true });
          for (const index of collection.indexes) {
            if (index.expireAfterSeconds != null) ttl++;
            if (index.name !== '_id_') { const definition = restoreIndex(index); await target.createIndex(definition.key, definition.options); }
          }
          const actual = (await target.listIndexes().toArray()).sort((a, b) => a.name.localeCompare(b.name));
          assert.equal(actual.length, collection.indexes.length);
          for (const [i, index] of collection.indexes.entries()) assert.deepEqual(restoreIndex(actual[i]), restoreIndex(index), 'Restored index mismatch');
          const metadata = await db.listCollections({ name: collection.name }, { nameOnly: false }).next();
          assert.deepEqual(metadata.options || {}, collection.options);
          let count = 0; const digest = crypto.createHash('sha256');
          for await (const raw of target.find({}, { raw: true, sort: { _id: 1 } })) { digest.update(raw); count++; }
          assert.equal(count, collection.documents.length); assert.equal(digest.digest('hex'), collection.sha256, 'Restored BSON differs');
          restoredCollections++; restoredDocuments += count;
          if (restoredCollections % 10 === 0) progress(`isolated_collections_verified_${restoredCollections}`);
        }
      }
      assert.equal(restoredCollections, report.collections); assert.equal(restoredDocuments, report.documents);
      report.restore = { isolated_databases: created.length, collections_verified: restoredCollections, documents_verified: restoredDocuments, indexes_verified: report.indexes, original_bson_bytes_verified: true, collection_options_verified: true, ttl_indexes_suspended_for_verification: ttl, source_routing_changed: false };
      report.checks.push('restore_from_saved_ciphertext', 'isolated_database_names', 'all_document_bson_hashes_equal', 'collection_options_and_indexes_equal_except_ttl_disabled');
      // Drop only exact, freshly created scratch DBs, never a source database.
      const owned = JSON.parse(fs.readFileSync(path.join(directory, 'restore-ownership.json'), 'utf8'));
      assert.equal(owned.run_id, runId); assert.deepEqual(owned.databases, created);
      for (const name of created) { assert(name.startsWith(owned.prefix) && /^bs_restore_\d{14}_[a-f0-9]{8}_\d+$/.test(name)); assert(!owned.source_databases.includes(name)); await client.db(name).dropDatabase(); }
      const remaining = (await client.db('admin').admin().listDatabases({ nameOnly: true })).databases.map(d => d.name);
      assert(created.every(name => !remaining.includes(name))); report.restore.isolated_databases_remaining = 0;
      report.checks.push('scratch_databases_removed_source_untouched');
    }
    report.status = restore ? 'backup_and_isolated_restore_passed' : 'backup_passed';
  } catch (error) { report.status = 'failed'; report.failure = { name: error.name, code: error.code || null }; report.isolated_databases_needing_review = created.length; throw error; }
  finally {
    report.completed_at = new Date().toISOString();
    await session?.endSession(); await client?.close(); await mongo.closeMongoConnection();
    fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'validation-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(root, 'docs/backstage-2.0/evidence', process.argv.includes('--release') ? 'production-atlas-backup.json' : 'readiness-atlas-backup.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
}
if (require.main === module) {
  if (!process.argv.includes('--test-environment') || !process.argv.includes('--apply')) console.log(JSON.stringify({ mode: 'plan_only', scope: 'all_accessible_user_databases', source_writes: 0, restore: 'fresh_isolated_database_per_source', command: 'node backend/scripts/atlas-backup.js --test-environment --apply --restore' }));
  else run({ restore: process.argv.includes('--restore') }).catch(error => { console.error(JSON.stringify({ failed: true, name: error.name, code: error.code || null })); process.exitCode = 1; });
}
module.exports = { encrypt, decrypt, restoreIndex, run };
