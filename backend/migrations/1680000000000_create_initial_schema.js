/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('data_sources', {
    source_id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true, unique: true },
    category: { type: 'text', notNull: true },
    description: { type: 'text' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('locations', {
    location_id: { type: 'serial', primaryKey: true },
    external_id: { type: 'text', unique: true },
    name: { type: 'text', notNull: true },
    type: { type: 'text', notNull: true },
    address: { type: 'text' },
    city: { type: 'text' },
    region: { type: 'text' },
    country: { type: 'text', notNull: true, default: 'Colombia' },
    latitude: { type: 'numeric(9,6)' },
    longitude: { type: 'numeric(9,6)' },
    capacity: { type: 'integer' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('location_categories', {
    category_id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true, unique: true },
    description: { type: 'text' }
  });

  pgm.createTable('location_category_assignments', {
    assignment_id: { type: 'serial', primaryKey: true },
    location_id: { type: 'integer', notNull: true },
    category_id: { type: 'integer', notNull: true }
  });
  pgm.addConstraint('location_category_assignments', 'location_category_assignments_location_fk', {
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'cascade'
    }
  });
  pgm.addConstraint('location_category_assignments', 'location_category_assignments_category_fk', {
    foreignKeys: {
      columns: 'category_id',
      references: 'location_categories(category_id)',
      onDelete: 'cascade'
    }
  });

  pgm.createTable('location_attributes', {
    attribute_id: { type: 'serial', primaryKey: true },
    location_id: { type: 'integer', notNull: true },
    name: { type: 'text', notNull: true },
    value: { type: 'text' }
  });
  pgm.addConstraint('location_attributes', 'location_attributes_location_fk', {
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'cascade'
    }
  });

  pgm.createTable('location_indicators', {
    indicator_id: { type: 'serial', primaryKey: true },
    location_id: { type: 'integer', notNull: true },
    indicator_name: { type: 'text', notNull: true },
    indicator_date: { type: 'date', notNull: true },
    value: { type: 'numeric' },
    metadata: { type: 'jsonb' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('location_indicators', 'location_indicators_location_fk', {
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'cascade'
    }
  });
  pgm.addConstraint('location_indicators_unique', 'location_indicators', 'UNIQUE(location_id, indicator_name, indicator_date)');

  pgm.createTable('location_histories', {
    history_id: { type: 'serial', primaryKey: true },
    location_id: { type: 'integer', notNull: true },
    source_id: { type: 'integer' },
    observed_at: { type: 'timestamp with time zone', notNull: true },
    metric: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('location_histories_location_fk', {
    table: 'location_histories',
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'cascade'
    }
  });
  pgm.addConstraint('location_histories_source_fk', {
    table: 'location_histories',
    foreignKeys: {
      columns: 'source_id',
      references: 'data_sources(source_id)',
      onDelete: 'set null'
    }
  });

  pgm.createTable('risk_assessments', {
    risk_id: { type: 'serial', primaryKey: true },
    location_id: { type: 'integer', notNull: true },
    assessed_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
    flood_risk: { type: 'numeric(5,2)' },
    landslide_risk: { type: 'numeric(5,2)' },
    crime_risk: { type: 'numeric(5,2)' },
    climate_exposure: { type: 'numeric(5,2)' },
    score: { type: 'numeric(5,2)' },
    details: { type: 'jsonb' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('risk_assessments_location_fk', {
    table: 'risk_assessments',
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'cascade'
    }
  });

  pgm.createTable('market_areas', {
    market_area_id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true },
    city: { type: 'text' },
    region: { type: 'text' },
    country: { type: 'text', notNull: true, default: 'Colombia' },
    geometry: { type: 'jsonb' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('location_market_scores', {
    score_id: { type: 'serial', primaryKey: true },
    location_id: { type: 'integer', notNull: true },
    market_area_id: { type: 'integer', notNull: true },
    category: { type: 'text', notNull: true },
    score: { type: 'numeric(5,2)' },
    details: { type: 'jsonb' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('location_market_scores_location_fk', {
    table: 'location_market_scores',
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'cascade'
    }
  });
  pgm.addConstraint('location_market_scores_market_area_fk', {
    table: 'location_market_scores',
    foreignKeys: {
      columns: 'market_area_id',
      references: 'market_areas(market_area_id)',
      onDelete: 'cascade'
    }
  });

  pgm.createTable('recommendations', {
    recommendation_id: { type: 'serial', primaryKey: true },
    location_id: { type: 'integer', notNull: true },
    requested_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
    query_type: { type: 'text', notNull: true },
    parameters: { type: 'jsonb' },
    result: { type: 'jsonb' },
    score: { type: 'numeric(5,2)' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('recommendations_location_fk', {
    table: 'recommendations',
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'cascade'
    }
  });

  pgm.createIndex('idx_locations_external_id', 'locations', 'external_id');
  pgm.createIndex('idx_location_histories_location_id', 'location_histories', 'location_id');
  pgm.createIndex('idx_risk_assessments_location_id', 'risk_assessments', 'location_id');
  pgm.createIndex('idx_location_market_scores_location_id', 'location_market_scores', 'location_id');
  pgm.createIndex('idx_recommendations_location_id', 'recommendations', 'location_id');
};

exports.down = (pgm) => {
  pgm.dropTable('recommendations', { ifExists: true });
  pgm.dropTable('location_market_scores', { ifExists: true });
  pgm.dropTable('market_areas', { ifExists: true });
  pgm.dropTable('risk_assessments', { ifExists: true });
  pgm.dropTable('location_histories', { ifExists: true });
  pgm.dropTable('location_indicators', { ifExists: true });
  pgm.dropTable('location_attributes', { ifExists: true });
  pgm.dropTable('location_category_assignments', { ifExists: true });
  pgm.dropTable('location_categories', { ifExists: true });
  pgm.dropTable('locations', { ifExists: true });
  pgm.dropTable('data_sources', { ifExists: true });
};
