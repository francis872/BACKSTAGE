/* eslint-disable camelcase */
exports.shorthands = undefined;

// BACKSTAGE Analytics Core: async-style execution tracking for deterministic
// analytics algorithms (multicriteria, financial, risk simulation, etc.).
// Every execution is recorded with algorithm name/version, parameters,
// requester, organization, timing and result, so numbers shown in the UI
// are reproducible and auditable instead of hardcoded.
exports.up = (pgm) => {
  pgm.createTable('analytics_jobs', {
    analytics_job_id: { type: 'serial', primaryKey: true },
    organization_id: { type: 'integer' },
    requested_by_user_id: { type: 'integer' },
    algorithm_name: { type: 'text', notNull: true },
    algorithm_version: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'queued' },
    params: { type: 'jsonb', notNull: true, default: '{}' },
    result: { type: 'jsonb' },
    error: { type: 'text' },
    context: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
    started_at: { type: 'timestamp with time zone' },
    completed_at: { type: 'timestamp with time zone' },
    duration_ms: { type: 'integer' },
  });

  pgm.addConstraint('analytics_jobs', 'analytics_jobs_org_fk', {
    foreignKeys: { columns: 'organization_id', references: 'organizations(organization_id)', onDelete: 'set null' },
  });
  pgm.addConstraint('analytics_jobs', 'analytics_jobs_user_fk', {
    foreignKeys: { columns: 'requested_by_user_id', references: 'users(user_id)', onDelete: 'set null' },
  });
  pgm.addConstraint('analytics_jobs', 'analytics_jobs_status_check', {
    check: "status IN ('queued','running','succeeded','failed','cancelled')",
  });

  pgm.createIndex('analytics_jobs', ['organization_id', 'created_at'], { name: 'idx_analytics_jobs_org_created_at' });
  pgm.createIndex('analytics_jobs', ['algorithm_name', 'algorithm_version'], { name: 'idx_analytics_jobs_algorithm' });
  pgm.createIndex('analytics_jobs', 'status', { name: 'idx_analytics_jobs_status' });
};

exports.down = (pgm) => {
  pgm.dropTable('analytics_jobs', { ifExists: true });
};
