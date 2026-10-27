const ApiError = require('../utils/ApiError');
const { geometry } = require('./geometry');

function workspaceTerritory(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 100000) {
    throw new ApiError(400, 'Selecciona un territorio válido.');
  }
  const pair = input.coordinates || (input.geometry?.type === 'Point' ? input.geometry.coordinates : null)
    || [input.lng ?? input.longitude, input.lat ?? input.latitude];
  if (!Array.isArray(pair) || pair.length !== 2 || pair.some(n => typeof n !== 'number' || !Number.isFinite(n))
    || Math.abs(pair[0]) > 180 || Math.abs(pair[1]) > 90) {
    throw new ApiError(400, 'El territorio requiere coordenadas WGS84 válidas.');
  }
  const text = value => typeof value === 'string' ? value.slice(0, 200) : null;
  const sourceMetadata = input.source_metadata || (input.source && typeof input.source === 'object' ? input.source : null);
  const metadata = sourceMetadata && typeof sourceMetadata === 'object' && !Array.isArray(sourceMetadata)
    ? Object.fromEntries(['name', 'license', 'attribution', 'storage', 'dataMode', 'observedAt'].filter(key => typeof sourceMetadata[key] === 'string').map(key => [key, sourceMetadata[key].slice(0, 500)])) : {};
  return {
    id: text(String(input.id ?? '')),
    name: text(input.name || input.displayName) || 'Territorio seleccionado',
    type: text(input.type),
    city: text(input.city),
    region: text(input.region),
    country: text(input.country),
    coordinates: pair,
    geometry: input.geometry ? geometry(input.geometry) : { type: 'Point', coordinates: pair },
    source: text(input.source?.name || input.source) || 'Selección de la organización',
    ...(Object.keys(metadata).length ? { source_metadata: metadata } : {}),
    provenance: { data_type: 'ORGANIZATION_PROVIDED', validated: false },
  };
}
module.exports = { workspaceTerritory };
