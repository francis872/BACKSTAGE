const path = require('node:path');
const ApiError = require('../utils/ApiError');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { getMongoClient } = require('../spatial/store');
const SCHEMA_VERSION = 2;
const { INDEXES } = require('./mongoIndexRegistry');
let connected = null;
function cleanDocument(document) {
  if (!document) return document;
  const { _id, ...value } = document;
  return value;
}
async function getMongoDatabase({ requireSchema = true } = {}) {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new ApiError(503, 'La persistencia de BACKSTAGE no está configurada. Contacta al administrador.');
  const name = process.env.MONGODB_DB || process.env.MONGODB_SPATIAL_DB || 'backstage_spatial';
  if (!connected || connected.uri !== uri || connected.name !== name) {
    const client = getMongoClient(uri);
    connected = { uri, name, client, promise: client.connect().then(() => client.db(name)) };
  }
  let db;
  try { db = await connected.promise; }
  catch (cause) { connected = null; const error=new ApiError(503, 'MongoDB no está disponible. Verifica la conexión autorizada.');error.diagnostic={name:cause.name,code:cause.code||cause.cause?.code||'MONGO_CONNECTION_FAILED'};throw error; }
  if (requireSchema) {
    const schema = await db.collection('soi_schema_versions').findOne({ _id: 'soi', version: SCHEMA_VERSION });
    if (!schema) throw new ApiError(503, 'La persistencia de BACKSTAGE no está preparada. Contacta al administrador.');
  }
  return db;
}
async function withMongoTransaction(operation) {
  const db = await getMongoDatabase();
  const client = connected.client;
  const session = client.startSession();
  try {
    return await session.withTransaction(() => operation(db, session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
  } catch (error) {
    if (error.code === 20 || error.codeName === 'IllegalOperation') throw new ApiError(503, 'BACKSTAGE requiere MongoDB Atlas o replica set para confirmar operaciones atómicas.');
    throw error;
  } finally { await session.endSession(); }
}
async function nextId(kind, session) {
  if (!Object.hasOwn(INDEXES, kind) || kind === 'soi_counters') throw new ApiError(400, 'Secuencia de identificadores inválida.');
  const db = await getMongoDatabase();
  const value = await db.collection('soi_counters').findOneAndUpdate({ _id: kind }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after', includeResultMetadata: false, session });
  if (!Number.isSafeInteger(value?.value) || value.value <= 0) throw new ApiError(503, 'No se pudo asignar un identificador persistente.');
  return value.value;
}
async function initializeMongo({ apply = false, database } = {}) {
  if (!apply) return { mode: 'plan', version: SCHEMA_VERSION, destructive: false, indexes: INDEXES };
  const db = database || await getMongoDatabase({ requireSchema: false });
  for (const [collection, definitions] of Object.entries(INDEXES)) {
    const existing = await db.listCollections({ name: collection }, { nameOnly: true }).toArray();
    if (!existing.length) await db.createCollection(collection);
    for (const definition of definitions) await db.collection(collection).createIndex(definition.key, definition.options);
  }
  await db.collection('soi_schema_versions').updateOne({ _id: 'soi' }, { $set: { version: SCHEMA_VERSION, initialized_at: new Date() } }, { upsert: true });
  return { mode: 'applied', version: SCHEMA_VERSION, collections: Object.keys(INDEXES), deletedRecords: 0 };
}
async function closeMongoConnection() {
  if (connected) await connected.client.close();
  connected = null;
}
module.exports = { getMongoDatabase, withMongoTransaction, nextId, cleanDocument, initializeMongo, INDEXES, SCHEMA_VERSION, closeMongoConnection };
