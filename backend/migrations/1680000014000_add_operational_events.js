exports.up = (pgm) => {
  pgm.createTable('operational_events', {
    operational_event_id: { type: 'serial', primaryKey: true },
    organization_id: {
      type: 'integer',
      notNull: true,
      references: 'organizations(organization_id)',
      onDelete: 'cascade',
    },
    analysis_run_id: {
      type: 'integer',
      references: 'analysis_runs(analysis_run_id)',
      onDelete: 'cascade',
    },
    actor_user_id: {
      type: 'integer',
      references: 'users(user_id)',
      onDelete: 'set null',
    },
    event_type: { type: 'text', notNull: true },
    severity: { type: 'text', notNull: true, default: 'info' },
    title: { type: 'text', notNull: true },
    message: { type: 'text' },
    target: { type: 'text' },
    payload: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('operational_events', 'operational_events_severity_check', {
    check: "severity IN ('info','success','warning','critical')",
  });

  pgm.createIndex('operational_events', ['organization_id', 'created_at']);
  pgm.createIndex('operational_events', ['analysis_run_id', 'created_at']);
  pgm.createIndex('operational_events', ['organization_id', 'severity', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('operational_events');
};
