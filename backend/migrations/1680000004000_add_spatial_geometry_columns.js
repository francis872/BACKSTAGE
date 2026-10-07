/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('locations', { geometry: { type: 'jsonb' } });
  pgm.sql(`UPDATE locations SET geometry = jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(longitude, latitude)) WHERE longitude IS NOT NULL AND latitude IS NOT NULL`);
  pgm.addColumns('spatial_profiles', { geometry_native: { type: 'jsonb' } });
};

exports.down = (pgm) => {
  pgm.dropColumn('spatial_profiles', 'geometry_native', { ifExists: true });
  pgm.dropColumn('locations', 'geometry', { ifExists: true });
};
