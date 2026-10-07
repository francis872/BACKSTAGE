const { COLLECTIONS, validateSpatialObject } = require('./store');

class WorldModel {
  constructor(store) {
    this.store = store;
  }

  async createWorld(input) {
    if (!input?.id || !input?.name) throw new TypeError('El mundo requiere id y name.');
    return this.store.upsert(COLLECTIONS.worlds, {
      _id: input.id,
      name: input.name,
      coordinateSystem: input.coordinateSystem || 'WGS84+BACKSTAGE_LOCAL',
      version: Number(input.version || 1),
      status: input.status || 'draft',
      updatedAt: new Date(),
    });
  }

  async upsertCell(input) {
    if (!input?.cellId || !input?.worldId || !Array.isArray(input.bounds) || input.bounds.length !== 4) {
      throw new TypeError('La celda requiere cellId, worldId y bounds.');
    }
    const [minLng, minLat, maxLng, maxLat] = input.bounds.map(Number);
    const ring = [[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]];
    return this.store.upsert(COLLECTIONS.cells, {
      ...input,
      _id: input.cellId,
      boundsGeometry: { type: 'Polygon', coordinates: [ring] },
      version: Number(input.version || 1),
      updatedAt: new Date(),
    });
  }

  async upsertSpatialObject(input) {
    const document = validateSpatialObject(input);
    const previous = await this.store.get(COLLECTIONS.objects, document.id);
    if (previous) {
      await this.store.upsert(COLLECTIONS.versions, {
        _id: `${document.id}:${previous.version}`,
        objectId: document.id,
        version: previous.version,
        snapshot: previous,
        archivedAt: new Date(),
      });
    }
    return this.store.upsert(COLLECTIONS.objects, { ...document, _id: document.id });
  }

  async registerSource(input) {
    if (!input?.provider || !input?.dataset || !input?.version) {
      throw new TypeError('La fuente requiere provider, dataset y version.');
    }
    const id = input.id || `${input.provider}:${input.dataset}:${input.version}`;
    return this.store.upsert(COLLECTIONS.sources, {
      ...input,
      _id: id,
      observedAt: input.observedAt || null,
      ingestedAt: new Date(),
    });
  }
}

module.exports = WorldModel;
