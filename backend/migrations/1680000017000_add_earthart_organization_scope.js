/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('territorial_units', { organization_id: { type: 'integer' } });
  pgm.sql(`UPDATE territorial_units SET organization_id = (SELECT organization_id FROM organizations ORDER BY organization_id LIMIT 1) WHERE organization_id IS NULL`);
  pgm.alterColumn('territorial_units', 'organization_id', { notNull: true });
  pgm.addConstraint('territorial_units', 'territorial_units_org_fk', { foreignKeys: { columns: 'organization_id', references: 'organizations(organization_id)', onDelete: 'cascade' } });
  pgm.createIndex('territorial_units', 'organization_id', { name: 'idx_territorial_units_org_id' });
};

exports.down = (pgm) => {
  pgm.dropIndex('territorial_units', 'organization_id', { name: 'idx_territorial_units_org_id', ifExists: true });
  pgm.dropConstraint('territorial_units', 'territorial_units_org_fk', { ifExists: true });
  pgm.dropColumn('territorial_units', 'organization_id', { ifExists: true });
};
