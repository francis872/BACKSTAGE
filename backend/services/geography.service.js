const ApiError = require('../utils/ApiError');
const territoryResolver = require('./territoryResolver.service');
const { analyzeTerrain } = require('../spatial/terrain');
const { generateContours } = require('../spatial/contours');

const OSM_SOURCE = { name: 'OpenStreetMap Nominatim', license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', dataMode: 'derived' };
const DEM_SOURCE = { name: 'Open-Meteo / Copernicus DEM GLO-90', license: 'CC BY 4.0', attribution: 'Copernicus / Open-Meteo', dataMode: 'modelled', resolutionM: 90 };

function coordinate(value) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((v) => v == null || typeof v === 'boolean' || String(v).trim() === '')) {
    throw new ApiError(400, 'Las coordenadas deben ser [longitud, latitud] WGS84.');
  }
  const [lng, lat] = value.map(Number);
  if (!Number.isFinite(lng) || Math.abs(lng) > 180 || !Number.isFinite(lat) || Math.abs(lat) > 90) {
    throw new ApiError(400, 'Coordenadas fuera del rango WGS84.');
  }
  return [lng, lat];
}

function coordinates(value, max = 25) {
  if (!Array.isArray(value) || value.length < 2 || value.length > max) throw new ApiError(400, `Se requieren entre 2 y ${max} coordenadas.`);
  return value.map(coordinate);
}

function requireOrganization(organizationId) {
  if (!organizationId) throw new ApiError(401, 'Se requiere una organización activa.');
}

function queryText(value) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.length > 120) throw new ApiError(400, 'q debe tener entre 2 y 120 caracteres.');
  return value.trim();
}

function integer(value, fallback, min, max, field) {
  if (value == null) return fallback;
  const n = Number(value);
  if (typeof value === 'boolean' || String(value).trim() === '' || !Number.isInteger(n) || n < min || n > max) throw new ApiError(400, `${field} debe estar entre ${min} y ${max}.`);
  return n;
}

function precision(type) {
  if (['house', 'building', 'address'].includes(type)) return 'address';
  if (['road', 'street', 'residential', 'motorway'].includes(type)) return 'street';
  if (['city', 'town', 'village', 'municipality', 'place', 'locality', 'neighborhood'].includes(type)) return 'locality';
  if (['state', 'country', 'administrative', 'region', 'district'].includes(type)) return 'administrative';
  return 'unknown';
}

function normalizedPlace(place, source = OSM_SOURCE) {
  if (!place) return null;
  const point = coordinate(place.coordinates);
  return { ...place, coordinates: point, source, precision: { level: precision(place.type), accuracyM: null }, validation: { coordinates: 'valid_wgs84', address: 'provider_match_unverified' } };
}

function haversine(a, b) {
  const rad = Math.PI / 180;
  const lat = (b[1] - a[1]) * rad;
  const lng = (b[0] - a[0]) * rad;
  const v = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(lng / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(Math.max(0, 1 - v)));
}

