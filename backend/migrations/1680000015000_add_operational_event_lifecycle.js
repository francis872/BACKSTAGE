exports.up = (pgm) => {
  pgm.addColumns('operational_events', {
    dedupe_key: { type: 'text' },
    acknowledged_at: { type: 'timestamptz' },
    acknowledged_by_user_id: {
      type: 'integer',
      references: 'users(user_id)',
      onDelete: 'set null',
    },
    resolved_at: { type: 'timestamptz' },
    resolved_by_user_id: {
      type: 'integer',
      references: 'users(user_id)',
      onDelete: 'set null',
    },
  });

  pgm.createIndex('operational_events', ['organization_id', 'dedupe_key']);
  pgm.createIndex('operational_events', ['organization_id', 'resolved_at']);
};

exports.down = (pgm) => {
  pgm.dropIndex('operational_events', ['organization_id', 'resolved_at']);
  pgm.dropIndex('operational_events', ['organization_id', 'dedupe_key']);
  pgm.dropColumns('operational_events', [
    'dedupe_key',
    'acknowledged_at',
    'acknowledged_by_user_id',
    'resolved_at',
    'resolved_by_user_id',
  ]);
};
