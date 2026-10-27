const ApiError = require('../utils/ApiError');
const infrastructure = require('../infrastructure/platformMongo');
const { assetSources } = require('../repositories/assetSources.repository');
function positive(value, field) {
  if (!['number', 'string'].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new ApiError(400, `${field} inválido.`);
  return Number(value);
}
function page(value, fallback, max, field) {
  const n = value == null || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > max || field === 'limit' && n === 0) throw new ApiError(400, `${field} inválido.`);
  return n;
}
function publicAsset(row, origin) {
  const { _id, ...data } = row;
  const pair = row.geometry?.type === 'Point' ? row.geometry.coordinates : null;
  const provenance = { ...(row.metadata?.provenance || {}), data_type: row.metadata?.provenance?.data_type === 'REAL_VERIFIED' ? 'UNKNOWN' : row.metadata?.provenance?.data_type || 'UNKNOWN', validated: false, verified: false, quality: 'unassessed', access_scope: 'organization' };
  return { ...data, asset_id: `${origin}:${row.location_id}`, origin,
    source_record_id: row.location_id, location_id: origin === 'platform' ? row.location_id : null,
    latitude: pair?.[1] ?? row.latitude ?? null, longitude: pair?.[0] ?? row.longitude ?? null,
    metadata: { ...(row.metadata || {}), provenance }, provenance,
  };
}
function createAssetsService(infra = infrastructure) {
  async function list(organizationId, query = {}) {
    const org = positive(organizationId, 'organization_id');
    const limit = page(query.limit, 100, 500, 'limit'), offset = page(query.offset, 0, 10000, 'offset');
    const db = await infra.getMongoDatabase();
    const descriptors = await assetSources(db, org, query.origin);
    const filter = { organization_id: org, 'metadata.archived': { $ne: true } };
    const groups = await Promise.all(descriptors.map(async source => ({
      rows: (await db.collection(source.collection).find(filter).sort({ location_id: 1 }).limit(offset + limit).toArray()).map(row => publicAsset(row, source.origin)),
      count: await db.collection(source.collection).countDocuments(filter),
    })));
    // Source order plus native ID is stable; IDs from different stores cannot collide.
    const total = groups.reduce((sum, group) => sum + group.count, 0);
    // Fetching each source independently cannot skip an un-fetched prefix of the first source.
    const result = []; let remainingOffset = offset;
    for (const group of groups) {
      if (remainingOffset >= group.count) { remainingOffset -= group.count; continue; }
      result.push(...group.rows.slice(remainingOffset, remainingOffset + limit - result.length));
      remainingOffset = 0;
      if (result.length === limit) break;
    }
    return { data: result, pagination: { total, limit, offset, next: offset + result.length < total ? offset + result.length : null }, sources: descriptors.map(s => s.origin) };
  }
  async function get(organizationId, assetId) {
    if (typeof assetId !== 'string' || !/^(platform|soi):[1-9][0-9]*$/.test(assetId)) throw new ApiError(400, 'asset_id inválido.');
    const [origin, rawId] = assetId.split(':');
    const org = positive(organizationId, 'organization_id');
    const db = await infra.getMongoDatabase();
    const source = (await assetSources(db, org, origin))[0];
    const row = source && await db.collection(source.collection).findOne({ organization_id: org, location_id: positive(rawId, 'id'), 'metadata.archived': { $ne: true } });
    if (!row) throw new ApiError(404, 'Activo no disponible en la organización.');
    return publicAsset(row, origin);
  }
  async function create(context, input) {
    if (!['admin','analyst'].includes(context.role)) throw new ApiError(403,'Permiso denegado.');
    const data = { ...input, metadata: { ...(input?.metadata || {}), provenance: { data_type: 'ORGANIZATION_PROVIDED', validated: false, source: { name: 'Registro de la organización' }, actor_user_id: context.userId, recorded_at: new Date().toISOString() } } };
    const row = await infra.withMongoTransaction((database,session) => require('./locations.service').createLocation(data, positive(context.organizationId,'organization_id'), {database,session,nextId:infra.nextId,actor:positive(context.userId,'user_id')}));
    return publicAsset(row,'platform');
  }
  return { list, get, create };
}
module.exports = { createAssetsService, publicAsset, service: createAssetsService() };
