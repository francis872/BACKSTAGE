exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('property_valuations', {
    valuation_id: { type: 'serial', primaryKey: true },
    location_id: { type: 'integer', notNull: true },
    valued_at: { type: 'date', notNull: true, default: pgm.func('CURRENT_DATE') },
    land_area_m2: { type: 'numeric(12,2)', notNull: true },
    price_per_m2: { type: 'numeric(14,2)', notNull: true },
    estimated_value: { type: 'numeric(16,2)', notNull: true },
    annual_appreciation_pct: { type: 'numeric(5,2)' },
    development_potential: { type: 'numeric(5,2)' },
    zoning: { type: 'text' },
    details: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });

  pgm.addConstraint('property_valuations_location_fk', {
    table: 'property_valuations',
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'cascade'
    }
  });
  pgm.createIndex('idx_property_valuations_location_date', 'property_valuations', ['location_id', 'valued_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('property_valuations', { ifExists: true });
};
