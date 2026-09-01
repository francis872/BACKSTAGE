/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS postgis;');

  pgm.addColumns('locations', {
    geom: { type: 'geometry(Point,4326)' }
  });

  pgm.sql(
    `UPDATE locations
     SET geom = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)
     WHERE longitude IS NOT NULL AND latitude IS NOT NULL;`
  );

  pgm.createIndex('idx_locations_geom', 'locations', { columns: ['geom'], using: 'gist' });

  pgm.addColumns('market_areas', {
    geom: { type: 'geometry(Polygon,4326)' }
  });

  pgm.sql(
    `UPDATE market_areas
     SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326)
     WHERE geometry IS NOT NULL AND geometry <> '{}';`
  );

  pgm.createIndex('idx_market_areas_geom', 'market_areas', { columns: ['geom'], using: 'gist' });

  pgm.addColumns('spatial_profiles', {
    geom: { type: 'geometry(Point,4326)' }
  });

  pgm.sql(
    `UPDATE spatial_profiles
     SET geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326)
     WHERE geometry IS NOT NULL;`
  );

  pgm.createIndex('idx_spatial_profiles_geom', 'spatial_profiles', { columns: ['geom'], using: 'gist' });
};

exports.down = (pgm) => {
  pgm.dropIndex('idx_spatial_profiles_geom', 'spatial_profiles');
  pgm.dropColumn('spatial_profiles', 'geom');
  pgm.dropIndex('idx_market_areas_geom', 'market_areas');
  pgm.dropColumn('market_areas', 'geom');
  pgm.dropIndex('idx_locations_geom', 'locations');
  pgm.dropColumn('locations', 'geom');
};