function createGeographyService({
  fetchImpl = globalThis.fetch,
  resolver = territoryResolver,
  osrmUrls = { driving: process.env.SOI_OSRM_DRIVING_URL || 'https://router.project-osrm.org', walking: process.env.SOI_OSRM_WALKING_URL, cycling: process.env.SOI_OSRM_CYCLING_URL },
  photonUrl = process.env.SOI_PHOTON_URL,
  mapboxToken = process.env.MAPBOX_ACCESS_TOKEN,
  mapboxPermanent = process.env.MAPBOX_GEOCODING_PERMANENT === 'true',
  elevationUrl = process.env.SOI_ELEVATION_URL || 'https://api.open-meteo.com/v1/elevation',
  timeoutMs = 15000,
  mongoInfrastructure,
  now = Date.now,
} = {}) {
  const usage = new Map();
  const surfaceCache = new Map();
  function quota(organizationId, samples = 0) {
    const key = String(organizationId);
    const current = usage.get(key);
    const entry = current && current.expires > now() ? current : { requests: 0, samples: 0, expires: now() + 60000 };
    if (entry.requests >= 30 || entry.samples + samples > 1000) throw new ApiError(429, 'Cuota geográfica agotada: 30 consultas y 1000 muestras DEM por minuto y organización.');
    entry.requests += 1; entry.samples += samples;
    usage.set(key, entry);
    if (usage.size > 1000) for (const [id, value] of usage) if (value.expires <= now()) usage.delete(id);
  }
  function mongo() { return mongoInfrastructure || require('../infrastructure/platformMongo'); }
  function bodyLimit(payload) {
    if (JSON.stringify(payload).length > 300000) throw new ApiError(413, 'La solicitud geográfica supera 300 KB.');
  }
  function positiveId(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, 'Identificador inválido.');
    return id;
  }
  async function request(url, provider) {
    try {
      const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'BACKSTAGE-SOI/3.1.0' }, signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error('upstream_http');
      return await response.json();
    } catch {
      throw new ApiError(503, `${provider} no está disponible; no se generaron resultados de reemplazo.`);
    }
  }

  async function geocode(organizationId, query = {}) {
    requireOrganization(organizationId);
    const q = queryText(query.q);
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*,\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(q)) {
      const point = coordinate(q.split(','));
      const source = { name: 'User coordinates', dataMode: 'user_provided', attribution: null };
      return { results: [{ id: `coordinates:${point.join(',')}`, name: point.join(', '), displayName: `Longitud ${point[0]}, latitud ${point[1]}`, coordinates: point, geometry: { type: 'Point', coordinates: point }, source, precision: { level: 'user_coordinates', accuracyM: null }, validation: { coordinates: 'valid_wgs84', address: 'not_geocoded' } }], source, validation: { result: 'user_coordinates' } };
    }
    quota(organizationId);
    const limit = integer(query.limit, 5, 1, 5, 'limit');
    let viewboxBias;
    if (query.viewbox != null) {
      viewboxBias = String(query.viewbox).split(',').map(Number);
      const [w, s, e, n] = viewboxBias;
      if (viewboxBias.length !== 4 || !viewboxBias.every(Number.isFinite) || w < -180 || e > 180 || s < -90 || n > 90 || w >= e || s >= n) throw new ApiError(400, 'viewbox debe ser west,south,east,north WGS84 válido.');
    }
    const places = await resolver.geocodeTerritories(q, { limit, countryBias: query.countryBias, regionBias: query.regionBias, viewboxBias, bounded: query.bounded === 'true' });
    return { results: places.map((p) => normalizedPlace(p)), source: OSM_SOURCE, validation: { result: places.length ? 'matches_found' : 'no_match' } };
  }

  async function autocomplete(organizationId, query = {}) {
    requireOrganization(organizationId);
    const q = queryText(query.q);
    const limit = integer(query.limit, 5, 1, 5, 'limit');
    // The public Nominatim usage policy explicitly forbids autocomplete.
    // Project coordinates persist in Atlas and browser context. Temporary Search
    // Box results must never enter that flow; permanent Geocoding is explicit.
    if (mapboxToken && mapboxPermanent) {
      if (q.includes(';') || q.split(/\s+/).length > 20) throw new ApiError(400, 'La búsqueda admite hasta 20 palabras y no admite punto y coma.');
      quota(organizationId);
      const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
      for (const [key, value] of Object.entries({ q, limit, language: 'es', autocomplete: 'true', permanent: 'true', access_token: mapboxToken })) url.searchParams.set(key, String(value));
      if (query.countryBias != null) {
        if (typeof query.countryBias !== 'string' || !/^[a-z]{2}(,[a-z]{2}){0,4}$/i.test(query.countryBias)) throw new ApiError(400, 'countryBias debe contener códigos de país de dos letras.');
        url.searchParams.set('country', query.countryBias.toLowerCase());
      }
      const data = await request(url, 'Mapbox');
      if (!Array.isArray(data.features)) throw new ApiError(502, 'Respuesta de Mapbox inválida.');
      const source = { name: 'Mapbox Geocoding v6', license: 'Mapbox permanent geocoding', attribution: typeof data.attribution === 'string' ? data.attribution : '© Mapbox and its suppliers', dataMode: 'derived', storage: 'permanent', observedAt: new Date(now()).toISOString() };
      try {
        const results = data.features.slice(0, limit).map(feature => {
          const p = feature.properties || {}, context = p.context || {};
          if (feature.geometry?.type !== 'Point' || typeof p.mapbox_id !== 'string' || typeof p.name !== 'string') throw Error('invalid_feature');
          const place = normalizedPlace({ id: `mapbox:${p.mapbox_id}`, name: p.name_preferred || p.name, displayName: p.full_address || [p.name, p.place_formatted].filter(Boolean).join(', '), type: p.feature_type, coordinates: feature.geometry.coordinates, geometry: feature.geometry, country: context.country?.name || null, countryCode: context.country?.country_code || null, region: context.region?.name || null, municipality: context.place?.name || null }, source);
          if (typeof p.coordinates?.accuracy === 'string') place.precision.providerAccuracy = p.coordinates.accuracy;
          return place;
        });
        return { results, source };
      } catch { throw new ApiError(502, 'Mapbox devolvió un lugar incompleto o coordenadas inválidas.'); }
    }
    if (!photonUrl) throw new ApiError(503, 'Sugerencias geográficas pendientes de configurar. Puedes usar Buscar lugar.');
    quota(organizationId);
    const url = new URL(photonUrl);
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(limit));
    const data = await request(url, 'Photon');
    if (!Array.isArray(data.features)) throw new ApiError(502, 'Respuesta de Photon inválida.');
    const source = { ...OSM_SOURCE, name: 'Photon / OpenStreetMap' };
    const results = data.features.slice(0, limit).map((feature) => {
      const p = feature.properties || {};
      return normalizedPlace({ id: `photon:${p.osm_type}:${p.osm_id}`, name: p.name || p.street || q, displayName: [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(', '), type: p.osm_value || p.type, coordinates: feature.geometry?.coordinates, country: p.country || null, countryCode: p.countrycode || null, region: p.state || null, municipality: p.city || null }, source);
    });
    return { results, source };
  }

  async function reverse(organizationId, query = {}) {
    requireOrganization(organizationId);
    const point = coordinate([query.lng, query.lat]);
    const zoom = integer(query.zoom, 18, 0, 18, 'zoom');
    quota(organizationId);
    const result = normalizedPlace(await resolver.reverseGeocode(...point, { zoom }));
    return { result, requestedCoordinates: point, source: OSM_SOURCE, validation: { result: result ? 'nearest_provider_match_unverified' : 'no_match' } };
  }

  async function route(organizationId, payload = {}) {
    requireOrganization(organizationId);
    bodyLimit(payload);
    const points = coordinates(payload.coordinates);
    const profile = payload.profile || 'driving';
    if (!['driving', 'walking', 'cycling'].includes(profile)) throw new ApiError(400, 'Perfil debe ser driving, walking o cycling.');
    if (!osrmUrls[profile]) throw new ApiError(503, `Perfil ${profile} no configurado en OSRM.`);
    if (payload.alternatives != null && typeof payload.alternatives !== 'boolean') throw new ApiError(400, 'alternatives debe ser booleano.');
    quota(organizationId);
    // Each configured server must be preprocessed with the matching Lua profile;
    // changing the OSRM URL path alone does not change its routing model.
    const url = new URL(`${String(osrmUrls[profile]).replace(/\/$/, '')}/route/v1/${profile}/${points.map((p) => p.join(',')).join(';')}`);
    url.searchParams.set('alternatives', String(payload.alternatives !== false));
    url.searchParams.set('steps', 'true');
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    const data = await request(url, 'OSRM');
    if (data.code === 'NoRoute' || data.code === 'NoSegment') throw new ApiError(422, 'No existe ruta vial para los puntos suministrados.');
    if (data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) throw new ApiError(502, 'Respuesta de OSRM inválida.');
    const source = { name: 'OSRM / OpenStreetMap', attribution: '© OpenStreetMap contributors', license: 'ODbL-1.0', dataMode: 'computed', profile, traffic: 'not_live', observedAt: new Date().toISOString() };
    const routes = data.routes.map((item, index) => {
      if (!Number.isFinite(item.distance) || item.distance < 0 || !Number.isFinite(item.duration) || item.duration < 0 || item.geometry?.type !== 'LineString' || !Array.isArray(item.geometry.coordinates) || item.geometry.coordinates.length < 2 || !Array.isArray(item.legs) || item.legs.length !== points.length - 1) throw new ApiError(502, 'OSRM devolvió una ruta incompleta.');
      try { item.geometry.coordinates.forEach(coordinate); } catch { throw new ApiError(502, 'OSRM devolvió geometría inválida.'); }
      const legs = item.legs.map((leg) => ({ distanceM: leg.distance, durationS: leg.duration, summary: leg.summary, steps: (leg.steps || []).map((step) => ({ name: step.name, ref: step.ref || null, distanceM: step.distance, durationS: step.duration, mode: step.mode, maneuver: step.maneuver, geometry: step.geometry })) }));
      return { id: `route-${index}`, distanceM: item.distance, durationS: item.duration, geometry: item.geometry, legs, steps: legs.flatMap((leg) => leg.steps), source };
    });
    return { routes, waypoints: data.waypoints || [], requestedCoordinates: points, profile, source, validation: { result: 'road_network_route', duration: 'estimate_without_live_traffic', alternatives: routes.length - 1 } };
  }

  async function elevationPoints(points) {
    const url = new URL(elevationUrl);
    url.searchParams.set('latitude', points.map((p) => p[1]).join(','));
    url.searchParams.set('longitude', points.map((p) => p[0]).join(','));
    const data = await request(url, 'DEM');
    if (!Array.isArray(data.elevation) || data.elevation.length !== points.length || data.elevation.some((v) => !Number.isFinite(v))) throw new ApiError(502, 'El DEM no devolvió elevaciones válidas para todos los puntos.');
    return data.elevation;
  }

  async function elevation(organizationId, query = {}) {
    requireOrganization(organizationId);
    const point = coordinate([query.lng, query.lat]);
    quota(organizationId, 1);
    const [elevationM] = await elevationPoints([point]);
    return { coordinates: point, elevationM, source: DEM_SOURCE, precision: { resolutionM: 90, verticalAccuracyM: null }, validation: { result: 'dem_sample', surveyed: false } };
  }

  async function profile(organizationId, payload = {}) {
    requireOrganization(organizationId);
    bodyLimit(payload);
    const points = coordinates(payload.coordinates, 10000);
    const count = integer(payload.samples, 50, 2, 100, 'samples');
    quota(organizationId, count);
    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) cumulative.push(cumulative[i - 1] + haversine(points[i - 1], points[i]));
    const distanceM = cumulative[cumulative.length - 1];
    if (distanceM === 0) throw new ApiError(400, 'El perfil requiere una trayectoria de longitud positiva.');
    let segment = 1;
    const samples = Array.from({ length: count }, (_, index) => {
      const d = index * distanceM / (count - 1);
      while (segment < points.length - 1 && cumulative[segment] < d) segment += 1;
      const span = cumulative[segment] - cumulative[segment - 1];
      const t = span ? (d - cumulative[segment - 1]) / span : 0;
      const a = points[segment - 1];
      const b = points[segment];
      // Interpolate shortest longitude difference when crossing the antimeridian.
      const deltaLng = ((b[0] - a[0] + 540) % 360) - 180;
      return { distanceM: d, coordinates: [((a[0] + deltaLng * t + 540) % 360) - 180, a[1] + (b[1] - a[1]) * t] };
    });
    const elevations = await elevationPoints(samples.map((s) => s.coordinates));
    let ascentM = 0;
    let descentM = 0;
    samples.forEach((sample, i) => { sample.elevationM = elevations[i]; if (i) { const change = elevations[i] - elevations[i - 1]; ascentM += Math.max(0, change); descentM += Math.max(0, -change); } });
    return { samples, distanceM, ascentM, descentM, source: DEM_SOURCE, precision: { resolutionM: 90, verticalAccuracyM: null, sampleSpacingM: distanceM / (count - 1) }, validation: { result: 'dem_profile', surveyed: false, hydrologyValidated: false } };
  }

  async function surface(organizationId, query = {}) {
    requireOrganization(organizationId);
    const bbox = String(query.bbox || '').split(',').map(Number);
    const [west, south, east, north] = bbox;
    if (bbox.length !== 4 || !bbox.every(Number.isFinite) || west < -180 || east > 180 || south < -85 || north > 85 || west >= east || south >= north) throw new ApiError(400, 'bbox debe ser west,south,east,north con latitud entre -85 y 85.');
    const resolution = integer(query.resolution, 8, 2, 10, 'resolution');
    const key = `${organizationId}:${bbox.join(',')}:${resolution}`;
    const cached = surfaceCache.get(key);
    if (cached && cached.expires > now()) return cached.value;
    quota(organizationId, resolution * resolution);
    const points = Array.from({ length: resolution * resolution }, (_, i) => [west + (i % resolution) * (east - west) / (resolution - 1), south + Math.floor(i / resolution) * (north - south) / (resolution - 1)]);
    const values = await elevationPoints(points);
    const elevation = Array.from({ length: resolution }, (_, row) => values.slice(row * resolution, (row + 1) * resolution));
    const cellSizeX = (east - west) / (resolution - 1);
    const cellSizeY = (north - south) / (resolution - 1);
    const dy = haversine([west, south], [west, south + cellSizeY]);
    const dx = haversine([west, (south + north) / 2], [west + cellSizeX, (south + north) / 2]);
    const analysis = analyzeTerrain(elevation, { cellSizeM: dy });
    // Existing terrain analyzer assumes square cells; compute slope/aspect using
    // separate geographic east-west and north-south sample spacing here.
    for (let row = 0; row < resolution; row += 1) for (let col = 0; col < resolution; col += 1) {
      const c0 = Math.max(0, col - 1); const c1 = Math.min(resolution - 1, col + 1);
      const r0 = Math.max(0, row - 1); const r1 = Math.min(resolution - 1, row + 1);
      const dzdx = (elevation[row][c1] - elevation[row][c0]) / ((c1 - c0) * dx);
      const dzdy = (elevation[r1][col] - elevation[r0][col]) / ((r1 - r0) * dy);
      analysis.slope[row][col] = Math.atan(Math.hypot(dzdx, dzdy)) * 180 / Math.PI;
      analysis.aspect[row][col] = (Math.atan2(dzdx, -dzdy) * 180 / Math.PI + 360) % 360;
    }
    const relief = analysis.statistics.relief;
    const interval = Math.max(1, Math.ceil(relief / 15));
    const contours = generateContours(elevation, { interval, originX: west, originY: south, cellSizeX, cellSizeY });
    const value = { ...analysis, bbox, resolution, contours, model: 'copernicus-dem-glo90', dataMode: 'dem', source: DEM_SOURCE,
      statistics: { ...analysis.statistics, cellSizeXM: dx, cellSizeYM: dy },
      precision: { resolutionM: 90, sampleSpacingXM: dx, sampleSpacingYM: dy, verticalAccuracyM: null },
      provenance: { ...DEM_SOURCE, data_type: 'EXTERNAL_API', validated: false, fetchedAt: new Date(now()).toISOString(), hydrologyValidated: false, analysis: 'coarse_dem_samples', curvature: 'approximate_square_cell' } };
    surfaceCache.set(key, { value, expires: now() + 300000 });
    while (surfaceCache.size > 100) surfaceCache.delete(surfaceCache.keys().next().value);
    return value;
  }

  async function saveRoutePlan(organizationId, payload = {}, userId) {
    requireOrganization(organizationId);
    bodyLimit(payload);
    if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.length > 200) throw new ApiError(400, 'name debe tener entre 1 y 200 caracteres.');
    const operationId = payload.operation_id == null ? null : positiveId(payload.operation_id);
    if (payload.analysis_run_id != null && !['number', 'string'].includes(typeof payload.analysis_run_id)) throw new ApiError(400, 'analysis_run_id debe ser un identificador de proyecto.');
    const projectId = payload.analysis_run_id == null ? null : positiveId(payload.analysis_run_id);
    {
      const infrastructure = mongo();
      const repository = await infrastructure.getMongoDatabase();
      const projectFilter = { organization_id: Number(organizationId), analysis_run_id: projectId, 'metadata.analysis_type': 'operational_project' };
      if (projectId != null && !await repository.collection('analysis_runs').findOne(projectFilter)) throw new ApiError(404, 'Proyecto operativo no encontrado en la organización.');
      if (operationId != null && !await repository.collection('soi_operations').findOne({ organization_id: Number(organizationId), operation_id: operationId })) throw new ApiError(404, 'Operación no encontrada en la organización.');
      const result = await route(organizationId, payload);
      if (JSON.stringify(result).length > 5000000) throw new ApiError(413, 'El resultado vial supera 5 MB.');
      return infrastructure.withMongoTransaction(async (transactionDb, session) => {
        if (projectId != null && !await transactionDb.collection('analysis_runs').findOne(projectFilter, { session })) throw new ApiError(404, 'Proyecto operativo no encontrado en la organización.');
        if (operationId != null && !await transactionDb.collection('soi_operations').findOne({ organization_id: Number(organizationId), operation_id: operationId }, { session })) throw new ApiError(404, 'Operación no encontrada en la organización.');
        const document = { route_plan_id: await infrastructure.nextId('soi_route_plans', session), organization_id: Number(organizationId), name: payload.name.trim(), profile: result.profile, coordinates: result.requestedCoordinates, result, operation_id: operationId, created_by: userId || null, created_at: new Date(now()) };
        document.calculation_contract = 'backstage-road-plan-v1';
        document.result_sha256 = require('node:crypto').createHash('sha256').update(JSON.stringify(result)).digest('hex');
        document.analysis_run_id = projectId;
        await transactionDb.collection('soi_route_plans').insertOne(document, { session });
        if (projectId != null) {
          await transactionDb.collection('analysis_runs').updateOne(projectFilter, { $addToSet: { 'metadata.route_plan_ids': document.route_plan_id }, $set: { updated_at: new Date(now()) } }, { session });
          await require('./platformAudit.service').appendPlatformAudit(infrastructure, transactionDb, session, { organizationId, userId }, 'route_plan.project_linked', 'soi_route_plans', document.route_plan_id, { analysis_run_id: projectId, calculation_contract: document.calculation_contract, result_sha256: document.result_sha256 });
        }
        return { data: infrastructure.cleanDocument(document) };
      });
    }
  }

  async function listRoutePlans(organizationId, query = {}) {
    requireOrganization(organizationId);
    const limit = integer(query.limit, 50, 1, 100, 'limit');
    {
      const infrastructure = mongo();
      const repository = await infrastructure.getMongoDatabase();
      const records = await repository.collection('soi_route_plans').find({ organization_id: Number(organizationId) }, { projection: { _id: 0, result: 0 } }).sort({ route_plan_id: -1 }).limit(limit).toArray();
      return { data: records.map(infrastructure.cleanDocument) };
    }
  }

  async function getRoutePlan(organizationId, id) {
    requireOrganization(organizationId);
    {
      const infrastructure = mongo();
      const repository = await infrastructure.getMongoDatabase();
      const record = await repository.collection('soi_route_plans').findOne({ organization_id: Number(organizationId), route_plan_id: positiveId(id) });
      if (!record) throw new ApiError(404, 'Ruta guardada no encontrada.');
      return { data: infrastructure.cleanDocument(record) };
    }
  }

  function capabilities(organizationId) {
    requireOrganization(organizationId);
    const mapboxReady = Boolean(mapboxToken && mapboxPermanent);
    return { autocomplete: mapboxReady || Boolean(photonUrl), autocomplete_provider: mapboxReady ? 'mapbox_geocoding_v6_permanent' : photonUrl ? 'photon' : null, autocomplete_status: mapboxReady || photonUrl ? 'configured' : mapboxToken ? 'permanent_storage_not_enabled' : 'not_configured', profiles: ['driving', 'walking', 'cycling'].filter((name) => Boolean(osrmUrls[name])), elevation: true, surface: true };
  }
  return { geocode, autocomplete, reverse, route, elevation, profile, surface, saveRoutePlan, listRoutePlans, getRoutePlan, capabilities };
}

module.exports = { createGeographyService, createSoiGeoService: createGeographyService, coordinate, haversine, ...createGeographyService() };
