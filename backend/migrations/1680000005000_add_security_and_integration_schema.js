/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('users', {
    user_id: { type: 'serial', primaryKey: true },
    email: { type: 'text', notNull: true, unique: true },
    name: { type: 'text' },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'text', notNull: true, default: 'analyst' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('integration_sources', {
    source_id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true, unique: true },
    type: { type: 'text', notNull: true },
    config: { type: 'jsonb' },
    enabled: { type: 'boolean', notNull: true, default: true },
    last_synced_at: { type: 'timestamp with time zone' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('integration_events', {
    event_id: { type: 'serial', primaryKey: true },
    source_id: { type: 'integer', notNull: true },
    external_id: { type: 'text' },
    received_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
    payload: { type: 'jsonb', notNull: true },
    processed_at: { type: 'timestamp with time zone' },
    status: { type: 'text', notNull: true, default: 'pending' }
  });

  pgm.addConstraint('integration_events', 'integration_events_source_fk', {
    foreignKeys: {
      columns: 'source_id',
      references: 'integration_sources(source_id)',
      onDelete: 'cascade'
    }
  });

  pgm.createTable('scoring_models', {
    model_id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true },
    version: { type: 'text', notNull: true, default: '1.0' },
    description: { type: 'text' },
    metadata: { type: 'jsonb' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('scoring_results', {
    result_id: { type: 'serial', primaryKey: true },
    model_id: { type: 'integer', notNull: true },
    location_id: { type: 'integer', notNull: true },
    score: { type: 'numeric(5,2)', notNull: true },
    details: { type: 'jsonb' },
    evaluated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });

  pgm.addConstraint('scoring_results_model_fk', {
    foreignKeys: {
      columns: 'model_id',
      references: 'scoring_models(model_id)',
      onDelete: 'cascade'
    }
  });

  pgm.addConstraint('scoring_results_location_fk', {
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'cascade'
    }
  });

  pgm.createIndex('idx_scoring_results_location_id', 'scoring_results', 'location_id');
  pgm.createIndex('idx_integration_events_status', 'integration_events', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('scoring_results', { ifExists: true });
  pgm.dropTable('scoring_models', { ifExists: true });
  pgm.dropTable('integration_events', { ifExists: true });
  pgm.dropTable('integration_sources', { ifExists: true });
  pgm.dropTable('users', { ifExists: true });
};
