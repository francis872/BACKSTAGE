-- Fuentes de datos de ejemplo
INSERT INTO data_sources (name, category, description)
VALUES
  ('Google Maps', 'traffic', 'Tráfico en tiempo real y condiciones de ruta'),
  ('POS System', 'transaction', 'Volumen de pedidos y transacciones'),
  ('Urban Census', 'demographics', 'Demografía y datos poblacionales'),
  ('Event Feed', 'events', 'Eventos cercanos que afectan movilidad'),
  ('Weather API', 'weather', 'Condiciones climáticas y pronóstico'),
  ('Property Registry', 'real_estate', 'Datos catastrales e inmobiliarios')
ON CONFLICT (name) DO NOTHING;

-- Ubicaciones base
INSERT INTO locations (external_id, name, type, address, city, region, country, latitude, longitude, capacity)
VALUES
  ('mcd-001', 'McDonald\'s Centro', 'restaurant', 'Calle 123 #45-67', 'Bogotá', 'Cundinamarca', 'Colombia', 4.7110, -74.0721, 120),
  ('sbux-001', 'Starbucks Parque', 'cafe', 'Carrera 15 #95-30', 'Bogotá', 'Cundinamarca', 'Colombia', 4.6693, -74.0536, 80),
  ('retail-001', 'Plaza Comercial Norte', 'retail', 'Avenida 20 #120-10', 'Bogotá', 'Cundinamarca', 'Colombia', 4.7501, -74.0650, 250),
  ('prop-001', 'Lote Vía La Calera', 'property', 'Km 3 Vía La Calera', 'Bogotá', 'Cundinamarca', 'Colombia', 4.7032, -74.0338, NULL),
  ('log-001', 'Centro de Distribución Norte', 'logistics', 'Calle 80 #60-15', 'Bogotá', 'Cundinamarca', 'Colombia', 4.7167, -74.0672, 600)
ON CONFLICT (external_id) DO NOTHING;

-- Categorías de ubicación
INSERT INTO location_categories (name, description)
VALUES
  ('Restaurant', 'Locales de comida rápida y restaurantes'),
  ('Cafe', 'Cafeterías y lugares de bebidas'),
  ('Retail', 'Tiendas y centros comerciales'),
  ('Property', 'Activos inmobiliarios'),
  ('Logistics', 'Infraestructura logística')
ON CONFLICT (name) DO NOTHING;

-- Asignación de categorías a ubicaciones
WITH loc AS (
  SELECT location_id, external_id FROM locations
)
INSERT INTO location_category_assignments (location_id, category_id)
SELECT l.location_id, c.category_id
FROM loc l
JOIN location_categories c ON (
  (l.external_id = 'mcd-001' AND c.name = 'Restaurant') OR
  (l.external_id = 'sbux-001' AND c.name = 'Cafe') OR
  (l.external_id = 'retail-001' AND c.name = 'Retail') OR
  (l.external_id = 'prop-001' AND c.name = 'Property') OR
  (l.external_id = 'log-001' AND c.name = 'Logistics')
)
ON CONFLICT DO NOTHING;

-- Atributos adicionales de ubicación
WITH loc AS (
  SELECT location_id, external_id FROM locations
)
INSERT INTO location_attributes (location_id, name, value)
SELECT l.location_id, v.name, v.value
FROM loc l
JOIN (VALUES
  ('mcd-001', 'parking_spaces', '12'),
  ('mcd-001', 'drive_thru', 'true'),
  ('sbux-001', 'terrace', 'true'),
  ('retail-001', 'anchor_tenants', '5'),
  ('retail-001', 'foot_traffic_estimate', '4200'),
  ('prop-001', 'land_area_m2', '1500'),
  ('log-001', 'dock_bays', '8')
) AS v(external_id, name, value) ON l.external_id = v.external_id
ON CONFLICT DO NOTHING;

