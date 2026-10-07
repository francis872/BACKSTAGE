const { query } = require('../db');
const ApiError = require('../utils/ApiError');

const IDENTIFIER_REGEX = /^[a-z_][a-z0-9_]*$/i;

function assertSafeIdentifier(value, label) {
  if (!value || !IDENTIFIER_REGEX.test(value)) {
    throw new ApiError(500, `${label} inválido en configuración de capa.`);
  }
}

function parseBbox(bbox) {
  if (!bbox) return null;
  const parts = String(bbox).split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) {
    throw new ApiError(400, 'bbox debe tener formato minLng,minLat,maxLng,maxLat.');
  }

  return parts;
}

function geometryIntersectsBbox(geometry, bbox) {
  if (!bbox) return true;
  const coordinates = [];
  const visit = (value) => {
    if (Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite)) coordinates.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry?.coordinates);
  if (!coordinates.length) return false;
  const xs = coordinates.map((point) => point[0]);
  const ys = coordinates.map((point) => point[1]);
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return Math.max(...xs) >= minLng && Math.min(...xs) <= maxLng
    && Math.max(...ys) >= minLat && Math.min(...ys) <= maxLat;
}

async function listLayers(organizationId, role) {
  const result = await query(
    `SELECT
      layer_id, slug, name, category, description, geometry_type, source_name,
      srid, coverage, style_json, min_zoom, max_zoom, confidence_level,
      is_visible_default, allowed_roles, status, layer_version, updated_at
     FROM layer_catalog
     WHERE status = 'active'
      AND ($1 = ANY(allowed_roles))
      AND (organization_id = $2 OR organization_id IS NULL)
     ORDER BY category, name`
    ,
    [role, organizationId]
  );
  return result.rows;
}

async function getLayerById(idOrSlug, organizationId, role) {
  const isNumeric = /^\d+$/.test(String(idOrSlug));
  const result = await query(
    `SELECT
     layer_id, slug, name, category, description, geometry_type, source_name,
     srid, coverage, style_json, min_zoom, max_zoom, confidence_level,
     is_visible_default, allowed_roles, status, layer_version, updated_at,
     source_table, id_column, name_column, geom_column, organization_id
     FROM layer_catalog
     WHERE status = 'active'
      AND ($1 = ANY(allowed_roles))
      AND (organization_id = $2 OR organization_id IS NULL)
      AND ${isNumeric ? 'layer_id = $3::int' : 'slug = $3'}`,
    [role, organizationId, idOrSlug]
  );

  if (result.rows.length === 0) {
    throw new ApiError(404, 'Capa no encontrada.');
  }
  return result.rows[0];
}

async function getLayerFeatures(layer, { bbox, limit = 500, offset = 0 } = {}) {
  assertSafeIdentifier(layer.source_table, 'source_table');
  assertSafeIdentifier(layer.id_column, 'id_column');
  assertSafeIdentifier(layer.geom_column, 'geom_column');
  if (layer.name_column) assertSafeIdentifier(layer.name_column, 'name_column');

  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const parsedBbox = parseBbox(bbox);
  const result = await query(
    `SELECT * FROM ${layer.source_table} WHERE ${layer.geom_column} IS NOT NULL LIMIT $1`,
    [Math.min(safeLimit + safeOffset + 2000, 5000)]
  );
  const features = result.rows
    .filter((row) => geometryIntersectsBbox(row[layer.geom_column], parsedBbox))
    .slice(safeOffset, safeOffset + safeLimit)
    .map((row) => {
      const { [layer.geom_column]: geometry, ...properties } = row;
      return { type: 'Feature', geometry, properties };
    });
  return { type: 'FeatureCollection', features };
}

module.exports = {
  listLayers,
  getLayerById,
  getLayerFeatures,
  parseBbox,
  geometryIntersectsBbox,
};
