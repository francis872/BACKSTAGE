const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const ApiError = require('../utils/ApiError');
const catalog = require('./data/catalog.json');

/** Immutable artifact adapter. Replace this adapter for object storage/worker jobs. */
class ArtifactRepository {
  constructor({ root = path.join(__dirname, 'data'), entries = catalog.cases, bindings = null } = {}) {
    this.root = path.resolve(root);
    this.entries = entries;
    this.bindings = bindings;
    this.cache = new Map();
  }

  async ownerBindings() {
    if (this.bindings) return this.bindings;
    if (process.env.CLEAN_COM_BINDINGS_JSON) {
      try { return JSON.parse(process.env.CLEAN_COM_BINDINGS_JSON); }
      catch { throw new ApiError(503, 'La vinculación del archivo histórico SOI necesita revisión.'); }
    }
    try { return JSON.parse(await fs.readFile(path.join(this.root, 'bindings.json'), 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new ApiError(503, 'La vinculación del archivo histórico SOI no está disponible.');
    }
  }

  async allowedEntries(organizationId) {
    if (!Number.isSafeInteger(Number(organizationId)) || Number(organizationId) <= 0) return [];
    const bindings = await this.ownerBindings();
    return this.entries.filter((entry) => entry.accessScope === 'shared_authenticated'
      || (Array.isArray(bindings[entry.id])
      && bindings[entry.id].some((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0 && String(id) === String(organizationId))));
  }

  async authorizedEntry(organizationId, caseId) {
    const entry = (await this.allowedEntries(organizationId)).find((row) => row.id === caseId);
    if (!entry) throw new ApiError(404, 'Caso no disponible en esta organización.');
    return entry;
  }

  artifactPath(entry, file) {
    const resolved = path.resolve(this.root, entry.artifactDirectory, file);
    const caseRoot = path.resolve(this.root, entry.artifactDirectory);
    if (!caseRoot.startsWith(this.root + path.sep) || !resolved.startsWith(caseRoot + path.sep)) throw new ApiError(503, 'Referencia de datos inválida.');
    return resolved;
  }

  async audit(organizationId, caseId) {
    const entry = await this.authorizedEntry(organizationId, caseId);
    try {
      const report = JSON.parse(await fs.readFile(this.artifactPath(entry, 'audit.json'), 'utf8'));
      if (report.schema !== 'clean-com/audit-v1' || report.case?.id !== caseId || !report.complete) throw Error('Incomplete audit');
      return report;
    } catch { throw new ApiError(503, 'La auditoría de este caso todavía no está disponible.'); }
  }

  async collection(organizationId, caseId, layerId) {
    const audit = await this.audit(organizationId, caseId);
    const layer = audit.layers.find((item) => item.id === layerId);
    if (!layer) throw new ApiError(404, 'Capa no encontrada.');
    if (!layer.preview?.file) throw new ApiError(422, 'Esta tabla no tiene geometría para mostrar en el mapa.');
    const cacheKey = `${caseId}:${layerId}:${layer.preview.sha256}`;
    if (this.cache.has(cacheKey)) return { audit, layer, collection: this.cache.get(cacheKey) };
    const entry = await this.authorizedEntry(organizationId, caseId);
    try {
      const data = await fs.readFile(this.artifactPath(entry, layer.preview.file));
      if (crypto.createHash('sha256').update(data).digest('hex') !== layer.preview.sha256) throw Error('Checksum mismatch');
      const collection = JSON.parse(gunzipSync(data, { maxOutputLength: 32 * 1024 * 1024 }).toString('utf8'));
      if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features) || collection.features.length !== layer.preview.count) throw Error('Invalid collection');
      this.cache.set(cacheKey, collection);
      while (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value);
      return { audit, layer, collection };
    } catch { throw new ApiError(503, 'La vista geográfica no superó la comprobación de integridad.'); }
  }
}

module.exports = { ArtifactRepository };
