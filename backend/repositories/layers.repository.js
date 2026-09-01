const { query } = require('../db');
const ApiError = require('../utils/ApiError');

const IDENTIFIER_REGEX = /^[a-z_][a-z0-9_]*$/i;

function assertSafeIdentifier(value, label) {
  if (!value || !IDENTIFIER_REGEX.test(value)) {
    throw new ApiError(500, `${label} inválido en configuración de capa.`);
  }
}

function buildBboxFilter(bbox, geomColumn) {
  if (!bbox) return { clause: '', values: [] };
  const parts = String(bbox).split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((v) => Number.isNaN(v))) {
    throw new ApiError(400, 'bbox debe tener formato minLng,minLat,maxLng,maxLat.');
  }

  return {
    clause: ` AND ST_Intersects(${geomColumn}, ST_MakeEnvelope($1, $2, $3, $4, 4326))`,
    values: parts,
  };
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
  const bboxFilter = buildBboxFilter(bbox, layer.geom_column);
  const valueStart = bboxFilter.values.length + 1;
  const sql = `
    WITH rows AS (
      SELECT *
      FROM ${layer.source_table}
      WHERE ${layer.geom_column} IS NOT NULL${bboxFilter.clause}
      LIMIT $${valueStart}
      OFFSET $${valueStart + 1}
    )
    SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(${layer.geom_column})::jsonb,
            'properties', to_jsonb(rows) - '${layer.geom_column}'
          )
        ),
        '[]'::jsonb
      )
    ) AS geojson
    FROM rows;
  `;
  const values = [...bboxFilter.values, safeLimit, safeOffset];
  const result = await query(sql, values);
  return result.rows[0]?.geojson || { type: 'FeatureCollection', features: [] };
}

module.exports = {
  listLayers,
  getLayerById,
  getLayerFeatures,
};
