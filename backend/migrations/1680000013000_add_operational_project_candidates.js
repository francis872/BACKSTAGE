exports.up = (pgm) => {
  pgm.createTable('analysis_run_candidates', {
    analysis_run_candidate_id: { type: 'serial', primaryKey: true },
    analysis_run_id: {
      type: 'integer',
      notNull: true,
      references: 'analysis_runs(analysis_run_id)',
      onDelete: 'cascade',
    },
    location_id: {
      type: 'integer',
      notNull: true,
      references: 'locations(location_id)',
      onDelete: 'cascade',
    },
    selected_by_user_id: {
      type: 'integer',
      references: 'users(user_id)',
      onDelete: 'set null',
    },
    selected_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint(
    'analysis_run_candidates',
    'analysis_run_candidates_run_location_unique',
    { unique: ['analysis_run_id', 'location_id'] }
  );

  pgm.createIndex('analysis_run_candidates', 'analysis_run_id');
  pgm.createIndex('analysis_run_candidates', 'location_id');
};

exports.down = (pgm) => {
  pgm.dropTable('analysis_run_candidates');
};
