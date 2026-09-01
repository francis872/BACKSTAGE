/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS postgis;');

  pgm.createTable('organizations', {
    organization_id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true },
    slug: { type: 'text', notNull: true, unique: true },
    status: { type: 'text', notNull: true, default: 'active' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });

  pgm.createTable('roles', {
    role_id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true, unique: true },
    description: { type: 'text' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });

  pgm.createTable('user_roles', {
    user_role_id: { type: 'serial', primaryKey: true },
    user_id: { type: 'integer', notNull: true },
    role_id: { type: 'integer', notNull: true },
    organization_id: { type: 'integer' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.addConstraint('user_roles', 'user_roles_user_fk', {
    foreignKeys: { columns: 'user_id', references: 'users(user_id)', onDelete: 'cascade' }
  });
  pgm.addConstraint('user_roles', 'user_roles_role_fk', {
    foreignKeys: { columns: 'role_id', references: 'roles(role_id)', onDelete: 'cascade' }
  });
  pgm.addConstraint('user_roles', 'user_roles_org_fk', {
    foreignKeys: { columns: 'organization_id', references: 'organizations(organization_id)', onDelete: 'set null' }
  });
  pgm.addConstraint('user_roles', 'user_roles_unique', { unique: ['user_id', 'role_id', 'organization_id'] });

  pgm.createTable('layer_catalog', {
    layer_id: { type: 'serial', primaryKey: true },
    slug: { type: 'text', notNull: true, unique: true },
    name: { type: 'text', notNull: true },
    category: { type: 'text', notNull: true },
    description: { type: 'text' },
    geometry_type: { type: 'text', notNull: true },
    source_name: { type: 'text' },
    source_table: { type: 'text', notNull: true },
    id_column: { type: 'text', notNull: true, default: 'id' },
    name_column: { type: 'text' },
    geom_column: { type: 'text', notNull: true, default: 'geom' },
    srid: { type: 'integer', notNull: true, default: 4326 },
    coverage: { type: 'text' },
    style_json: { type: 'jsonb', notNull: true, default: '{}' },
    min_zoom: { type: 'integer', notNull: true, default: 8 },
    max_zoom: { type: 'integer', notNull: true, default: 19 },
    confidence_level: { type: 'text', notNull: true, default: 'demo' },
    is_visible_default: { type: 'boolean', notNull: true, default: false },
    allowed_roles: { type: 'text[]', notNull: true, default: '{viewer,analyst,admin}' },
    status: { type: 'text', notNull: true, default: 'active' },
    layer_version: { type: 'text', notNull: true, default: '1.0.0' },
    updated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });

  pgm.createTable('business_locations', {
    business_location_id: { type: 'serial', primaryKey: true },
    location_id: { type: 'integer', notNull: true },
    brand_name: { type: 'text', notNull: true },
    business_type: { type: 'text', notNull: true, default: 'store' },
    is_active: { type: 'boolean', notNull: true, default: true },
    opened_at: { type: 'date' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.addConstraint('business_locations', 'business_locations_location_fk', {
    foreignKeys: { columns: 'location_id', references: 'locations(location_id)', onDelete: 'cascade' }
  });
  pgm.createIndex('business_locations', 'location_id', { name: 'idx_business_locations_location_id' });

  pgm.createTable('competitors', {
    competitor_id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true },
    brand_name: { type: 'text', notNull: true },
    category: { type: 'text', notNull: true, default: 'restaurant' },
    address: { type: 'text' },
    city: { type: 'text' },
    latitude: { type: 'numeric(9,6)' },
    longitude: { type: 'numeric(9,6)' },
    geom: { type: 'geometry(Point,4326)' },
    source_name: { type: 'text' },
    source_updated_at: { type: 'date' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.createIndex('competitors', 'geom', { method: 'gist', name: 'idx_competitors_geom' });

  pgm.createTable('points_of_interest', {
    poi_id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true },
    category: { type: 'text', notNull: true },
    address: { type: 'text' },
    city: { type: 'text' },
    latitude: { type: 'numeric(9,6)' },
    longitude: { type: 'numeric(9,6)' },
    geom: { type: 'geometry(Point,4326)' },
    source_name: { type: 'text' },
    source_updated_at: { type: 'date' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.createIndex('points_of_interest', 'geom', { method: 'gist', name: 'idx_points_of_interest_geom' });

  pgm.createTable('territorial_zones', {
    zone_id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true },
    zone_type: { type: 'text', notNull: true, default: 'district' },
    city: { type: 'text' },
    population_total: { type: 'integer' },
    geom: { type: 'geometry(Polygon,4326)', notNull: true },
    source_name: { type: 'text' },
    source_updated_at: { type: 'date' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.createIndex('territorial_zones', 'geom', { method: 'gist', name: 'idx_territorial_zones_geom' });

  pgm.createTable('demographic_indicators', {
    demographic_indicator_id: { type: 'serial', primaryKey: true },
    zone_id: { type: 'integer', notNull: true },
    indicator_name: { type: 'text', notNull: true },
    value: { type: 'numeric(14,2)', notNull: true },
    as_of_date: { type: 'date', notNull: true, default: pgm.func('CURRENT_DATE') },
    source_name: { type: 'text' },
    confidence_level: { type: 'text', notNull: true, default: 'demo' },
    data_mode: { type: 'text', notNull: true, default: 'demo' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.addConstraint('demographic_indicators', 'demographic_indicators_zone_fk', {
    foreignKeys: { columns: 'zone_id', references: 'territorial_zones(zone_id)', onDelete: 'cascade' }
  });
  pgm.createIndex('demographic_indicators', ['zone_id', 'indicator_name', 'as_of_date'], {
    name: 'idx_demographic_indicators_zone_indicator_date'
  });

  pgm.createTable('analysis_runs', {
    analysis_run_id: { type: 'serial', primaryKey: true },
    project_name: { type: 'text', notNull: true },
    city: { type: 'text' },
    objective: { type: 'text' },
    criteria_weights: { type: 'jsonb', notNull: true, default: '{}' },
    recommendation_text: { type: 'text' },
    recommendation_payload: { type: 'jsonb' },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    requested_by_user_id: { type: 'integer' },
    organization_id: { type: 'integer' },
    status: { type: 'text', notNull: true, default: 'completed' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.addConstraint('analysis_runs', 'analysis_runs_user_fk', {
    foreignKeys: { columns: 'requested_by_user_id', references: 'users(user_id)', onDelete: 'set null' }
  });
  pgm.addConstraint('analysis_runs', 'analysis_runs_org_fk', {
    foreignKeys: { columns: 'organization_id', references: 'organizations(organization_id)', onDelete: 'set null' }
  });

  pgm.createTable('analysis_results', {
    analysis_result_id: { type: 'serial', primaryKey: true },
    analysis_run_id: { type: 'integer', notNull: true },
    rank_position: { type: 'integer', notNull: true },
    candidate_name: { type: 'text', notNull: true },
    location_id: { type: 'integer' },
    score_total: { type: 'numeric(6,2)', notNull: true },
    score_by_dimension: { type: 'jsonb', notNull: true, default: '{}' },
    metrics: { type: 'jsonb', notNull: true, default: '{}' },
    explanation: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.addConstraint('analysis_results', 'analysis_results_run_fk', {
    foreignKeys: { columns: 'analysis_run_id', references: 'analysis_runs(analysis_run_id)', onDelete: 'cascade' }
  });
  pgm.addConstraint('analysis_results', 'analysis_results_location_fk', {
    foreignKeys: { columns: 'location_id', references: 'locations(location_id)', onDelete: 'set null' }
  });
  pgm.createIndex('analysis_results', ['analysis_run_id', 'rank_position'], { name: 'idx_analysis_results_run_rank' });
};

exports.down = (pgm) => {
  pgm.dropTable('analysis_results', { ifExists: true });
  pgm.dropTable('analysis_runs', { ifExists: true });
  pgm.dropTable('demographic_indicators', { ifExists: true });
  pgm.dropTable('territorial_zones', { ifExists: true });
  pgm.dropTable('points_of_interest', { ifExists: true });
  pgm.dropTable('competitors', { ifExists: true });
  pgm.dropTable('business_locations', { ifExists: true });
  pgm.dropTable('layer_catalog', { ifExists: true });
  pgm.dropTable('user_roles', { ifExists: true });
  pgm.dropTable('roles', { ifExists: true });
  pgm.dropTable('organizations', { ifExists: true });
};
