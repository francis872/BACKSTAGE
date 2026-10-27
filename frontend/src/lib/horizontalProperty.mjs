import { assetMapTarget } from './assetGeometry.mjs';
export const PROPERTY_LAYER_PATH = '/assets/layers/horizontal-property';
export function propertyMapContext(detail) {
  const reference = detail?.spatial_reference;
  const target = reference?.geometry && assetMapTarget({ geometry: reference.geometry });
  if (!target) return null;
  return { property_layer_open: true, property_entity_id: detail.data.location_id, preserveProject: true,
    territory: { location_id: reference.location_id, asset_id: `platform:${reference.location_id}`, name: reference.name, geometry: reference.geometry },
    mapContext: { center: target.center, bounds: target.bounds, zoom: 17 } };
}
