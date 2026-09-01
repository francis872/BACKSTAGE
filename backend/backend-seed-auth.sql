-- Seed de usuarios por rol y fuentes de integración
INSERT INTO users (email, name, password_hash, role)
VALUES
  ('admin@backstage.local', 'Administrador Backstage', 'pbkdf2_sha512$100000$f4996c9e04e39623c291e6041f6bdca9$2d5be71704f84be96fba53d6af456b340ed75f44b96edd780b71a424fa5b3b7119ef95c0c10d30da95e69aa35332fd9087be7a156b140e846b2ad81360257d03', 'admin'),
  ('analyst@backstage.local', 'Analista Backstage', 'pbkdf2_sha512$100000$e1a026181cfbade7a52c3e4fe0a08348$60c2f72eb38fdd32f101cc8c7a0b9ae3a75621eb66162c86a1a8e25816c610c4c4cb43674356027728a08fa1d68584fbe689263daa124470ea993bffc8fbd81b', 'analyst'),
  ('viewer@backstage.local', 'Viewer Backstage', 'pbkdf2_sha512$100000$daaedb8037943d341002fb4f03975b17$9a410725e17e31667a29f2f42a2c1c70df331a6bea04ae0e48b399715418d591fb9def5430a81ed802ca0e1d31375214147f42daaf3644d835b03ad30100c2f1', 'viewer')
ON CONFLICT (email) DO UPDATE
SET
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role;

INSERT INTO integration_sources (name, type, config)
VALUES
  ('Google Maps', 'traffic', jsonb_build_object('api', 'https://maps.googleapis.com/maps/api', 'description', 'Traffic and route metrics')),
  ('POS System', 'transaction', jsonb_build_object('api', 'https://api.pos.local', 'description', 'Point-of-sale order volumes')),
  ('CRM Platform', 'crm', jsonb_build_object('api', 'https://api.crm.local', 'description', 'Customer segmentation and visits')),
  ('Weather API', 'weather', jsonb_build_object('api', 'https://api.weather.local', 'description', 'Weather and climate risk feeds')),
  ('Event Feed', 'events', jsonb_build_object('api', 'https://api.events.local', 'description', 'Local event and demand signal feed'))
ON CONFLICT (name) DO NOTHING;
