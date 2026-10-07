const STORAGE_KEY = 'backstage_operational_context';

function compactLocation(value) {
  if (!value || typeof value !== 'object') return null;
  const coordinates = Array.isArray(value.coordinates) ? value.coordinates : null;
  const validNumber = (item) => item !== null && item !== undefined && Number.isFinite(Number(item));
  const geometry = value.geometry && JSON.stringify(value.geometry).length <= 100000 ? value.geometry : null;
  const bbox = Array.isArray(value.bbox) && value.bbox.length === 4
    ? value.bbox.map(Number)
    : Array.isArray(value.bounds) && value.bounds.length === 4 ? value.bounds.map(Number) : null;
  return {
    id: value.id ?? value.location_id ?? null,
    type: value.type || value.objectType || value.locationType || null,
    name: value.name || value.displayName || value.properties?.name || null,
    displayName: value.displayName || value.properties?.displayName || value.name || null,
    city: value.city || value.municipality || value.properties?.city || null,
    region: value.region || value.properties?.region || null,
    country: value.country || value.properties?.country || null,
    countryCode: value.countryCode || value.properties?.countryCode || null,
    lat: validNumber(value.lat) ? Number(value.lat) : coordinates?.[1] ?? null,
    lng: validNumber(value.lng) ? Number(value.lng) : coordinates?.[0] ?? null,
    coordinates,
    bbox: bbox?.every(Number.isFinite) ? bbox : null,
    geometry,
    source: value.source || value.provider || value.provenance?.source || value.sourceId || null,
  };
}

export function getStoredOperationalContext() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.analysis_run_id && !parsed?.territory && !parsed?.project && !parsed?.candidates?.length) return null;
    return {
      ...parsed,
      organizationId: parsed.organization_id || null,
      activeTerritory: parsed.territory || null,
      analysisRun: parsed.analysis_run_id ? {
        id: Number(parsed.analysis_run_id),
        project_name: parsed.project_name || null,
        city: parsed.city || null,
      } : null,
    };
  } catch {
    return null;
  }
}

export function setStoredOperationalContext(context) {
  if (!context) return;
  const payload = {
    analysis_run_id: context.analysis_run_id ? Number(context.analysis_run_id) : null,
    project_name: context.project_name || null,
    city: context.city || null,
    organization_id: context.organization_id || null,
    territory: compactLocation(context.territory || context.activeTerritory),
    project: context.project ? {
      analysis_run_id: context.project.analysis_run_id ? Number(context.project.analysis_run_id) : null,
      project_name: context.project.project_name || context.project.name || null,
      city: context.project.city || null,
    } : null,
    selectedLocation: compactLocation(context.selectedLocation),
    candidates: Array.isArray(context.candidates) ? context.candidates.slice(0, 6).map(compactLocation).filter(Boolean) : [],
    mapContext: context.mapContext && typeof context.mapContext === 'object' ? {
      center: Array.isArray(context.mapContext.center) ? context.mapContext.center.slice(0, 2).map(Number) : null,
      zoom: Number.isFinite(Number(context.mapContext.zoom)) ? Number(context.mapContext.zoom) : null,
      bounds: Array.isArray(context.mapContext.bounds) ? context.mapContext.bounds.slice(0, 4).map(Number) : null,
    } : null,
    saved_at: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    payload.territory = payload.territory ? { ...payload.territory, geometry: null } : null;
    payload.candidates = payload.candidates.map((candidate) => ({ ...candidate, geometry: null }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }
}

export function clearStoredOperationalContext() {
  window.localStorage.removeItem(STORAGE_KEY);
}
