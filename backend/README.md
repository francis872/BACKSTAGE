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
SPATIAL_STORE=memory
MONGODB_URI=
MONGODB_SPATIAL_DB=backstage_spatial
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

- `docker compose up --build` — inicia PostgreSQL estándar, backend y frontend.
- `http://localhost:4000` — API backend.
- `http://localhost:3000` — frontend Vite preview.

### Geoespacial

- La geometría se almacena como GeoJSON y el análisis espacial se ejecuta en el núcleo nativo.
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

## Motor de terreno nativo

- `GET /terrain/surface?bbox=minLng,minLat,maxLng,maxLat&resolution=33&contourInterval=25&lod=0`: superficie procedimental reproducible para visualización y pruebas.
- `POST /terrain/analyze`: analiza una malla numérica y devuelve elevación, pendiente, orientación, curvatura y curvas conectadas.

Las superficies procedimentales se marcan explícitamente con `dataMode: "procedural"`; no sustituyen una fuente de elevación medida en análisis reales.

## Ingestión y teselas territoriales

- `POST /spatial/sources`: registra una fuente; `provider`, `dataset`, `version` y `license` son obligatorios.
- `POST /spatial/ingest/geojson`: valida WGS84, geometrías admitidas y límites de carga; genera objetos y celdas XYZ para hasta siete niveles consecutivos.
- `GET /spatial/tiles/:z/:x/:y?worldId=earth`: devuelve un `FeatureCollection` con metadatos de la tesela.
- `GET /spatial/jobs`: permite auditar cargas completadas o fallidas.
- `PATCH /spatial/sources/:id/status`: activa o archiva una fuente y sus objetos de forma reversible.
- `GET /spatial/status`: informa si el almacenamiento es temporal o Atlas persistente.
- `POST /spatial/ingest/remote`: importa GeoJSON HTTPS con límite de tamaño, timeout, redirecciones bloqueadas y lista cerrada de dominios oficiales.

Las rutas de escritura requieren rol `admin` o `analyst`; la lectura de fuentes y teselas también admite `viewer`. Cada mundo y dataset queda aislado por organización.

Al responder teselas, BACKSTAGE aplica simplificación dependiente del zoom y conserva intacta la geometría canónica. `SPATIAL_TILE_CACHE_MAX` y `SPATIAL_TILE_CACHE_TTL_MS` controlan la caché LRU en proceso.
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

### Seguridad criptográfica

- Password hashing con `bcrypt` para nuevos usuarios y migración transparente desde hashes legacy PBKDF2 al iniciar sesión.
- JWT firmado y validado con `issuer` + `audience` para endurecer validación de tokens.
- Auditoría con cadena hash (`prev_hash` + `event_hash`) para trazabilidad tamper-evident tipo blockchain sobre `audit_logs`.
- Verificación de cadena por organización: `GET /audit-logs/chain-status`.
- Canal WebSocket de eventos de seguridad en tiempo real: `ws://<host>/ws/security?token=<JWT>`.
