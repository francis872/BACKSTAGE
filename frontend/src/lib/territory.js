export function coordinatesOf(value) {
  if (!value) return null;
  const pair = value.coordinates || (value.geometry?.type === 'Point' ? value.geometry.coordinates : null)
    || [value.lng ?? value.longitude, value.lat ?? value.latitude];
  if (pair?.length !== 2 || pair.some((n) => n === null || n === undefined || String(n).trim() === '' || !Number.isFinite(Number(n)))) return null;
  const [lng, lat] = pair.map(Number);
  return Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? [lng, lat] : null;
}
export function mergeOperationalContext(previous, incoming, organizationId) {
  const old = previous?.organization_id && String(previous.organization_id) !== String(organizationId) ? {} : previous || {};
  const selected = incoming.territory || incoming.activeTerritory;
  const changed = selected && JSON.stringify([selected.asset_id || selected.id, coordinatesOf(selected)]) !== JSON.stringify([old.territory?.asset_id || old.territory?.id, coordinatesOf(old.territory)]);
  const next = { ...old, ...incoming, organization_id: organizationId };
  // Exploring another place is distinct from changing a project's saved site.
  // Legacy callers retain their explicit replacement behavior.
  const exploring = incoming.preserveProject === true && old.analysis_run_id &&
    (!incoming.analysis_run_id || incoming.analysis_run_id === old.analysis_run_id);
  if (exploring) next.projectTerritory = old.projectTerritory || old.project?.metadata?.territory || old.territory || null;
  delete next.preserveProject;
  const restoringProject = incoming.project?.analysis_run_id === incoming.analysis_run_id && selected && selected === incoming.project?.metadata?.territory;
  const pickers = ['soiPicker', 'assetPicker', 'projectPicker', 'candidatePicker'];
  const activePicker = pickers.find((key) => incoming[key]);
  if (activePicker) pickers.filter((key) => key !== activePicker).forEach((key) => { next[key] = key === 'soiPicker' ? null : false; });
  if (changed && !exploring) {
    next.analysis_run_id = restoringProject || incoming.analysis_run_id !== old.analysis_run_id ? incoming.analysis_run_id ?? null : null;
    next.project_name = next.analysis_run_id || incoming.startComparison ? incoming.project_name ?? null : null;
    next.project = restoringProject || incoming.project !== old.project ? incoming.project ?? null : null;
    next.location_id = selected.asset_id ? selected.location_id ?? null : incoming.location_id !== old.location_id ? incoming.location_id ?? null : null;
    next.asset_id = selected.asset_id || (incoming.asset_id !== old.asset_id ? incoming.asset_id : null) || null;
    next.selected_assets = incoming.selected_assets !== old.selected_assets ? incoming.selected_assets || [] : [];
    next.comparison_id = restoringProject || incoming.comparison_id !== old.comparison_id ? incoming.comparison_id || null : null;
    next.candidates = incoming.candidates !== old.candidates ? incoming.candidates || [] : [];
    next.city = selected.city || selected.name || null;
    next.mapContext = incoming.mapContext || { center: coordinatesOf(selected), zoom: 12 };
  }
  if (changed && exploring) {
    next.city = selected.city || selected.name || null;
    next.mapContext = incoming.mapContext || { center: coordinatesOf(selected), zoom: 12 };
  }
  if (incoming.clearTerritory) Object.assign(next, { territory: null, selectedLocation: null, city: null, longitude: null, latitude: null, location_id: null, asset_id: null, selected_assets: [], comparison_id: null, candidates: [], mapContext: null });
  else if (selected) {
    const pair = coordinatesOf(selected);
    Object.assign(next, { territory: selected, selectedLocation: incoming.selectedLocation || selected, longitude: pair?.[0] ?? null, latitude: pair?.[1] ?? null });
  }
  next.activeTerritory = next.territory || null;
  next.organizationId = organizationId;
  next.analysisRun = next.analysis_run_id ? { id: Number(next.analysis_run_id), project_name: next.project_name, city: next.city } : null;
  return next;
}
export const territoryType = (type) => ({ administrative: 'Área administrativa', city: 'Ciudad', town: 'Localidad', municipality: 'Municipio', village: 'Localidad', place: 'Localidad', locality: 'Sector de localidad', region: 'Región', district: 'Distrito', neighborhood: 'Barrio', address: 'Dirección', street: 'Calle', park: 'Parque', geocoded_place: 'Lugar', device: 'Ubicación del dispositivo', map_point: 'Punto seleccionado' }[type] || 'Lugar cartografiado');
const normal = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function belongsToTerritory(row, territory) {
  if (!territory) return false;
  const data = { ...row, ...(row.metadata?.territory || {}), ...(row.territory || {}) };
  if (data.country && territory.country && normal(data.country) !== normal(territory.country)) return false;
  const pair = coordinatesOf(data);
  const box = territory.bbox || territory.bounds;
  if (pair && box?.length === 4) return pair[0] >= box[0] && pair[0] <= box[2] && pair[1] >= box[1] && pair[1] <= box[3];
  const target = coordinatesOf(territory);
  if (pair && target) {
    const radians = (n) => n * Math.PI / 180;
    const a = Math.sin(radians(pair[1] - target[1]) / 2) ** 2 + Math.cos(radians(pair[1])) * Math.cos(radians(target[1])) * Math.sin(radians(pair[0] - target[0]) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= 5000;
  }
  return Boolean(data.city && (territory.city || territory.name) && normal(data.city) === normal(territory.city || territory.name));
}
