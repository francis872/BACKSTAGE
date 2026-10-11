/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO roles (name, description)
    VALUES
      ('admin', 'Administrador del espacio de trabajo'),
      ('analyst', 'Analista del espacio de trabajo'),
      ('viewer', 'Miembro de consulta del espacio de trabajo')
    ON CONFLICT (name) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM roles r
    WHERE r.name IN ('admin', 'analyst', 'viewer')
      AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.role_id = r.role_id);
  `);
};
