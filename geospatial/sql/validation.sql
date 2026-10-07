-- Validación GeoJSON compatible con PostgreSQL estándar.

SELECT 'locations' AS layer, COUNT(*) AS total,
       COUNT(*) FILTER (WHERE geometry IS NULL) AS without_geometry
FROM locations
UNION ALL
SELECT 'competitors', COUNT(*), COUNT(*) FILTER (WHERE geometry IS NULL)
FROM competitors
UNION ALL
SELECT 'points_of_interest', COUNT(*), COUNT(*) FILTER (WHERE geometry IS NULL)
FROM points_of_interest
UNION ALL
SELECT 'territorial_zones', COUNT(*), COUNT(*) FILTER (WHERE geometry IS NULL)
FROM territorial_zones;

SELECT 'locations' AS layer, COUNT(*) AS invalid_geometry
FROM locations
WHERE geometry IS NOT NULL
  AND (jsonb_typeof(geometry) <> 'object' OR geometry->>'type' <> 'Point'
       OR jsonb_array_length(geometry->'coordinates') < 2)
UNION ALL
SELECT 'competitors', COUNT(*)
FROM competitors
WHERE geometry IS NOT NULL
  AND (jsonb_typeof(geometry) <> 'object' OR geometry->>'type' <> 'Point'
       OR jsonb_array_length(geometry->'coordinates') < 2)
UNION ALL
SELECT 'points_of_interest', COUNT(*)
FROM points_of_interest
WHERE geometry IS NOT NULL
  AND (jsonb_typeof(geometry) <> 'object' OR geometry->>'type' <> 'Point'
       OR jsonb_array_length(geometry->'coordinates') < 2)
UNION ALL
SELECT 'territorial_zones', COUNT(*)
FROM territorial_zones
WHERE geometry IS NOT NULL
  AND (jsonb_typeof(geometry) <> 'object' OR geometry->>'type' NOT IN ('Polygon', 'MultiPolygon')
       OR jsonb_array_length(geometry->'coordinates') = 0);
