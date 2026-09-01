# BACKSTAGE Intelligence Backend

## Migraciones PostgreSQL con node-pg-migrate

### Configuración

1. Copia `.env.example` a `.env`.
2. Asegúrate de que `DATABASE_URL` esté configurado. Ejemplo:

```env
PGHOST=localhost
PGPORT=5432
PGUSER=backstage
PGPASSWORD=backstage
PGDATABASE=backstage
DATABASE_URL=postgres://backstage:backstage@localhost:5432/backstage
NODE_ENV=development
JWT_SECRET=YOUR_STRONG_SECRET
```

3. Instala dependencias:

```bash
npm install
```

### Comandos útiles

- Ejecutar todas las migraciones:
  - `npm run migrate:up`
- Revertir la última migración:
  - `npm run migrate:down`
- Ejecutar `node-pg-migrate` sin argumentos:
  - `npm run migrate`

### Docker

- `docker compose up --build` — inicia Postgres con PostGIS, backend y frontend.
- `http://localhost:4000` — API backend.
- `http://localhost:3000` — frontend Vite preview.

### Geoespacial

- La base de datos ahora incluye PostGIS.
- Se expone un endpoint `/locations/nearby` para consultas de proximidad.
- El frontend tiene un panel `Geo Insights` para buscar ubicaciones cercanas y ver un resumen rápido.

### Modelo de datos principal

El esquema incluye:

- `data_sources`
- `locations`
- `location_categories`
- `location_attributes`
- `location_indicators`
- `location_histories`
- `risk_assessments`
- `recommendations`
- `market_areas`
- `location_market_scores`
- `retail_zones`
- `competition_analysis`
- `site_suitability_scores`
- `spatial_profiles`
- `risk_components`
- `location_risk_trends`
- `territorial_units` (municipio, barrio, vereda)
- `territorial_facilities`
- `territorial_dimension_scores`
- `territorial_index_snapshots`
- `territorial_gaps`
- `territorial_simulations`

Este modelo está diseñado para soportar casos de uso de retail, riesgo y location intelligence.

### EarthArt: inteligencia territorial

- Índice Territorial por unidad (Educación, Salud, Infraestructura, Economía, Ambiente, Seguridad, Conectividad, Vivienda, Servicios): `GET /territorial/units/:id/index`, `POST /territorial/units/:id/index/recompute`.
- Detector de brechas (población vs. infraestructura disponible): `GET /territorial/units/:id/gaps`, `POST /territorial/units/:id/gaps/detect`.
- Motor predictivo "qué pasaría si" con comparación de alternativas: `POST /territorial/units/:id/simulate`.
