export function toCandidate(value, fallbackId) {
  const coordinates = Array.isArray(value.coordinates) ? value.coordinates : value.geometry?.type === 'Point' ? value.geometry.coordinates : null;
  const number = value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const rawId=String(value.asset_id || value.id || (value.location_id ? `location:${value.location_id}` : fallbackId));
  let candidateId=rawId;
  if(rawId.length>200||/^[\$]|[.\x00-\x1f]/.test(rawId)||['__proto__','constructor','prototype'].includes(rawId)){
    // A coordinate or provider URL is an identity reference, not an object path.
    let a=2166136261,b=5381;for(const char of rawId){a=Math.imul(a^char.codePointAt(0),16777619);b=Math.imul(b,33)^char.codePointAt(0);}
    candidateId=`place:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;
  }
  return {
    id: candidateId,
    source_identifier: rawId,
    location_id: value.location_id ?? null,
    type: value.type || value.objectType || 'custom_coordinate',
    name: value.name || value.displayName || value.properties?.name || 'Candidato',
    displayName: value.displayName || value.properties?.displayName || value.name || 'Candidato',
    city: value.city || value.municipality || value.properties?.city || null,
    region: value.region || value.properties?.region || null,
    country: value.country || value.properties?.country || null,
    lat: number(value.lat ?? coordinates?.[1] ?? value.latitude),
    lng: number(value.lng ?? coordinates?.[0] ?? value.longitude),
    bbox: value.bbox || value.bounds || null, geometry: value.geometry || null,
    description: value.description || '',
    source: value.source || value.provider || value.provenance?.source || 'BACKSTAGE',
  };
}
export function existingLocationCandidate(location) {
  return toCandidate({ ...location, type: 'existing_location', source: 'BACKSTAGE assets' });
}