-- Indicadores de ubicación
WITH loc AS (
  SELECT location_id, external_id FROM locations
)
INSERT INTO location_indicators (location_id, indicator_name, indicator_date, value, metadata)
SELECT l.location_id, v.indicator_name, CURRENT_DATE, v.value, v.metadata
FROM loc l
JOIN (VALUES
  ('mcd-001', 'foot_traffic', 320.0, jsonb_build_object('peak_hour', '12:00-13:00')),
  ('sbux-001', 'foot_traffic', 180.0, jsonb_build_object('peak_hour', '15:00-16:00')),
  ('retail-001', 'foot_traffic', 5200.0, jsonb_build_object('peak_hour', '11:00-14:00')),
  ('prop-001', 'development_index', 78.0, jsonb_build_object('growth_rate', '12%')),
  ('log-001', 'throughput', 860.0, jsonb_build_object('vehicles_per_hour', 45))
) AS v(external_id, indicator_name, value, metadata) ON l.external_id = v.external_id
ON CONFLICT DO NOTHING;

-- Historias de métricas
INSERT INTO location_histories (location_id, source_id, observed_at, metric)
SELECT l.location_id, s.source_id, now() - interval '15 minutes', jsonb_build_object('queue_minutes', 4, 'occupancy', 0.78)
FROM locations l
JOIN data_sources s ON s.name = 'Google Maps'
WHERE l.external_id = 'mcd-001'
UNION ALL
SELECT l.location_id, s.source_id, now() - interval '8 minutes', jsonb_build_object('queue_minutes', 18, 'occupancy', 0.92)
FROM locations l
JOIN data_sources s ON s.name = 'Google Maps'
WHERE l.external_id = 'sbux-001'
UNION ALL
SELECT l.location_id, s.source_id, now() - interval '20 minutes', jsonb_build_object('on_hand_orders', 14, 'throughput', 760)
FROM locations l
JOIN data_sources s ON s.name = 'POS System'
WHERE l.external_id = 'retail-001';

-- Riesgos de ubicación
INSERT INTO risk_assessments (location_id, flood_risk, landslide_risk, crime_risk, climate_exposure, score, details)
SELECT l.location_id, v.flood_risk, v.landslide_risk, v.crime_risk, v.climate_exposure, v.score, v.details
FROM locations l
JOIN (VALUES
  ('mcd-001', 0.12, 0.08, 0.15, 0.22, 0.89, jsonb_build_object('notes', 'Riesgo moderado pero aceptable')),
  ('sbux-001', 0.10, 0.05, 0.12, 0.18, 0.92, jsonb_build_object('notes', 'Riesgo bajo y estable')),
  ('prop-001', 0.30, 0.25, 0.20, 0.55, 0.62, jsonb_build_object('notes', 'Zona de crecimiento con cierto riesgo climático')),
  ('log-001', 0.08, 0.03, 0.14, 0.12, 0.94, jsonb_build_object('notes', 'Ubicación logística con buen acceso y bajo riesgo'))
) AS v(external_id, flood_risk, landslide_risk, crime_risk, climate_exposure, score, details) ON l.external_id = v.external_id
ON CONFLICT DO NOTHING;

-- Avalúos inmobiliarios
INSERT INTO property_valuations (
  location_id, valued_at, land_area_m2, price_per_m2, estimated_value,
  annual_appreciation_pct, development_potential, zoning, details
)
SELECT
  l.location_id, CURRENT_DATE, 1500, 4200000, 6300000000,
  12.5, 84, 'Residencial de densidad media',
  jsonb_build_object('buildable_area_m2', 3600, 'market_liquidity', 'media-alta', 'source', 'Property Registry')
FROM locations l
WHERE l.external_id = 'prop-001'
  AND NOT EXISTS (
    SELECT 1 FROM property_valuations pv
    WHERE pv.location_id = l.location_id AND pv.valued_at = CURRENT_DATE
  );

-- Áreas de mercado y scoring
INSERT INTO market_areas (name, city, region, country, geometry)
VALUES
  ('Centro Histórico', 'Bogotá', 'Cundinamarca', 'Colombia', jsonb_build_object(
    'type', 'Polygon',
    'coordinates', jsonb_build_array(
      jsonb_build_array(
        jsonb_build_array(-74.0750, 4.7100),
        jsonb_build_array(-74.0680, 4.7150),
        jsonb_build_array(-74.0600, 4.7120),
        jsonb_build_array(-74.0630, 4.7080),
        jsonb_build_array(-74.0750, 4.7100)
      )
    )
  )),
  ('Zona Norte', 'Bogotá', 'Cundinamarca', 'Colombia', jsonb_build_object(
    'type', 'Polygon',
    'coordinates', jsonb_build_array(
      jsonb_build_array(
        jsonb_build_array(-74.0650, 4.7250),
        jsonb_build_array(-74.0600, 4.7300),
        jsonb_build_array(-74.0530, 4.7280),
        jsonb_build_array(-74.0550, 4.7220),
        jsonb_build_array(-74.0650, 4.7250)
      )
    )
  ))
