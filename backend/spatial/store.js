const { MongoClient } = require('mongodb');

const COLLECTIONS = Object.freeze({
  worlds: 'worlds',
  cells: 'territorial_cells',
  objects: 'spatial_objects',
  terrain: 'terrain_models',
  contours: 'contour_lines',
  roads: 'road_graphs',
  sources: 'source_registry',
  versions: 'spatial_versions',
  embeddings: 'territorial_embeddings',
  jobs: 'spatial_ingestion_jobs',
});

let atlasStoreSingleton = null;

function getMongoClient(uri, env = process.env) {
  if (!uri) return null;
  if (globalThis.__backstageAtlasClient && globalThis.__backstageAtlasClient.s.url === uri) {
    return globalThis.__backstageAtlasClient;
  }

  const client = new MongoClient(uri, {
    maxPoolSize: Number(env.MONGODB_MAX_POOL_SIZE || 20),
    minPoolSize: Number(env.MONGODB_MIN_POOL_SIZE || 0),
    connectTimeoutMS: Number(env.MONGODB_CONNECT_TIMEOUT_MS || 10000),
    serverSelectionTimeoutMS: Number(env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 15000),
  });

  globalThis.__backstageAtlasClient = client;
  return client;
}

async function getMongoHealthState(env = process.env) {
  const provider = String(env.SPATIAL_STORE || 'memory').toLowerCase();
  if (provider !== 'atlas') {
    return { status: 'disconnected', provider };
  }

  const uri = env.MONGODB_URI;
  if (!uri) {
    return { status: 'unavailable', provider };
  }

  try {
    const client = getMongoClient(uri, env);
    await client.connect();
    await client.db(env.MONGODB_SPATIAL_DB || 'backstage_spatial').command({ ping: 1 });
    return { status: 'healthy', provider };
  } catch (error) {
    return { status: 'unavailable', provider, error: error.message };
  }
}

function validateSpatialObject(input) {
  if (!input?.id || !input?.worldId || !input?.geometry?.type) {
    throw new TypeError('El objeto espacial requiere id, worldId y geometry.type.');
  }
  if (!Array.isArray(input.geometry.coordinates)) {
    throw new TypeError('geometry.coordinates debe ser un arreglo.');
  }
  return {
    ...input,
    version: Number(input.version || 1),
    confidence: input.confidence == null ? null : Number(input.confidence),
    updatedAt: new Date(),
  };
}

class MemorySpatialStore {
  constructor() {
    this.collections = new Map(Object.values(COLLECTIONS).map((name) => [name, new Map()]));
  }

  async initialize() {}

  async upsert(collection, document) {
    const key = document._id || document.id;
    if (!key) throw new TypeError('El documento requiere _id o id.');
    const stored = { ...document, _id: key };
    this.collections.get(collection).set(String(key), stored);
    return stored;
  }

  async get(collection, id) {
    return this.collections.get(collection).get(String(id)) || null;
  }

  async list(collection, filter = {}) {
    return [...this.collections.get(collection).values()].filter((document) =>
      Object.entries(filter).every(([key, value]) => document[key] === value));
  }

  async updateMany(collection, filter, patch) {
    let modifiedCount = 0;
    for (const [key, document] of this.collections.get(collection).entries()) {
      if (Object.entries(filter).every(([field, value]) => document[field] === value)) {
        this.collections.get(collection).set(key, { ...document, ...patch });
        modifiedCount += 1;
      }
    }
    return { modifiedCount };
  }

  async close() {}
}

class AtlasSpatialStore {
  constructor({ uri, dbName = 'backstage_spatial', client = null }) {
    if (!uri) throw new Error('MONGODB_URI es obligatorio cuando SPATIAL_STORE=atlas.');
    this.uri = uri;
    this.dbName = dbName;
    this.client = client || getMongoClient(uri, process.env);
    this.db = null;
  }

  async initialize() {
    if (!this.client) throw new Error('MongoDB client no disponible.');
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    await this.db.collection(COLLECTIONS.sources).dropIndex('provider_1_dataset_1_version_1')
      .catch((error) => { if (error.codeName !== 'IndexNotFound') throw error; });
    await Promise.all([
      this.db.collection(COLLECTIONS.cells).createIndex({ worldId: 1, level: 1, cellId: 1 }, { unique: true }),
      this.db.collection(COLLECTIONS.cells).createIndex({ boundsGeometry: '2dsphere' }),
      this.db.collection(COLLECTIONS.objects).createIndex({ worldId: 1, cellId: 1, objectType: 1 }),
      this.db.collection(COLLECTIONS.objects).createIndex({ geometry: '2dsphere' }),
      this.db.collection(COLLECTIONS.contours).createIndex({ worldId: 1, cellId: 1, elevationM: 1 }),
      this.db.collection(COLLECTIONS.sources).createIndex({ organizationId: 1, provider: 1, dataset: 1, version: 1 }, { unique: true }),
      this.db.collection(COLLECTIONS.jobs).createIndex({ organizationId: 1, createdAt: -1 }),
      this.db.collection(COLLECTIONS.versions).createIndex({ objectId: 1, version: -1 }, { unique: true }),
      this.db.collection(COLLECTIONS.embeddings).createIndex({ worldId: 1, cellId: 1, model: 1 }),
    ]);
  }

  collection(name) {
    if (!this.db) throw new Error('AtlasSpatialStore no ha sido inicializado.');
    return this.db.collection(name);
  }

  async upsert(collection, document) {
    const key = document._id || document.id;
    if (!key) throw new TypeError('El documento requiere _id o id.');
    const stored = { ...document, _id: String(key) };
    await this.collection(collection).replaceOne({ _id: stored._id }, stored, { upsert: true });
    return stored;
  }

  async get(collection, id) {
    return this.collection(collection).findOne({ _id: String(id) });
  }

  async list(collection, filter = {}, options = {}) {
    return this.collection(collection).find(filter).limit(Math.min(Number(options.limit) || 500, 5000)).toArray();
  }

  async updateMany(collection, filter, patch) {
    return this.collection(collection).updateMany(filter, { $set: patch });
  }

  async close() {
    if (this.client) await this.client.close();
    this.db = null;
  }
}

function createSpatialStore(env = process.env) {
  const provider = String(env.SPATIAL_STORE || 'memory').toLowerCase();
  if (provider === 'atlas') {
    const uri = env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI es obligatorio cuando SPATIAL_STORE=atlas.');
    const dbName = env.MONGODB_SPATIAL_DB || 'backstage_spatial';
    if (!atlasStoreSingleton || atlasStoreSingleton.uri !== uri || atlasStoreSingleton.dbName !== dbName) {
      atlasStoreSingleton = new AtlasSpatialStore({ uri, dbName, client: getMongoClient(uri, env) });
    }
    return atlasStoreSingleton;
  }
  if (provider !== 'memory') throw new Error(`SPATIAL_STORE no soportado: ${provider}`);
  return new MemorySpatialStore();
}

module.exports = {
  COLLECTIONS,
  validateSpatialObject,
  MemorySpatialStore,
  AtlasSpatialStore,
  createSpatialStore,
  getMongoClient,
  getMongoHealthState,
};
