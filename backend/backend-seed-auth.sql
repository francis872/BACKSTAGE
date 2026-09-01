-- Seed de usuario administrador y fuentes de integración
INSERT INTO users (email, name, password_hash, role)
VALUES
  ('admin@backstage.local', 'Administrador Backstage', 'pbkdf2_sha512$100000$cf41b1bf9f8b604f9aa0686b1b80c77e$76a35068eee9889d778a6909ce5b0f0deba3b380cb1d820851ba5b2f034d8fd771cb0a032916ae020d38e5c7e59d45c4c81349b87f71ca84ec05397abbc95247', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO integration_sources (name, type, config)
VALUES
  ('Google Maps', 'traffic', jsonb_build_object('api', 'https://maps.googleapis.com/maps/api', 'description', 'Traffic and route metrics')),
  ('POS System', 'transaction', jsonb_build_object('api', 'https://api.pos.local', 'description', 'Point-of-sale order volumes')),
  ('CRM Platform', 'crm', jsonb_build_object('api', 'https://api.crm.local', 'description', 'Customer segmentation and visits')),
  ('Weather API', 'weather', jsonb_build_object('api', 'https://api.weather.local', 'description', 'Weather and climate risk feeds')),
  ('Event Feed', 'events', jsonb_build_object('api', 'https://api.events.local', 'description', 'Local event and demand signal feed'))
ON CONFLICT (name) DO NOTHING;
