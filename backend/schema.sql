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
  country TEXT DEFAULT 'Colombia',
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  capacity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  source_id INTEGER REFERENCES data_sources(source_id),
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
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_histories_location_id ON location_histories(location_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_location_id ON risk_assessments(location_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_location_id ON recommendations(location_id);
CREATE INDEX IF NOT EXISTS idx_property_valuations_location_date ON property_valuations(location_id, valued_at DESC);
