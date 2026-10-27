import { coordinatesOf } from './territory.js';

// Rendering adapters preserve the source geometry; a bounds center is only a camera target.
export function assetGeometry(asset) {
  if (asset.geometry) return asset.geometry;
  const point = coordinatesOf(asset);
  return point ? { type: 'Point', coordinates: point } : null;
}
export function assetMapTarget(asset) {
  const geometry = assetGeometry(asset);
  const depth = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 }[geometry?.type];
  if (depth === undefined) return null;
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  let count = 0;
  const visit = (coordinates, level) => {
    if (!Array.isArray(coordinates) || !coordinates.length) return false;
    if (level) return coordinates.every(value => visit(value, level - 1));
    if (++count > 20000 || coordinates.length < 2 || !coordinates.slice(0, 2).every(Number.isFinite) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) return false;
    bounds[0] = Math.min(bounds[0], coordinates[0]); bounds[1] = Math.min(bounds[1], coordinates[1]);
    bounds[2] = Math.max(bounds[2], coordinates[0]); bounds[3] = Math.max(bounds[3], coordinates[1]);
    return true;
  };
  return visit(geometry.coordinates, depth) ? { center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2], bounds } : null;
}
export function assetsToGeoJSON(assets) {
  return { type: 'FeatureCollection', features: assets.filter(asset => assetMapTarget(asset)).map(asset => ({
    type: 'Feature', id: asset.asset_id || asset.location_id, geometry: assetGeometry(asset),
    properties: { location_id: asset.location_id, asset_id: asset.asset_id, origin: asset.origin || '', name: asset.name, city: asset.city || '', locationType: asset.type || '' },
  })) };
}