ON CONFLICT DO NOTHING;

INSERT INTO location_market_scores (location_id, market_area_id, category, score, details)
SELECT l.location_id, m.market_area_id, 'retail_potential', 82.5, jsonb_build_object('demand', 'alto', 'supply', 'medio')
FROM locations l
JOIN market_areas m ON m.name = 'Zona Norte'
WHERE l.external_id = 'retail-001'
UNION ALL
SELECT l.location_id, m.market_area_id, 'route_accessibility', 91.0, jsonb_build_object('transport', 'excelente')
FROM locations l
JOIN market_areas m ON m.name = 'Centro Histórico'
WHERE l.external_id = 'log-001';

-- Zonas retail y análisis de competencia
INSERT INTO retail_zones (name, city, region, country, population_density, pedestrian_traffic_score, vehicle_traffic_score, purchasing_power_index)
VALUES
  ('Norte Comercial', 'Bogotá', 'Cundinamarca', 'Colombia', 13400.25, 88.5, 72.1, 87.3)
ON CONFLICT DO NOTHING;

INSERT INTO competition_analysis (retail_zone_id, competitor_name, category, proximity_meters, relative_strength)
SELECT rz.retail_zone_id, 'Centro Retail Plaza', 'Retail', 220, 0.74
FROM retail_zones rz
WHERE rz.name = 'Norte Comercial';

INSERT INTO site_suitability_scores (location_id, retail_zone_id, score_category, score_value, details)
SELECT l.location_id, rz.retail_zone_id, 'location_fit', 91.2, jsonb_build_object('accessibility', 'alta', 'demand', 'fuerte')
FROM locations l
JOIN retail_zones rz ON rz.name = 'Norte Comercial'
WHERE l.external_id = 'retail-001';

-- Perfiles espaciales y tendencias de riesgo
INSERT INTO spatial_profiles (location_id, profile_name, description, spatial_score, geometry, metadata)
SELECT l.location_id, 'Perfil de cobertura urbana', 'Análisis de accesibilidad, movilidad y proximidad', 86.5,
  jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(l.longitude, l.latitude)),
  jsonb_build_object('transport', 'metro cercano', 'walkscore', 78)
FROM locations l
WHERE l.external_id = 'retail-001';

INSERT INTO risk_components (risk_id, component_type, component_score, notes)
SELECT r.risk_id, 'Flood', 0.12, 'Riesgo de inundación calculado con datos de cuencas'
FROM risk_assessments r
JOIN locations l ON l.location_id = r.location_id
WHERE l.external_id = 'mcd-001';

INSERT INTO risk_components (risk_id, component_type, component_score, notes)
SELECT r.risk_id, 'Crime', 0.15, 'Índice de criminalidad local'
FROM risk_assessments r
JOIN locations l ON l.location_id = r.location_id
WHERE l.external_id = 'mcd-001';

INSERT INTO location_risk_trends (location_id, trend_date, risk_vector, trend_score)
SELECT l.location_id, CURRENT_DATE - interval '7 days', jsonb_build_object('flood', 0.12, 'crime', 0.15, 'climate', 0.22), 0.88
FROM locations l
WHERE l.external_id = 'mcd-001';

INSERT INTO location_risk_trends (location_id, trend_date, risk_vector, trend_score)
SELECT l.location_id, CURRENT_DATE - interval '7 days', jsonb_build_object('flood', 0.10, 'crime', 0.12, 'climate', 0.18), 0.92
FROM locations l
WHERE l.external_id = 'sbux-001';

-- Recomendaciones de ejemplo
INSERT INTO recommendations (location_id, query_type, parameters, result, score)
SELECT l.location_id, 'quiere-ahorrar-tiempo', jsonb_build_object('distance_m', 1800, 'alternative_distance_m', 2400),
  jsonb_build_object('message', 'El restaurante a 1,8 km tiene una fila estimada de 4 minutos. El más cercano tiene una espera de 18 minutos. Si recorres 600 metros adicionales ahorrarás 14 minutos.'),
  91.5
FROM locations l
WHERE l.external_id = 'mcd-001';

