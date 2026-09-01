/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('spatial_profiles', {
    profile_id: { type: 'serial', primaryKey: true },
    location_id: { type: 'integer', notNull: true },
    profile_name: { type: 'text', notNull: true },
    description: { type: 'text' },
    spatial_score: { type: 'numeric(5,2)' },
    geometry: { type: 'jsonb' },
    metadata: { type: 'jsonb' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('spatial_profiles_location_fk', {
    table: 'spatial_profiles',
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'cascade'
    }
  });

  pgm.createTable('risk_components', {
    component_id: { type: 'serial', primaryKey: true },
    risk_id: { type: 'integer', notNull: true },
    component_type: { type: 'text', notNull: true },
    component_score: { type: 'numeric(5,2)' },
    notes: { type: 'text' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('risk_components_risk_fk', {
    table: 'risk_components',
    foreignKeys: {
      columns: 'risk_id',
      references: 'risk_assessments(risk_id)',
      onDelete: 'cascade'
    }
  });

  pgm.createTable('location_risk_trends', {
    trend_id: { type: 'serial', primaryKey: true },
    location_id: { type: 'integer', notNull: true },
    trend_date: { type: 'date', notNull: true },
    risk_vector: { type: 'jsonb' },
    trend_score: { type: 'numeric(5,2)' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('location_risk_trends_location_fk', {
    table: 'location_risk_trends',
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'cascade'
    }
  });

  pgm.createIndex('idx_spatial_profiles_location_id', 'spatial_profiles', 'location_id');
  pgm.createIndex('idx_risk_components_risk_id', 'risk_components', 'risk_id');
  pgm.createIndex('idx_location_risk_trends_location_id', 'location_risk_trends', 'location_id');
};

exports.down = (pgm) => {
  pgm.dropTable('location_risk_trends', { ifExists: true });
  pgm.dropTable('risk_components', { ifExists: true });
  pgm.dropTable('spatial_profiles', { ifExists: true });
};
