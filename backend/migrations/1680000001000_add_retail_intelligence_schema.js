/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('retail_zones', {
    retail_zone_id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true },
    city: { type: 'text' },
    region: { type: 'text' },
    country: { type: 'text', notNull: true, default: 'Colombia' },
    population_density: { type: 'numeric(10,2)' },
    pedestrian_traffic_score: { type: 'numeric(5,2)' },
    vehicle_traffic_score: { type: 'numeric(5,2)' },
    purchasing_power_index: { type: 'numeric(5,2)' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });

  pgm.createTable('competition_analysis', {
    competition_id: { type: 'serial', primaryKey: true },
    retail_zone_id: { type: 'integer', notNull: true },
    competitor_name: { type: 'text', notNull: true },
    category: { type: 'text' },
    proximity_meters: { type: 'integer' },
    relative_strength: { type: 'numeric(5,2)' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('competition_analysis_retail_zone_fk', {
    table: 'competition_analysis',
    foreignKeys: {
      columns: 'retail_zone_id',
      references: 'retail_zones(retail_zone_id)',
      onDelete: 'cascade'
    }
  });

  pgm.createTable('site_suitability_scores', {
    suitability_id: { type: 'serial', primaryKey: true },
    location_id: { type: 'integer', notNull: true },
    retail_zone_id: { type: 'integer', notNull: true },
    score_category: { type: 'text', notNull: true },
    score_value: { type: 'numeric(5,2)' },
    details: { type: 'jsonb' },
    created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('site_suitability_scores_location_fk', {
    table: 'site_suitability_scores',
    foreignKeys: {
      columns: 'location_id',
      references: 'locations(location_id)',
      onDelete: 'cascade'
    }
  });
  pgm.addConstraint('site_suitability_scores_retail_zone_fk', {
    table: 'site_suitability_scores',
    foreignKeys: {
      columns: 'retail_zone_id',
      references: 'retail_zones(retail_zone_id)',
      onDelete: 'cascade'
    }
  });

  pgm.createIndex('idx_retail_zones_city', 'retail_zones', 'city');
  pgm.createIndex('idx_site_suitability_scores_location_id', 'site_suitability_scores', 'location_id');
  pgm.createIndex('idx_site_suitability_scores_retail_zone_id', 'site_suitability_scores', 'retail_zone_id');
};

exports.down = (pgm) => {
  pgm.dropTable('site_suitability_scores', { ifExists: true });
  pgm.dropTable('competition_analysis', { ifExists: true });
  pgm.dropTable('retail_zones', { ifExists: true });
};
