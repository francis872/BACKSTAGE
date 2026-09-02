/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('audit_logs', {
    prev_hash: { type: 'text' },
    event_hash: { type: 'text' },
  }, { ifNotExists: true });

  pgm.createIndex('audit_logs', 'event_hash', {
    name: 'idx_audit_logs_event_hash',
    ifNotExists: true,
  });
  pgm.createIndex('audit_logs', 'prev_hash', {
    name: 'idx_audit_logs_prev_hash',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('audit_logs', ['prev_hash', 'event_hash'], { ifExists: true });
};
