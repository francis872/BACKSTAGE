-- Consolidated schema for BACKSTAGE Intelligence (Neon/PostgreSQL + PostGIS)
-- Generated from migrations 1680000000000 through 1680000007000 to bypass a
-- node-pg-migrate addConstraint argument-order bug in the original files.

CREATE EXTENSION IF NOT EXISTS postgis;

-- 1) Initial schema -----------------------------------------------------
CREATE TABLE IF NOT EXISTS data_sources (
  source_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  location_id SERIAL PRIMARY KEY,
  external_id TEXT UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  address TEXT,
  city TEXT,
  region TEXT,
  country TEXT NOT NULL DEFAULT 'Colombia',
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  capacity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location_categories (
  category_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS location_category_assignments (
  assignment_id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES location_categories(category_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS location_attributes (
  attribute_id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT
);

CREATE TABLE IF NOT EXISTS location_indicators (
  indicator_id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  indicator_name TEXT NOT NULL,
  indicator_date DATE NOT NULL,
  value NUMERIC,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(location_id, indicator_name, indicator_date)
);

CREATE TABLE IF NOT EXISTS location_histories (
  history_id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  source_id INTEGER REFERENCES data_sources(source_id) ON DELETE SET NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  metric JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  risk_id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  flood_risk NUMERIC(5,2),
  landslide_risk NUMERIC(5,2),
  crime_risk NUMERIC(5,2),
  climate_exposure NUMERIC(5,2),
  score NUMERIC(5,2),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_areas (
  market_area_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  region TEXT,
  country TEXT NOT NULL DEFAULT 'Colombia',
  geometry JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location_market_scores (
  score_id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  market_area_id INTEGER NOT NULL REFERENCES market_areas(market_area_id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  score NUMERIC(5,2),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recommendations (
  recommendation_id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  query_type TEXT NOT NULL,
  parameters JSONB,
  result JSONB,
  score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_external_id ON locations(external_id);
CREATE INDEX IF NOT EXISTS idx_location_histories_location_id ON location_histories(location_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_location_id ON risk_assessments(location_id);
CREATE INDEX IF NOT EXISTS idx_location_market_scores_location_id ON location_market_scores(location_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_location_id ON recommendations(location_id);

-- 2) Retail intelligence -------------------------------------------------
CREATE TABLE IF NOT EXISTS retail_zones (
  retail_zone_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  region TEXT,
  country TEXT NOT NULL DEFAULT 'Colombia',
  population_density NUMERIC(10,2),
  pedestrian_traffic_score NUMERIC(5,2),
  vehicle_traffic_score NUMERIC(5,2),
  purchasing_power_index NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competition_analysis (
  competition_id SERIAL PRIMARY KEY,
  retail_zone_id INTEGER NOT NULL REFERENCES retail_zones(retail_zone_id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  category TEXT,
  proximity_meters INTEGER,
  relative_strength NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_suitability_scores (
  suitability_id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  retail_zone_id INTEGER NOT NULL REFERENCES retail_zones(retail_zone_id) ON DELETE CASCADE,
  score_category TEXT NOT NULL,
  score_value NUMERIC(5,2),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retail_zones_city ON retail_zones(city);
CREATE INDEX IF NOT EXISTS idx_site_suitability_scores_location_id ON site_suitability_scores(location_id);
CREATE INDEX IF NOT EXISTS idx_site_suitability_scores_retail_zone_id ON site_suitability_scores(retail_zone_id);

-- 3) Spatial and risk intelligence ---------------------------------------
CREATE TABLE IF NOT EXISTS spatial_profiles (
  profile_id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  profile_name TEXT NOT NULL,
  description TEXT,
  spatial_score NUMERIC(5,2),
  geometry JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_components (
  component_id SERIAL PRIMARY KEY,
  risk_id INTEGER NOT NULL REFERENCES risk_assessments(risk_id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  component_score NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location_risk_trends (
  trend_id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  trend_date DATE NOT NULL,
  risk_vector JSONB,
  trend_score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spatial_profiles_location_id ON spatial_profiles(location_id);
CREATE INDEX IF NOT EXISTS idx_risk_components_risk_id ON risk_components(risk_id);
CREATE INDEX IF NOT EXISTS idx_location_risk_trends_location_id ON location_risk_trends(location_id);

-- 4) Geometry columns ------------------------------------------------------
ALTER TABLE locations ADD COLUMN IF NOT EXISTS geom geometry(Point,4326);
UPDATE locations SET geom = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)
  WHERE longitude IS NOT NULL AND latitude IS NOT NULL AND geom IS NULL;
CREATE INDEX IF NOT EXISTS idx_locations_geom ON locations USING gist(geom);

ALTER TABLE market_areas ADD COLUMN IF NOT EXISTS geom geometry(Polygon,4326);
CREATE INDEX IF NOT EXISTS idx_market_areas_geom ON market_areas USING gist(geom);

ALTER TABLE spatial_profiles ADD COLUMN IF NOT EXISTS geom geometry(Point,4326);
CREATE INDEX IF NOT EXISTS idx_spatial_profiles_geom ON spatial_profiles USING gist(geom);

-- 5) Security & integration schema ----------------------------------------
CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'analyst', 'viewer'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS integration_sources (
  source_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  config JSONB,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_events (
  event_id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES integration_sources(source_id) ON DELETE CASCADE,
  external_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS scoring_models (
  model_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scoring_results (
  result_id SERIAL PRIMARY KEY,
  model_id INTEGER REFERENCES scoring_models(model_id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL,
  details JSONB,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scoring_results_location_id ON scoring_results(location_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_status ON integration_events(status);

-- 6) Real estate intelligence ----------------------------------------------
CREATE TABLE IF NOT EXISTS property_valuations (
  valuation_id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  valued_at DATE NOT NULL DEFAULT CURRENT_DATE,
  land_area_m2 NUMERIC(12,2) NOT NULL,
  price_per_m2 NUMERIC(14,2) NOT NULL,
  estimated_value NUMERIC(16,2) NOT NULL,
  annual_appreciation_pct NUMERIC(5,2),
  development_potential NUMERIC(5,2),
  zoning TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_property_valuations_location_date ON property_valuations(location_id, valued_at);

-- 7) EarthArt territorial schema -------------------------------------------
CREATE TABLE IF NOT EXISTS territorial_units (
  unit_id SERIAL PRIMARY KEY,
  external_id TEXT UNIQUE,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  parent_unit_id INTEGER REFERENCES territorial_units(unit_id) ON DELETE SET NULL,
  city TEXT,
  region TEXT,
  country TEXT NOT NULL DEFAULT 'Colombia',
  population INTEGER,
  population_growth_pct NUMERIC(5,2),
  area_km2 NUMERIC(10,2),
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  geom geometry(Geometry,4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_territorial_units_geom ON territorial_units USING gist(geom);

CREATE TABLE IF NOT EXISTS territorial_facilities (
  facility_id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES territorial_units(unit_id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES locations(location_id) ON DELETE SET NULL,
  facility_type TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  geom geometry(Point,4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_territorial_facilities_unit_id ON territorial_facilities(unit_id);
CREATE INDEX IF NOT EXISTS idx_territorial_facilities_geom ON territorial_facilities USING gist(geom);

CREATE TABLE IF NOT EXISTS territorial_dimension_scores (
  score_id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES territorial_units(unit_id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('education','health','infrastructure','economy','environment','security','connectivity','housing','services')),
  score NUMERIC(5,2) NOT NULL,
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(unit_id, dimension, measured_at)
);
CREATE INDEX IF NOT EXISTS idx_territorial_dimension_scores_unit_id ON territorial_dimension_scores(unit_id);

CREATE TABLE IF NOT EXISTS territorial_index_snapshots (
  index_id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES territorial_units(unit_id) ON DELETE CASCADE,
  composite_score NUMERIC(5,2) NOT NULL,
  breakdown JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_territorial_index_snapshots_unit_date ON territorial_index_snapshots(unit_id, computed_at);

CREATE TABLE IF NOT EXISTS territorial_gaps (
  gap_id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES territorial_units(unit_id) ON DELETE CASCADE,
  gap_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  message TEXT NOT NULL,
  metric JSONB,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_territorial_gaps_unit_id ON territorial_gaps(unit_id);

CREATE TABLE IF NOT EXISTS territorial_simulations (
  simulation_id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES territorial_units(unit_id) ON DELETE CASCADE,
  scenario_type TEXT NOT NULL,
  parameters JSONB NOT NULL,
  result JSONB NOT NULL,
  recommendation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_territorial_simulations_unit_id ON territorial_simulations(unit_id);

-- 8) Geostrategic MVP schema --------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  organization_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  role_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_role_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
  organization_id INTEGER REFERENCES organizations(organization_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_id, organization_id)
);

CREATE TABLE IF NOT EXISTS layer_catalog (
  layer_id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  geometry_type TEXT NOT NULL,
  source_name TEXT,
  source_table TEXT NOT NULL,
  id_column TEXT NOT NULL DEFAULT 'id',
  name_column TEXT,
  geom_column TEXT NOT NULL DEFAULT 'geom',
  srid INTEGER NOT NULL DEFAULT 4326,
  coverage TEXT,
  style_json JSONB NOT NULL DEFAULT '{}',
  min_zoom INTEGER NOT NULL DEFAULT 8,
  max_zoom INTEGER NOT NULL DEFAULT 19,
  confidence_level TEXT NOT NULL DEFAULT 'demo',
  is_visible_default BOOLEAN NOT NULL DEFAULT false,
  allowed_roles TEXT[] NOT NULL DEFAULT '{"viewer","analyst","admin"}',
  status TEXT NOT NULL DEFAULT 'active',
  layer_version TEXT NOT NULL DEFAULT '1.0.0',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_locations (
  business_location_id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'store',
  is_active BOOLEAN NOT NULL DEFAULT true,
  opened_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_locations_location_id ON business_locations(location_id);

CREATE TABLE IF NOT EXISTS competitors (
  competitor_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'restaurant',
  address TEXT,
  city TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  geom geometry(Point,4326),
  source_name TEXT,
  source_updated_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competitors_geom ON competitors USING gist(geom);

CREATE TABLE IF NOT EXISTS points_of_interest (
  poi_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  address TEXT,
  city TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  geom geometry(Point,4326),
  source_name TEXT,
  source_updated_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_points_of_interest_geom ON points_of_interest USING gist(geom);

CREATE TABLE IF NOT EXISTS territorial_zones (
  zone_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL DEFAULT 'district',
  city TEXT,
  population_total INTEGER,
  geom geometry(Polygon,4326) NOT NULL,
  source_name TEXT,
  source_updated_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_territorial_zones_geom ON territorial_zones USING gist(geom);

CREATE TABLE IF NOT EXISTS demographic_indicators (
  demographic_indicator_id SERIAL PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES territorial_zones(zone_id) ON DELETE CASCADE,
  indicator_name TEXT NOT NULL,
  value NUMERIC(14,2) NOT NULL,
  as_of_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_name TEXT,
  confidence_level TEXT NOT NULL DEFAULT 'demo',
  data_mode TEXT NOT NULL DEFAULT 'demo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_demographic_indicators_zone_indicator_date
  ON demographic_indicators(zone_id, indicator_name, as_of_date);

CREATE TABLE IF NOT EXISTS analysis_runs (
  analysis_run_id SERIAL PRIMARY KEY,
  project_name TEXT NOT NULL,
  city TEXT,
  objective TEXT,
  criteria_weights JSONB NOT NULL DEFAULT '{}',
  recommendation_text TEXT,
  recommendation_payload JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  requested_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  organization_id INTEGER REFERENCES organizations(organization_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analysis_results (
  analysis_result_id SERIAL PRIMARY KEY,
  analysis_run_id INTEGER NOT NULL REFERENCES analysis_runs(analysis_run_id) ON DELETE CASCADE,
  rank_position INTEGER NOT NULL,
  candidate_name TEXT NOT NULL,
  location_id INTEGER REFERENCES locations(location_id) ON DELETE SET NULL,
  score_total NUMERIC(6,2) NOT NULL,
  score_by_dimension JSONB NOT NULL DEFAULT '{}',
  metrics JSONB NOT NULL DEFAULT '{}',
  explanation JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analysis_results_run_rank ON analysis_results(analysis_run_id, rank_position);

-- 9) Multi-organization hardening + audit logs ------------------------------
ALTER TABLE locations ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(organization_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_locations_org_id ON locations(organization_id);

ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(organization_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_risk_assessments_org_id ON risk_assessments(organization_id);

ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(organization_id) ON DELETE SET NULL;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS requested_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recommendations_org_id ON recommendations(organization_id);

ALTER TABLE layer_catalog ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(organization_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_layer_catalog_org_id ON layer_catalog(organization_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_log_id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(organization_id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  request_method TEXT NOT NULL,
  request_path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created_at ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
