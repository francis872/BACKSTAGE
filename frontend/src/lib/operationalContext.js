const STORAGE_KEY = 'backstage_operational_context';
import { getSessionUser, getBrowserValue, setBrowserValue, removeBrowserValue, browserKeys } from './auth.js';
import { coordinatesOf } from './territory.js';
const scopedKey = user => `${STORAGE_KEY}:${user.user_id}:${user.organization_id}`;

function compactLocation(value) {
  if (!value || typeof value !== 'object') return null;
  const coordinates = coordinatesOf(value);
  const validNumber = (item) => item !== null && item !== undefined && Number.isFinite(Number(item));
  const geometry = value.geometry && JSON.stringify(value.geometry).length <= 100000 ? value.geometry : null;
  const bbox = Array.isArray(value.bbox) && value.bbox.length === 4
    ? value.bbox.map(Number)
    : Array.isArray(value.bounds) && value.bounds.length === 4 ? value.bounds.map(Number) : null;
  return {
    id: value.id ?? value.location_id ?? null,
    asset_id: value.asset_id || null,
    origin: value.origin || null,
    location_id: value.location_id ?? null,
    source_record_id: value.source_record_id ?? null,
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
    accuracyM: value.accuracyM ?? null,
    capturedAt: value.capturedAt || null,
    provenance: value.provenance || null,
    source_metadata: value.source_metadata || null,
    source: value.source || value.provider || value.provenance?.source || value.sourceId || null,
  };
}

export function getStoredOperationalContext() {
  const user=getSessionUser();
  if(!user?.user_id||!user.organization_id)return null;
  const raw = getBrowserValue(scopedKey(user)) || getBrowserValue(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if(String(parsed.user_id)!==String(user.user_id)||String(parsed.organization_id)!==String(user.organization_id))return null;
    if (!parsed?.analysis_run_id && !parsed?.comparison_id && !parsed?.territory && !parsed?.project && !parsed?.candidates?.length && !parsed?.property_layer_open) return null;
    return {
      ...parsed,
      intent_type: parsed.intent_type || null,
      territories: Array.isArray(parsed.territories) ? parsed.territories.slice(0, 8) : [],
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
  const user=getSessionUser();
  if (!context||!user?.user_id||String(context.organization_id)!==String(user.organization_id)) return;
  const payload = {
    user_id:user.user_id,
    analysis_run_id: context.analysis_run_id ? Number(context.analysis_run_id) : null,
    project_name: context.project_name || null,
    city: context.city || null,
    organization_id: context.organization_id || null,
    longitude: context.longitude ?? null,
    latitude: context.latitude ?? null,
    location_id: context.location_id ?? null,
    asset_id: context.asset_id || null,
    selected_assets: Array.isArray(context.selected_assets)?context.selected_assets.slice(0,6):[],
    comparison_id: context.comparison_id || null,
    comparison_mode: context.comparison_mode || null,
    projectTerritory: compactLocation(context.projectTerritory || context.project?.metadata?.territory),
    mapView: ['2d','3d','globe'].includes(context.mapView) ? context.mapView : '2d',
    layers: context.layers && typeof context.layers === 'object' ? context.layers : {},
    property_layer_open: context.property_layer_open === true,
    property_entity_id: Number.isSafeInteger(context.property_entity_id) && context.property_entity_id > 0 ? context.property_entity_id : null,
    intent_type: context.intent_type || context.intentType || null,
    returnPage: context.returnPage || null,
    soiPicker: context.soiPicker || null,
    soiOperationId: context.soiOperationId || null,
    routeStopIndex: context.routeStopIndex ?? null,
    soiAssetSelection: context.soiAssetSelection || null,
    soiRouteSelection: context.soiRouteSelection || null,
    assetPicker: context.assetPicker === true,
    candidatePicker: context.candidatePicker === true,
    projectPicker: context.projectPicker === true,
    assetDraft: context.assetDraft || null,
    projectDraft: context.projectDraft || null,
    territories: Array.isArray(context.territories) ? context.territories.slice(0, 8) : [],
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
      pitch: Number.isFinite(Number(context.mapContext.pitch)) ? Number(context.mapContext.pitch) : 0,
      bearing: Number.isFinite(Number(context.mapContext.bearing)) ? Number(context.mapContext.bearing) : 0,
      bounds: Array.isArray(context.mapContext.bounds) ? context.mapContext.bounds.slice(0, 4).map(Number) : null,
    } : null,
    saved_at: new Date().toISOString(),
  };
  if (!setBrowserValue(scopedKey(user), JSON.stringify(payload))) {
    payload.territory = payload.territory ? { ...payload.territory, geometry: null } : null;
    payload.candidates = payload.candidates.map((candidate) => ({ ...candidate, geometry: null }));
    setBrowserValue(scopedKey(user), JSON.stringify(payload));
  }
}

export function clearStoredOperationalContext() {
  const user=getSessionUser();
  if(user?.user_id){removeBrowserValue(scopedKey(user));try{const legacy=JSON.parse(getBrowserValue(STORAGE_KEY)||'null');if(String(legacy?.user_id)===String(user.user_id)&&String(legacy?.organization_id)===String(user.organization_id))removeBrowserValue(STORAGE_KEY);}catch{}return;}
  for(const key of browserKeys())if(key===STORAGE_KEY||key.startsWith(STORAGE_KEY+':'))removeBrowserValue(key);
}
