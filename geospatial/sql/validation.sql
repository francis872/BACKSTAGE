-- Validación básica de geometrías y SRID en BACKSTAGE

SELECT 'locations' AS layer, COUNT(*) AS total, COUNT(*) FILTER (WHERE geom IS NULL) AS without_geom
FROM locations
UNION ALL
SELECT 'competitors', COUNT(*), COUNT(*) FILTER (WHERE geom IS NULL)
FROM competitors
UNION ALL
SELECT 'points_of_interest', COUNT(*), COUNT(*) FILTER (WHERE geom IS NULL)
FROM points_of_interest
UNION ALL
SELECT 'territorial_zones', COUNT(*), COUNT(*) FILTER (WHERE geom IS NULL)
FROM territorial_zones;

SELECT 'locations' AS layer, COUNT(*) AS invalid_geom
FROM locations
WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)
UNION ALL
SELECT 'competitors', COUNT(*)
FROM competitors
WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)
UNION ALL
SELECT 'points_of_interest', COUNT(*)
FROM points_of_interest
WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)
UNION ALL
SELECT 'territorial_zones', COUNT(*)
FROM territorial_zones
WHERE geom IS NOT NULL AND NOT ST_IsValid(geom);

SELECT 'locations' AS layer, ST_SRID(geom) AS srid, COUNT(*) AS features
FROM locations
WHERE geom IS NOT NULL
GROUP BY ST_SRID(geom)
UNION ALL
SELECT 'competitors', ST_SRID(geom), COUNT(*)
FROM competitors
WHERE geom IS NOT NULL
GROUP BY ST_SRID(geom)
UNION ALL
SELECT 'points_of_interest', ST_SRID(geom), COUNT(*)
FROM points_of_interest
WHERE geom IS NOT NULL
GROUP BY ST_SRID(geom)
UNION ALL
SELECT 'territorial_zones', ST_SRID(geom), COUNT(*)
FROM territorial_zones
WHERE geom IS NOT NULL
GROUP BY ST_SRID(geom);