-- EarthArt: unidades territoriales de ejemplo
INSERT INTO territorial_units (external_id, name, unit_type, city, region, country, population, population_growth_pct, area_km2, latitude, longitude, geom)
VALUES
  ('ter-001', 'Barrio Suba Rincón', 'barrio', 'Bogotá', 'Cundinamarca', 'Colombia', 8400, 18.0, 3.2, 4.7460, -74.0930,
    ST_SetSRID(ST_MakePoint(-74.0930, 4.7460), 4326)),
  ('ter-002', 'Vereda La Calera Centro', 'vereda', 'La Calera', 'Cundinamarca', 'Colombia', 2100, 6.5, 12.4, 4.7208, -73.9686,
    ST_SetSRID(ST_MakePoint(-73.9686, 4.7208), 4326))
ON CONFLICT (external_id) DO NOTHING;

-- Instalaciones (colegios) usadas por el detector de brechas
INSERT INTO territorial_facilities (unit_id, facility_type, name, capacity, latitude, longitude, geom)
SELECT tu.unit_id, 'school', 'Colegio Distrital El Rincón', 900, 4.7180, -74.0870, ST_SetSRID(ST_MakePoint(-74.0870, 4.7180), 4326)
FROM territorial_units tu WHERE tu.external_id = 'ter-001'
UNION ALL
SELECT tu.unit_id, 'school', 'Escuela Rural La Calera', 250, 4.7150, -73.9700, ST_SetSRID(ST_MakePoint(-73.9700, 4.7150), 4326)
FROM territorial_units tu WHERE tu.external_id = 'ter-002';

-- Puntajes por dimensión (Educación, Salud, Infraestructura, Economía, Ambiente, Seguridad, Conectividad, Vivienda, Servicios)
INSERT INTO territorial_dimension_scores (unit_id, dimension, score, details)
SELECT tu.unit_id, v.dimension, v.score, v.details
FROM territorial_units tu
JOIN (VALUES
  ('ter-001', 'education', 48.0, jsonb_build_object('notes', 'Cobertura escolar insuficiente frente al crecimiento poblacional')),
  ('ter-001', 'health', 61.0, jsonb_build_object('notes', 'Un centro de salud a 2.1 km')),
  ('ter-001', 'infrastructure', 42.0, jsonb_build_object('notes', 'Infraestructura vial y de servicios rezagada')),
  ('ter-001', 'economy', 58.0, jsonb_build_object('notes', 'Comercio local en crecimiento')),
  ('ter-001', 'environment', 65.0, jsonb_build_object('notes', 'Cobertura vegetal estable')),
  ('ter-001', 'security', 55.0, jsonb_build_object('notes', 'Índice de criminalidad moderado')),
  ('ter-001', 'connectivity', 40.0, jsonb_build_object('notes', 'Déficit de transporte público')),
  ('ter-001', 'housing', 76.0, jsonb_build_object('notes', 'Concentración de nuevos desarrollos inmobiliarios')),
  ('ter-001', 'services', 60.0, jsonb_build_object('notes', 'Cobertura de servicios públicos parcial')),
  ('ter-002', 'education', 70.0, jsonb_build_object('notes', 'Escuela rural con cobertura adecuada')),
  ('ter-002', 'health', 66.0, jsonb_build_object('notes', 'Puesto de salud cercano')),
  ('ter-002', 'infrastructure', 72.0, jsonb_build_object('notes', 'Vías en buen estado')),
  ('ter-002', 'economy', 64.0, jsonb_build_object('notes', 'Actividad agrícola estable')),
  ('ter-002', 'environment', 88.0, jsonb_build_object('notes', 'Alta cobertura vegetal y cuerpos de agua protegidos')),
  ('ter-002', 'security', 80.0, jsonb_build_object('notes', 'Baja criminalidad rural')),
  ('ter-002', 'connectivity', 58.0, jsonb_build_object('notes', 'Transporte intermunicipal limitado')),
  ('ter-002', 'housing', 45.0, jsonb_build_object('notes', 'Bajo desarrollo inmobiliario')),
  ('ter-002', 'services', 62.0, jsonb_build_object('notes', 'Servicios públicos rurales básicos'))
) AS v(external_id, dimension, score, details) ON tu.external_id = v.external_id
ON CONFLICT (unit_id, dimension, measured_at) DO NOTHING;

