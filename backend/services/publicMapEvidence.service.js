const ApiError = require('../utils/ApiError');

function distanceM(a, b) {
  const rad = (v) => v * Math.PI / 180;
  const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function nearbyTiles(coordinates, radiusM) {
  const [lng, lat] = coordinates;
  if (Math.abs(lat) > 85) throw new ApiError(503, 'La fuente vectorial no cubre esta latitud.');
  const z = Math.max(0, Math.min(14, Math.floor(Math.log2(40075016.686 * Math.cos(lat * Math.PI / 180) / radiusM))));
  const n = 2 ** z;
  const x = Math.floor((lng + 180) / 360 * n);
  const y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  const tiles = new Map();
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const px = ((x + dx) % n + n) % n;
    const py = Math.max(0, Math.min(n - 1, y + dy));
    tiles.set(`${z}/${px}/${py}`, { z, x: px, y: py });
  }
  return [...tiles.values()];
}
function category(properties) {
  const values = [properties.class, properties.subclass];
  if (values.some((v) => ['hospital', 'clinic', 'doctors', 'pharmacy', 'dentist'].includes(v))) return 'health';
  if (values.some((v) => ['school', 'university', 'college', 'kindergarten'].includes(v))) return 'education';
  if (values.some((v) => ['bus', 'bus_stop', 'bus_station', 'railway', 'station', 'halt', 'subway', 'tram_stop', 'ferry_terminal'].includes(v))) return 'transport';
  if (values.some((v) => ['park', 'garden', 'nature_reserve'].includes(v))) return 'parks';
  return 'other';
}
async function decodeTile(bytes, tile) {
  const [{ VectorTile }, { PbfReader }] = await Promise.all([import('@mapbox/vector-tile'), import('pbf')]);
  const decoded = new VectorTile(new PbfReader(bytes));
  const layer = decoded.layers.poi;
  const rows = [];
  for (let i = 0; i < Math.min(layer?.length || 0, 10000); i++) {
    const feature = layer.feature(i);
    if (feature.type !== 1) continue;
    const geo = feature.toGeoJSON(tile.x, tile.y, tile.z);
    if (geo.geometry.type !== 'Point') continue;
    const properties = feature.properties;
    rows.push({ type: 'Feature', id: String(feature.id ?? `${properties.name}:${geo.geometry.coordinates}`), geometry: geo.geometry,
      properties: { name: properties.name || properties['name:latin'] || properties.name_en || properties.subclass || properties.class || 'Lugar cartografiado',
        class: properties.class || null, subclass: properties.subclass || null, category: category(properties), source: 'OpenStreetMap · OpenMapTiles · OpenFreeMap' } });
  }
  return rows;
}
function createPublicMapEvidenceService({ fetchImpl = globalThis.fetch, now = Date.now, decode = decodeTile } = {}) {
  let metadata;
  let metadataTask;
  const cache = new Map();
  const pending = new Map();
  async function getMetadata() {
    if (metadata && now() - metadata.at < 3600000) return metadata.data;
    if (metadataTask) return metadataTask;
    metadataTask = (async () => {
      const response = await fetchImpl('https://tiles.openfreemap.org/planet', { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new ApiError(503, 'La fuente del mapa no está disponible.');
      const data = await response.json();
      const template = data.tiles?.[0];
      if (typeof template !== 'string' || !template.startsWith('https://tiles.openfreemap.org/planet/') || !template.includes('{z}/{x}/{y}')) throw new ApiError(503, 'La fuente del mapa no publicó teselas válidas.');
      metadata = { at: now(), data };
      return data;
    })().finally(() => { metadataTask = null; });
    return metadataTask;
  }
  async function load(template, tile) {
    const url = template.replace('{z}', tile.z).replace('{x}', tile.x).replace('{y}', tile.y);
    if (cache.has(url)) return cache.get(url);
    if (pending.has(url)) return pending.get(url);
    const task = (async () => {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new ApiError(503, 'Una tesela pública no respondió.');
      if (Number(response.headers?.get('content-length')) > 2000000) throw new ApiError(503, 'La tesela excede el límite de consulta.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 2000000) throw new ApiError(503, 'La tesela excede el límite de consulta.');
      const rows = await decode(bytes, tile);
      cache.set(url, rows);
      while (cache.size > 32) cache.delete(cache.keys().next().value);
      return rows;
    })().finally(() => pending.delete(url));
    pending.set(url, task);
    return task;
  }
  async function mapContext(lat, lng, radiusM = 1200) {
    if ([lat, lng].some((value) => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)))
      || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180 || !Number.isFinite(Number(radiusM)) || Number(radiusM) < 100 || Number(radiusM) > 5000) {
      throw new ApiError(400, 'Coordenadas y radio de consulta inválidos.');
    }
    const coordinates = [Number(lng), Number(lat)];
    const radius = Number(radiusM);
    const tiles = nearbyTiles(coordinates, radius);
    const data = await getMetadata();
    const found = [];
    let failures = 0;
    let succeeded = 0;
    // At most nine static tiles, three concurrent downloads, all clipped to the requested radius.
    let index = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (index < tiles.length) {
        const tile = tiles[index++];
        try { found.push(...await load(data.tiles[0], tile)); succeeded++; } catch { failures++; }
      }
    }));
    if (!succeeded) throw new ApiError(503, 'La fuente vectorial del mapa no respondió.');
    const unique = new Map();
    for (const feature of found) {
      const distance = distanceM(coordinates, feature.geometry.coordinates);
      if (distance > radius) continue;
      const key = `${feature.id}:${feature.properties.class}:${feature.properties.subclass}`;
      if (!unique.has(key)) unique.set(key, { ...feature, properties: { ...feature.properties, distanceM: Math.round(distance) } });
    }
    const rows = [...unique.values()].sort((a, b) => Number(a.properties.category === 'other') - Number(b.properties.category === 'other') || a.properties.distanceM - b.properties.distanceM);
    const version = data.tiles[0].split('/planet/')[1].split('/')[0];
    const fetchedAt = new Date(now()).toISOString();
    const features = rows.slice(0, 250).map((feature) => ({ ...feature, properties: {
      ...feature.properties, providerFeatureId: String(feature.id), sourceVersion: version, sourceFetchedAt: fetchedAt,
    } }));
    const count = (key) => features.filter((feature) => feature.properties.category === key).length;
    return { status: 'available', coordinates, radiusM: radius, limited: rows.length > 250 || failures > 0,
      coverage: failures ? 'partial_tiles' : 'mapped_sample', queriedTiles: tiles.length, failedTiles: failures,
      counts: { mappedPlaces: features.length, health: count('health'), education: count('education'), transport: count('transport'), parks: count('parks') },
      geojson: { type: 'FeatureCollection', features }, fetchedAt, sourceUpdatedAt: null,
      source: { name: 'OpenStreetMap · OpenMapTiles · OpenFreeMap', url: 'https://www.openstreetmap.org/copyright', providerUrl: 'https://openfreemap.org/',
        license: 'ODbL 1.0', version, dataMode: 'vector_tile_snapshot' } };
  }
  return { mapContext };
}
module.exports = { createPublicMapEvidenceService, nearbyTiles, distanceM, category, decodeTile };
