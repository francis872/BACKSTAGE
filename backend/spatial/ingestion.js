const crypto = require('node:crypto');
const { COLLECTIONS, validateSpatialObject } = require('./store');
const { geometryBounds, tilesForGeometry, tileBounds, boundsIntersect } = require('./tiles');
const { simplifyGeometry, toleranceForZoom } = require('./simplify');

const SUPPORTED_GEOMETRIES = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);

function validateSource(input) {
  if (!input?.provider || !input?.dataset || !input?.version || !input?.license) {
    throw new TypeError('La fuente requiere provider, dataset, version y license.');
  }
  if (input.dataMode && !['measured', 'derived', 'declared', 'procedural'].includes(input.dataMode)) {
    throw new TypeError('dataMode no es válido.');
  }
  return { ...input, dataMode: input.dataMode || 'measured' };
}

function validateFeatureCollection(input, maxFeatures = 10000) {
  if (input?.type !== 'FeatureCollection' || !Array.isArray(input.features)) {
    throw new TypeError('Se requiere un GeoJSON FeatureCollection.');
  }
  if (input.features.length > maxFeatures) throw new RangeError(`La carga supera el máximo de ${maxFeatures} features.`);
  input.features.forEach((feature, index) => {
    if (feature?.type !== 'Feature' || !SUPPORTED_GEOMETRIES.has(feature?.geometry?.type)) {
      throw new TypeError(`Feature ${index} tiene una geometría no soportada.`);
    }
    const bounds = geometryBounds(feature.geometry);
    if (bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -90 || bounds[3] > 90) {
      throw new RangeError(`Feature ${index} contiene coordenadas fuera de WGS84.`);
    }
  });
  return input;
}

class SpatialIngestionPipeline {
  constructor(store) {
    this.store = store;
  }

  async registerSource(input) {
    const source = validateSource(input);
    const id = source.id || `${source.organizationId}:${source.provider}:${source.dataset}:${source.version}`;
    const document = { ...source, _id: id, status: source.status || 'active', ingestedAt: new Date() };
    return this.store.upsert(COLLECTIONS.sources, document);
  }

  async ingestGeoJSON({ organizationId, worldId, sourceId, collection, minZoom = 8, maxZoom = 12 }) {
    const source = await this.store.get(COLLECTIONS.sources, sourceId);
    if (!source || String(source.organizationId) !== String(organizationId)) throw new Error('Fuente no encontrada para la organización activa.');
    const geojson = validateFeatureCollection(collection);
    if (![minZoom, maxZoom].every(Number.isInteger) || minZoom < 0 || maxZoom > 22 || minZoom > maxZoom) {
      throw new TypeError('minZoom y maxZoom deben definir un rango entero entre 0 y 22.');
    }
    if (maxZoom - minZoom > 6) throw new RangeError('Una ingestión admite máximo siete niveles de zoom.');
    const jobId = crypto.randomUUID();
    const job = {
      _id: jobId, organizationId, worldId, sourceId, format: 'GeoJSON', minZoom, maxZoom,
      status: 'processing', featureCount: geojson.features.length, createdAt: new Date(),
    };
    await this.store.upsert(COLLECTIONS.jobs, job);
    try {
      const tileIds = new Set();
      for (let index = 0; index < geojson.features.length; index += 1) {
        const feature = geojson.features[index];
        const digest = crypto.createHash('sha256').update(JSON.stringify(feature.geometry)).digest('hex').slice(0, 20);
        const id = String(feature.id || `${sourceId}:${digest}:${index}`);
        const objectTiles = [];
        for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
          objectTiles.push(...tilesForGeometry(feature.geometry, zoom));
          if (objectTiles.length > 4096) throw new RangeError('Una geometría supera 4096 asignaciones multizoom.');
        }
        objectTiles.forEach((tileId) => tileIds.add(tileId));
        await this.store.upsert(COLLECTIONS.objects, validateSpatialObject({
          id, worldId, organizationId, sourceId, cellId: objectTiles[0], tileIds: objectTiles,
          objectType: feature.properties?.objectType || feature.geometry.type,
          geometry: feature.geometry, properties: feature.properties || {}, bounds: geometryBounds(feature.geometry),
          version: 1, confidence: source.confidence, status: 'active',
        }));
      }
      for (const tileId of tileIds) {
        const [z, x, y] = tileId.split('/').map(Number);
        await this.store.upsert(COLLECTIONS.cells, {
          _id: `${worldId}:${tileId}`, cellId: tileId, worldId, organizationId, level: z,
          bounds: tileBounds(z, x, y), updatedAt: new Date(),
        });
      }
      return this.store.upsert(COLLECTIONS.jobs, { ...job, status: 'completed', tileCount: tileIds.size, completedAt: new Date() });
    } catch (error) {
      await this.store.upsert(COLLECTIONS.jobs, { ...job, status: 'failed', error: error.message, completedAt: new Date() });
      throw error;
    }
  }

  async getTile({ organizationId, worldId, z, x, y }) {
    const id = `${z}/${x}/${y}`;
    const bounds = tileBounds(z, x, y);
    const objects = await this.store.list(COLLECTIONS.objects, { worldId, organizationId }, { limit: 5000 });
    const features = objects.filter((object) => object.status !== 'archived'
      && object.tileIds?.includes(id) && boundsIntersect(object.bounds, bounds))
      .map((object) => ({
        type: 'Feature', id: object.id, geometry: simplifyGeometry(object.geometry, toleranceForZoom(z)),
        properties: { ...object.properties, sourceId: object.sourceId, confidence: object.confidence },
      }));
    return { type: 'FeatureCollection', features, metadata: { worldId, tile: id, bounds, featureCount: features.length } };
  }

  listSources(organizationId) {
    return this.store.list(COLLECTIONS.sources, { organizationId });
  }

  listJobs(organizationId) {
    return this.store.list(COLLECTIONS.jobs, { organizationId });
  }

  async setSourceStatus({ organizationId, sourceId, status }) {
    if (!['active', 'archived'].includes(status)) throw new TypeError('status debe ser active o archived.');
    const source = await this.store.get(COLLECTIONS.sources, sourceId);
    if (!source || String(source.organizationId) !== String(organizationId)) throw new Error('Fuente no encontrada para la organización activa.');
    const updated = await this.store.upsert(COLLECTIONS.sources, { ...source, status, updatedAt: new Date() });
    const result = await this.store.updateMany(COLLECTIONS.objects, { organizationId, sourceId }, { status, updatedAt: new Date() });
    return { ...updated, affectedObjects: result.modifiedCount };
  }
}

module.exports = { SpatialIngestionPipeline, validateSource, validateFeatureCollection };
