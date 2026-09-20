exports.up = (pgm) => {
  pgm.createTable('command_executions', {
    command_execution_id: { type: 'serial', primaryKey: true },
    correlation_id: { type: 'text', notNull: true },
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
    source: { type: 'text', notNull: true, default: 'manual' },
    command: { type: 'text', notNull: true },
    stage: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'running' },
    input_payload: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    result_payload: { type: 'jsonb' },
    error_message: { type: 'text' },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    completed_at: { type: 'timestamptz' },
    duration_ms: { type: 'integer' },
  });

  pgm.addConstraint('command_executions', 'command_executions_status_check', {
    check: "status IN ('running','completed','failed')",
  });

  pgm.createIndex('command_executions', ['organization_id', 'started_at']);
  pgm.createIndex('command_executions', ['analysis_run_id', 'started_at']);
  pgm.createIndex('command_executions', 'correlation_id', { unique: true });
};

exports.down = (pgm) => {
  pgm.dropTable('command_executions');
};
