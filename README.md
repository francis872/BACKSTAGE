# BACKSTAGE Intelligence

Plataforma de Location Intelligence para convertir datos dispersos en recomendaciones de decisión, no solo en mapas.

## Visión

BACKSTAGE responde preguntas de negocio como:

- ¿Cuál sucursal debería visitar un cliente?
- ¿Dónde abrir la siguiente tienda?
- ¿Qué zona está saturada?
- ¿Qué restaurante tiene menor tiempo de espera?
- ¿Dónde conviene invertir?
- ¿Qué ubicación generará mayor retorno?

## Módulos principales

- `BACKSTAGE Geo`: análisis geoespacial y territorial.
- `BACKSTAGE AI`: modelos predictivos, optimización y recomendaciones.
- `BACKSTAGE Risk`: evaluación de riesgos climáticos, financieros y territoriales.
- `BACKSTAGE Urban`: planeación urbana, catastro, avalúos y desarrollo inmobiliario.
- `BACKSTAGE Insights`: paneles ejecutivos, reportes e indicadores.
- `EarthArt`: gemelo digital territorial — índice territorial por dimensión, detector de brechas y simulación de escenarios "qué pasaría si".

## Estructura del proyecto

- `backend/`: API y servicios de datos.
- `frontend/`: interfaz de usuario y experiencia de recomendaciones.
- `docs/`: visión, arquitectura y casos de uso.
- `data/`: modelos de datos y ejemplos de integración.
- `probability/`: motor probabilístico académico (ajuste de distribuciones, CDF/1-CDF, umbrales y ranking).

## Arquitectura implementada (API por capas)

El backend está organizado en:

- `routes/`: exposición de endpoints por dominio.
- `controllers/`: validación HTTP y respuestas.
- `services/`: reglas de negocio y acceso SQL.
- `middleware/`: autenticación JWT, RBAC y error handler.

Dominios activos:

- `/auth`, `/users`
- `/locations`, `/insights`, `/real-estate`
- `/risk-components`, `/risk-assessments`
- `/recommendations`, `/integrations`, `/scoring`, `/territorial`
- `/layers` (catálogo y features geoespaciales con `bbox`)
- `/terrain` (superficies matemáticas, pendiente, orientación, curvatura y curvas de nivel)
- `/spatial` (fuentes verificables, ingestión GeoJSON, trabajos y teselas XYZ)
- `/analysis` (ejecución geoestratégica, comparador avanzado e informes imprimibles)
- `/audit-logs` (auditoría de acciones mutables por organización)

Nuevos endpoints de identidad:

- `POST /auth/register` (creación de usuario con password y rol inicial `viewer`)
- `GET /auth/public-organizations` (organizaciones activas para registro)

## Flujo geoespacial y caso demo

- Explorador territorial híbrido: MapLibre GL JS acelera la presentación WebGL mientras el núcleo matemático, las fuentes GeoJSON y los estilos pertenecen a BACKSTAGE.
- Motor de terreno con mallas multirresolución, interpolación bilineal y Marching Squares.
- Catálogo de capas administrable en backend (`layer_catalog`).
- Escenario demo: **Expansión comercial Bogotá** con ranking multicriterio.
- Persistencia de corridas de análisis en `analysis_runs` y `analysis_results`.
- Recursos de intercambio GeoJSON y validación nativa en [geospatial/](./geospatial/README.md).

El endpoint `GET /terrain/surface` genera una superficie procedimental para probar el motor sin depender de imágenes. Su respuesta se identifica con `dataMode: "procedural"`: no representa elevación medida y no debe utilizarse para decisiones territoriales reales. `POST /terrain/analyze` procesa mallas de elevación verificadas que aporte un pipeline de datos.

## Pipeline territorial

1. `POST /spatial/sources`: registra proveedor, dataset, versión, licencia, modo del dato y confianza.
2. `POST /spatial/ingest/geojson`: valida e ingiere un `FeatureCollection`, lo divide en celdas XYZ multizoom y registra el trabajo.
3. `GET /spatial/tiles/:z/:x/:y?worldId=earth`: entrega la tesela GeoJSON correspondiente a la organización activa.
4. `GET /spatial/sources` y `GET /spatial/jobs`: exponen procedencia y trazabilidad.
5. `PATCH /spatial/sources/:id/status`: archiva o reactiva el dataset y todos sus objetos sin borrado destructivo.
6. `POST /spatial/ingest/remote`: descarga GeoJSON mediante HTTPS únicamente desde dominios autorizados de Datos Abiertos Colombia e IGAC.

