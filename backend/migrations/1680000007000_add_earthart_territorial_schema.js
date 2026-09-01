/* eslint-disable camelcase */
exports.shorthands = undefined;

const DIMENSIONS = ['education', 'health', 'infrastructure', 'economy', 'environment', 'security', 'connectivity', 'housing', 'services'];

exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS postgis;');

  pgm.createTable('territorial_units', {
    unit_id: { type: 'serial', primaryKey: true },
    external_id: { type: 'text', unique: true },
    name: { type: 'text', notNull: true },
    unit_type: { type: 'text', notNull: true },
    parent_unit_id: { type: 'integer' },
    city: { type: 'text' },
    region: { type: 'text' },
    country: { type: 'text', notNull: true, default: 'Colombia' },
    population: { type: 'integer' },
    population_growth_pct: { type: 'numeric(5,2)' },
    area_km2: { type: 'numeric(10,2)' },
    latitude: { type: 'numeric(9,6)' },
    longitude: { type: 'numeric(9,6)' },
    geom: { type: 'geometry(Geometry,4326)' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('territorial_units', 'territorial_units_parent_fk', {
    foreignKeys: {
      columns: 'parent_unit_id',
      references: 'territorial_units(unit_id)',
      onDelete: 'set null'
    }
  });
  pgm.createIndex('territorial_units', 'geom', { method: 'gist', name: 'idx_territorial_units_geom' });

  pgm.createTable('territorial_facilities', {
    facility_id: { type: 'serial', primaryKey: true },
    unit_id: { type: 'integer', notNull: true },
    location_id: { type: 'integer' },
    facility_type: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    capacity: { type: 'integer' },
    latitude: { type: 'numeric(9,6)' },
    longitude: { type: 'numeric(9,6)' },
    geom: { type: 'geometry(Point,4326)' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('territorial_facilities', 'territorial_facilities_unit_fk', {
    foreignKeys: {
      columns: 'unit_id',
      references: 'territorial_units(unit_id)',
      onDelete: 'cascade'
    }
  });
  pgm.addConstraint('territorial_facilities', 'territorial_facilities_location_fk', {
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'set null'
    }
  });
  pgm.createIndex('territorial_facilities', 'unit_id', { name: 'idx_territorial_facilities_unit_id' });
  pgm.createIndex('territorial_facilities', 'geom', { method: 'gist', name: 'idx_territorial_facilities_geom' });

  pgm.createTable('territorial_dimension_scores', {
    score_id: { type: 'serial', primaryKey: true },
    unit_id: { type: 'integer', notNull: true },
    dimension: { type: 'text', notNull: true },
    score: { type: 'numeric(5,2)', notNull: true },
    measured_at: { type: 'date', notNull: true, default: pgm.func('CURRENT_DATE') },
    details: { type: 'jsonb' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('territorial_dimension_scores', 'territorial_dimension_scores_unit_fk', {
    foreignKeys: {
      columns: 'unit_id',
      references: 'territorial_units(unit_id)',
      onDelete: 'cascade'
    }
  });
  pgm.addConstraint('territorial_dimension_scores', 'territorial_dimension_scores_dimension_check', {
    check: `dimension IN (${DIMENSIONS.map((d) => `'${d}'`).join(', ')})`
  });
  pgm.addConstraint('territorial_dimension_scores', 'territorial_dimension_scores_unique', {
    unique: ['unit_id', 'dimension', 'measured_at']
  });
  pgm.createIndex('territorial_dimension_scores', 'unit_id', { name: 'idx_territorial_dimension_scores_unit_id' });

  pgm.createTable('territorial_index_snapshots', {
    index_id: { type: 'serial', primaryKey: true },
    unit_id: { type: 'integer', notNull: true },
    composite_score: { type: 'numeric(5,2)', notNull: true },
    breakdown: { type: 'jsonb', notNull: true },
    computed_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('territorial_index_snapshots', 'territorial_index_snapshots_unit_fk', {
    foreignKeys: {
      columns: 'unit_id',
      references: 'territorial_units(unit_id)',
      onDelete: 'cascade'
    }
  });
  pgm.createIndex('territorial_index_snapshots', ['unit_id', 'computed_at'], { name: 'idx_territorial_index_snapshots_unit_date' });

  pgm.createTable('territorial_gaps', {
    gap_id: { type: 'serial', primaryKey: true },
    unit_id: { type: 'integer', notNull: true },
    gap_type: { type: 'text', notNull: true },
    severity: { type: 'text', notNull: true, default: 'medium' },
    message: { type: 'text', notNull: true },
    metric: { type: 'jsonb' },
    detected_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
    resolved: { type: 'boolean', notNull: true, default: false }
  });
  pgm.addConstraint('territorial_gaps', 'territorial_gaps_unit_fk', {
    foreignKeys: {
      columns: 'unit_id',
      references: 'territorial_units(unit_id)',
      onDelete: 'cascade'
    }
  });
  pgm.createIndex('territorial_gaps', 'unit_id', { name: 'idx_territorial_gaps_unit_id' });

  pgm.createTable('territorial_simulations', {
    simulation_id: { type: 'serial', primaryKey: true },
    unit_id: { type: 'integer', notNull: true },
    scenario_type: { type: 'text', notNull: true },
    parameters: { type: 'jsonb', notNull: true },
    result: { type: 'jsonb', notNull: true },
    recommendation: { type: 'text' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('territorial_simulations', 'territorial_simulations_unit_fk', {
    foreignKeys: {
      columns: 'unit_id',
      references: 'territorial_units(unit_id)',
      onDelete: 'cascade'
    }
  });
  pgm.createIndex('territorial_simulations', 'unit_id', { name: 'idx_territorial_simulations_unit_id' });
};

exports.down = (pgm) => {
  pgm.dropTable('territorial_simulations', { ifExists: true });
  pgm.dropTable('territorial_gaps', { ifExists: true });
  pgm.dropTable('territorial_index_snapshots', { ifExists: true });
  pgm.dropTable('territorial_dimension_scores', { ifExists: true });
  pgm.dropTable('territorial_facilities', { ifExists: true });
  pgm.dropTable('territorial_units', { ifExists: true });
};
