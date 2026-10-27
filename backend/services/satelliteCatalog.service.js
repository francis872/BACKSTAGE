const ApiError = require('../utils/ApiError');
const C = require('../domain/computationalContract');
const { currentActor } = require('./resourceAuthorization.service');
const ENDPOINT = 'https://earth-search.aws.element84.com/v1';
const COLLECTIONS = Object.freeze({ sentinel: 'sentinel-2-l2a', landsat: 'landsat-c2-l2' });
function searchInput(input) {
  C.object(input, ['provider', 'bbox', 'start', 'end', 'limit', 'max_cloud_cover']);
  if (!Object.hasOwn(COLLECTIONS, input.provider)) C.fail('Selecciona sentinel o landsat.');
  const bbox = input.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some(x => typeof x !== 'number' || !Number.isFinite(x)) || bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90 || bbox[0] >= bbox[2] || bbox[1] >= bbox[3] || bbox[2] - bbox[0] > 2 || bbox[3] - bbox[1] > 2) C.fail('La extensión requiere [oeste,sur,este,norte], hasta dos grados por eje y sin cruzar el antimeridiano.');
  const dates = [input.start, input.end].map(value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) ? Date.parse(value) : NaN);
  if (dates.some((x,i) => !Number.isFinite(x) || new Date(x).toISOString().slice(0,19) !== [input.start,input.end][i].slice(0,19)) || dates[1] < dates[0] || dates[1] - dates[0] > 366 * 86400000) C.fail('Indica fechas UTC válidas y un intervalo máximo de 366 días.');
  const limit = C.integer(input.limit ?? 10, 1, 20, 'Límite de escenas');
  const cloud = input.max_cloud_cover ?? 100;
  if (typeof cloud !== 'number' || !Number.isFinite(cloud) || cloud < 0 || cloud > 100) C.fail('La nubosidad debe estar entre 0 y 100.');
  return { provider: input.provider, collection: COLLECTIONS[input.provider], bbox, start: new Date(dates[0]).toISOString(), end: new Date(dates[1]).toISOString(), limit, cloud };
}
async function boundedJson(response) {
  if (!response.ok) throw new ApiError(503, 'El catálogo satelital no está disponible.');
  const chunks = []; let size = 0;
  for await (const bytes of response.body) {
    const chunk = Buffer.from(bytes); size += chunk.length;
    if (size > 3000000) throw new ApiError(503, 'La respuesta del catálogo supera el límite permitido.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(503, 'El catálogo devolvió una respuesta inválida.'); }
}
function createEarthSearchClient({ fetchImpl = fetch, now = Date.now } = {}) {
  async function request(path, options = {}) {
    try { return await boundedJson(await fetchImpl(ENDPOINT + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/geo+json,application/json', ...(options.headers || {}) } })); }
    catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, 'No se pudo consultar el catálogo satelital.'); }
  }
  async function search(input) {
    const normalized = searchInput(input);
    const { collection, limit, cloud, bbox, start, end } = normalized;
    const [metadata, payload] = await Promise.all([
      request(`/collections/${collection}`),
      request('/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: [collection], bbox, datetime: `${start}/${end}`, limit, query: { 'eo:cloud_cover': { lte: cloud } } }) }),
    ]);
    if (metadata.id !== collection || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features) || payload.features.length > limit) throw new ApiError(503, 'El catálogo devolvió una colección incompatible.');
    const features = payload.features.map(feature => {
      if (feature.type !== 'Feature' || feature.collection !== collection || typeof feature.id !== 'string' || feature.id.length > 500 || !feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) throw new ApiError(503, 'Escena satelital inválida.');
      // Return footprints and catalog metadata only. Never fetch remote assets or follow pagination links.
      const properties = feature.properties || {};
      const observedAt = properties.datetime || properties.start_datetime || null;
      if (!observedAt || !Number.isFinite(Date.parse(observedAt))) throw new ApiError(503, 'La escena no tiene fecha de adquisición válida.');
      let footprint;
      try { footprint = require('../domain/geometry').geometry(feature.geometry); } catch { throw new ApiError(503, 'La escena tiene una huella geográfica inválida.'); }
      return { type: 'Feature', id: feature.id, geometry: footprint, properties: {
        collection, acquired_at: observedAt, cloud_cover_pct: Number.isFinite(properties['eo:cloud_cover']) ? properties['eo:cloud_cover'] : null,
        resolution_m: Number.isFinite(properties.gsd) ? properties.gsd : null,
        platform: typeof properties.platform === 'string' ? properties.platform.slice(0, 200) : null,
        license: typeof metadata.license === 'string' ? metadata.license : null,
        catalog_item_url: `${ENDPOINT}/collections/${collection}/items/${encodeURIComponent(feature.id)}`,
        data_kind: 'EXTERNAL_API', evidence_kind: 'satellite_scene_metadata', quality: 'provider_declared_not_independently_verified', uncertainty_m: null,
      } };
    });
    return { type: 'FeatureCollection', features, provenance: { provider: 'Element 84 Earth Search', endpoint: ENDPOINT, collection, queried_at: new Date(now()).toISOString(), query: normalized,
      license: typeof metadata.license === 'string' ? metadata.license : null, scope: 'catalog_metadata_and_footprints_only', imagery_downloaded: false, raster_analysis_performed: false,
      pagination_followed: false, returned: features.length, source_certified: false, map: 'existing_explorer' } };
  }
  return { search };
}
function createSatelliteCatalog({ infrastructure = require('../infrastructure/platformMongo'), fetchImpl = fetch, now = Date.now } = {}) {
  const client=createEarthSearchClient({fetchImpl,now});
  return {async search(context,input){
    searchInput(input);
    const db=await infrastructure.getMongoDatabase(),actor=await currentActor(db,undefined,context);
    if(!['admin','analyst'].includes(actor.role))throw new ApiError(403,'La consulta satelital requiere administrador o analista vigente.');
    return client.search(input);
  }};
}
module.exports = { searchInput, boundedJson, createSatelliteCatalog, createEarthSearchClient, ENDPOINT, COLLECTIONS };