El modo `SPATIAL_STORE=memory` sirve para desarrollo y pierde su contenido al reiniciar. Para persistencia y consultas compartidas se utiliza `SPATIAL_STORE=atlas` con `MONGODB_URI`.

El explorador incluye carga GeoJSON para `admin`/`analyst`, selección de niveles XYZ, catálogo de fuentes, estado del almacenamiento e historial resumido de trabajos.

Las geometrías lineales y poligonales se simplifican al servir cada zoom mediante Douglas–Peucker, conservando el original almacenado. Las teselas resultantes usan una caché LRU temporal que se invalida al importar, archivar o reactivar datasets.

### Búsqueda y navegación

- `GET /spatial/search?q=...`: busca atributos de objetos territoriales activos.
- `GET /spatial/nearby?lng=...&lat=...&radiusM=...`: ordena objetos por proximidad.
- `POST /spatial/routes/compute`: calcula rutas A* o Dijkstra sobre las líneas viales importadas.

El explorador permite navegar a un resultado, seleccionar origen y destino y dibujar la ruta calculada. No genera rutas si el grafo importado está vacío o desconectado.

### Riesgo territorial explicable

`POST /spatial/risk/evaluate` calcula índices de priorización para incendio forestal, inundación y deslizamiento. La respuesta conserva entradas, pesos, contribuciones, modo del dato, confianza y versión del modelo. Estos índices no son pronósticos ni reemplazan estudios técnicos de campo.

`POST /spatial/risk/scenario` evalúa hasta 2.500 celdas y devuelve una colección GeoJSON con riesgo base, riesgo del escenario y diferencia por celda. El visor construye la malla sobre el terreno visible, deriva únicamente pendiente o elevación y exige que el usuario declare las demás variables; el mapa de calor sigue siendo un índice comparativo, no una observación ni un pronóstico.

El dashboard de evaluaciones valida cuatro indicadores entre 0 y 1, calcula el puntaje mediante `arithmetic-mean-v1`, registra origen, confianza y notas, conserva el historial por ubicación y permite abrir directamente la ubicación evaluada en el mapa.

EarthArt presenta índice territorial, brechas, riesgos y oportunidades como métricas independientes; conserva el historial de simulaciones, navega al mapa y permite convertir una brecha verificada en proyecto operativo. Todos sus recursos quedan aislados por organización.

### Dibujo y medición

`POST /spatial/measure` calcula coordenadas, distancia geodésica, perímetro y área esférica para puntos, líneas y polígonos GeoJSON. El explorador permite dibujar directamente sobre el mapa y exportar el resultado como GeoJSON sin incorporar una biblioteca de dibujo externa.

### Hidrología y topografía

- `POST /terrain/hydrology`: dirección D8, acumulación de flujo, cauces, valles, crestas y cuenca de aporte.
- `POST /terrain/profile`: perfil interpolado entre dos coordenadas, distancia y rango de elevación.

El explorador representa drenajes, valles y crestas sobre MapLibre y muestra un perfil topográfico. Los resultados heredan el modo y la calidad de la malla de elevación analizada.

## Identidad, roles y permisos

Autenticación por token JWT y autorización por rol:

- `admin`: CRUD total + administración de usuarios y roles.
- `analyst`: edición de módulos operativos (riesgo, territorial, recomendaciones operativas).
- `viewer`: acceso de consulta/lectura.

Separación multi-organización activa:

- Cada sesión tiene `organization_id` activo.
- Los módulos operativos (`locations`, `risk-assessments`, `recommendations`, `analysis`) filtran por organización.
- Cambio de contexto con `POST /auth/switch-organization`.

Los seeds de usuarios y datos demo solo se cargan con `NODE_ENV` distinto de `production`. No se publican credenciales demo: crea usuarios localmente mediante registro o configura credenciales propias para desarrollo. En producción configura un `JWT_SECRET` aleatorio de al menos 32 caracteres.

## Primeros pasos

Para desarrollo sin Docker, copia `backend/.env.example` a `backend/.env`, configura `DATABASE_URL` y `JWT_SECRET`, e instala las dependencias bloqueadas:

```bash
cd backend
npm ci
npm run migrate:up
npm test
npm start
```

En otra terminal, desde `frontend/`:

```bash
npm ci
npm run dev
```

