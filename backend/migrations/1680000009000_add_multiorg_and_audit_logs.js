/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('locations', {
    organization_id: { type: 'integer' },
  }, { ifNotExists: true });
  pgm.addConstraint('locations', 'locations_org_fk', {
    foreignKeys: { columns: 'organization_id', references: 'organizations(organization_id)', onDelete: 'set null' },
  });
  pgm.createIndex('locations', 'organization_id', { name: 'idx_locations_org_id' });

  pgm.addColumn('risk_assessments', {
    organization_id: { type: 'integer' },
  }, { ifNotExists: true });
  pgm.addConstraint('risk_assessments', 'risk_assessments_org_fk', {
    foreignKeys: { columns: 'organization_id', references: 'organizations(organization_id)', onDelete: 'set null' },
  });
  pgm.createIndex('risk_assessments', 'organization_id', { name: 'idx_risk_assessments_org_id' });

  pgm.addColumn('recommendations', {
    organization_id: { type: 'integer' },
    requested_by_user_id: { type: 'integer' },
  }, { ifNotExists: true });
  pgm.addConstraint('recommendations', 'recommendations_org_fk', {
    foreignKeys: { columns: 'organization_id', references: 'organizations(organization_id)', onDelete: 'set null' },
  });
  pgm.addConstraint('recommendations', 'recommendations_user_fk', {
    foreignKeys: { columns: 'requested_by_user_id', references: 'users(user_id)', onDelete: 'set null' },
  });
  pgm.createIndex('recommendations', 'organization_id', { name: 'idx_recommendations_org_id' });

  pgm.addColumn('layer_catalog', {
    organization_id: { type: 'integer' },
  }, { ifNotExists: true });
  pgm.addConstraint('layer_catalog', 'layer_catalog_org_fk', {
    foreignKeys: { columns: 'organization_id', references: 'organizations(organization_id)', onDelete: 'set null' },
  });
  pgm.createIndex('layer_catalog', 'organization_id', { name: 'idx_layer_catalog_org_id' });

  pgm.createTable('audit_logs', {
    audit_log_id: { type: 'serial', primaryKey: true },
    organization_id: { type: 'integer' },
    user_id: { type: 'integer' },
    action: { type: 'text', notNull: true },
    resource_type: { type: 'text', notNull: true },
    resource_id: { type: 'text' },
    request_method: { type: 'text', notNull: true },
    request_path: { type: 'text', notNull: true },
    status_code: { type: 'integer', notNull: true },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });

  pgm.addConstraint('audit_logs', 'audit_logs_org_fk', {
    foreignKeys: { columns: 'organization_id', references: 'organizations(organization_id)', onDelete: 'set null' },
  });
  pgm.addConstraint('audit_logs', 'audit_logs_user_fk', {
    foreignKeys: { columns: 'user_id', references: 'users(user_id)', onDelete: 'set null' },
  });
  pgm.createIndex('audit_logs', ['organization_id', 'created_at'], { name: 'idx_audit_logs_org_created_at' });
  pgm.createIndex('audit_logs', ['user_id', 'created_at'], { name: 'idx_audit_logs_user_created_at' });
  pgm.createIndex('audit_logs', 'action', { name: 'idx_audit_logs_action' });

  pgm.sql(`
    WITH default_org AS (
      SELECT organization_id
      FROM organizations
      ORDER BY organization_id
      LIMIT 1
    )
    UPDATE locations
    SET organization_id = (SELECT organization_id FROM default_org)
    WHERE organization_id IS NULL
      AND EXISTS (SELECT 1 FROM default_org);
  `);

  pgm.sql(`
    WITH default_org AS (
      SELECT organization_id
      FROM organizations
      ORDER BY organization_id
      LIMIT 1
    )
    UPDATE risk_assessments
    SET organization_id = (SELECT organization_id FROM default_org)
    WHERE organization_id IS NULL
      AND EXISTS (SELECT 1 FROM default_org);
  `);

  pgm.sql(`
    WITH default_org AS (
      SELECT organization_id
      FROM organizations
      ORDER BY organization_id
      LIMIT 1
    )
    UPDATE recommendations
    SET organization_id = (SELECT organization_id FROM default_org)
    WHERE organization_id IS NULL
      AND EXISTS (SELECT 1 FROM default_org);
  `);

  pgm.sql(`
    WITH default_org AS (
      SELECT organization_id
      FROM organizations
      ORDER BY organization_id
      LIMIT 1
    )
    UPDATE layer_catalog
    SET organization_id = (SELECT organization_id FROM default_org)
    WHERE organization_id IS NULL
      AND EXISTS (SELECT 1 FROM default_org);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('audit_logs', { ifExists: true });
  pgm.dropColumn('layer_catalog', 'organization_id', { ifExists: true });
  pgm.dropColumn('recommendations', ['organization_id', 'requested_by_user_id'], { ifExists: true });
  pgm.dropColumn('risk_assessments', 'organization_id', { ifExists: true });
  pgm.dropColumn('locations', 'organization_id', { ifExists: true });
};

