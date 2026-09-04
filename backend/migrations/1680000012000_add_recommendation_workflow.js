/* eslint-disable camelcase */
exports.shorthands = undefined;

// Converts `recommendations` from a bare query/result log into a real
// decisional entity: status workflow, priority, confidence, links back
// to the analysis run that originated it, and an approval trail.
exports.up = (pgm) => {
  pgm.addColumn('recommendations', {
    title: { type: 'text' },
    priority: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'proposed' },
    confidence: { type: 'numeric(5,4)' },
    expected_impact: { type: 'text' },
    analysis_run_id: { type: 'integer' },
    reviewed_by_user_id: { type: 'integer' },
    review_notes: { type: 'text' },
    reviewed_at: { type: 'timestamp with time zone' },
    expires_at: { type: 'timestamp with time zone' },
  }, { ifNotExists: true });

  pgm.addConstraint('recommendations', 'recommendations_status_check', {
    check: "status IN ('proposed','under_review','approved','rejected','in_progress','completed','expired')",
  });
  pgm.addConstraint('recommendations', 'recommendations_priority_check', {
    check: "priority IS NULL OR priority IN ('low','medium','high','critical')",
  });
  pgm.addConstraint('recommendations', 'recommendations_analysis_run_fk', {
    foreignKeys: { columns: 'analysis_run_id', references: 'analysis_runs(analysis_run_id)', onDelete: 'set null' },
  });
  pgm.addConstraint('recommendations', 'recommendations_reviewed_by_fk', {
    foreignKeys: { columns: 'reviewed_by_user_id', references: 'users(user_id)', onDelete: 'set null' },
  });

  pgm.createIndex('recommendations', ['organization_id', 'status'], { name: 'idx_recommendations_org_status' });

  // Existing rows predate the workflow; classify them as already
  // completed instead of silently defaulting to "proposed" forever.
  pgm.sql("UPDATE recommendations SET status = 'completed' WHERE status = 'proposed' AND created_at < now()");
};

exports.down = (pgm) => {
  pgm.dropColumn('recommendations', [
    'title', 'priority', 'status', 'confidence', 'expected_impact',
    'analysis_run_id', 'reviewed_by_user_id', 'review_notes', 'reviewed_at', 'expires_at',
  ], { ifExists: true });
};