El ejemplo de base de datos apunta al PostgreSQL de Compose publicado en `localhost:5544`. El backend espera que el esquema ya esté migrado antes de atender operaciones.

## Ejecución con Docker Compose

1. Construir y levantar servicios:
   - `docker compose up --build`
2. Backend disponible en `http://localhost:4000`.
3. Frontend disponible en `http://localhost:3000`.
4. PostgreSQL 17 estándar queda publicado en `localhost:5544`; el servicio de migración termina antes del backend.
5. La geometría se conserva como GeoJSON/JSONB y se procesa con el núcleo matemático de BACKSTAGE.

## Validacion y CI/CD

- Backend: `cd backend && npm ci && npm test`.
- Frontend: `cd frontend && npm ci && npm run build`.
- Pull requests a `main` validan con PostgreSQL 17; la publicación en Vercel se habilita en `main` tras las migraciones protegidas de producción.
- La imagen local usa `SPATIAL_STORE=memory` de forma predeterminada. `SPATIAL_STORE=atlas` requiere `MONGODB_URI` y `MONGODB_SPATIAL_DB`; no se necesita Atlas para ejecutar el modo local.

## Ejecución local rápida

El frontend consume `/api/*` y usa proxy:

- local (`vite`): `/api` -> `http://localhost:4000`
- producción (Vercel raíz): `/api/*` -> Express serverless y el resto -> frontend estático.

Variable opcional local:

- `VITE_LOCAL_API_TARGET=http://localhost:4000`

## Carga de datos y migraciones

Desde `backend/`:

- `npm run migrate:up` — ejecutar migraciones.
- `npm run db:init` — cargar esquema; en entornos no productivos también carga datos demo.

## Propuesta de valor

BACKSTAGE no compite con Google Maps en navegación. Usa datos de mapas junto con ERP, CRM, censos, POS y más para entregar decisiones optimizadas:

- ¿Qué decisión me conviene tomar?
- ¿Qué ubicación ofrece mayor retorno?
- ¿Dónde es más seguro invertir?

## Deploy en Vercel (frontend + backend)

### Backend

```bash
cd backend
vercel --prod
```

Variables backend mínimas:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN` (frontend URL, o `*` temporalmente)

### Frontend

```bash
cd frontend
vercel --prod
```

Variables frontend mínimas:

- `BACKEND_URL` = URL de backend desplegado en Vercel
- `VITE_SECURITY_WS_URL` = `wss://<backend>/ws/security` para stream de seguridad en vivo (si no está disponible, la UI usa sondeo periódico)

## Git

```bash
git init
git add .
git commit -m "feat: backstage fullstack architecture + identity + design"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

## Frontend de operación

El panel incluye:

- Login con rol y sesión.
- Registro de usuario con contraseña y selección de organización.
- CRUD de evaluaciones de riesgo.
- Comparador avanzado de ubicaciones (matriz pairwise por dimensión).
- Informe ejecutivo imprimible (`/analysis/:id/report`).
- Administración de usuarios y roles (solo admin).
- Auditoría de acciones (solo admin).
- Módulo EarthArt territorial.
- Vista de arquitectura operativa de plataforma.

## Módulo probabilístico académico (PDF/CDF/colas)

Incluye:

- Cálculo explícito de histograma unitario `h(x)` y validación `∫h(x)dx ≈ 1`.
- Ajuste de múltiples distribuciones `f1(x)...fn(x)` y validación `∫fi(x)dx ≈ 1`.
- Métricas de ajuste: Bhattacharyya (implementación explícita por bins) y KS (implementación explícita + validación scipy).
- `cdf(x)` y `survival_function(x)` (`sf`) para `P(X<=x)` y `P(X>x)`.
- Evaluación de observaciones con percentil y clasificación de cola (`left_tail`, `central`, `right_tail`).
- Umbrales experimentales configurables por cuantil sobre distancias KS/Bhattacharyya.

Ejecución:

```bash
cd probability
C:/Python314/python.exe -m pip install -r requirements.txt
C:/Python314/python.exe run_probability_analysis.py --variable commercial_rent_cop_m2
```

Salida principal:

- `results.csv`
- `academic_summary.csv`
- `cdf_survival.png`
- `bhattacharyya_threshold.png`
- `ks_threshold.png`

Detalle completo en [probability/README.md](/C:/Users/Usuario/OneDrive/Escritorio/BACKSTAGE/probability/README.md).
