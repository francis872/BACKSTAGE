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
- `EarthArt`: gemelo digital territorial — índice territorial por dimensión, detector de brechas y motor predictivo de "qué pasaría si".

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
- `/analysis` (ejecución geoestratégica, comparador avanzado e informes imprimibles)
- `/audit-logs` (auditoría de acciones mutables por organización)

Nuevos endpoints de identidad:

- `POST /auth/register` (creación de usuario con password y rol inicial `viewer`)
- `GET /auth/public-organizations` (organizaciones activas para registro)

## Flujo geoespacial y caso demo

- Explorador territorial con MapLibre en frontend.
- Catálogo de capas administrable en backend (`layer_catalog`).
- Escenario demo: **Expansión McDonald’s Bogotá** con ranking multicriterio.
- Persistencia de corridas de análisis en `analysis_runs` y `analysis_results`.
- Recursos QGIS/PostGIS en [geospatial/](./geospatial/README.md).

## Identidad, roles y permisos

Autenticación por token JWT y autorización por rol:

- `admin`: CRUD total + administración de usuarios y roles.
- `analyst`: edición de módulos operativos (riesgo, territorial, recomendaciones operativas).
- `viewer`: acceso de consulta/lectura.

Separación multi-organización activa:

- Cada sesión tiene `organization_id` activo.
- Los módulos operativos (`locations`, `risk-assessments`, `recommendations`, `analysis`) filtran por organización.
- Cambio de contexto con `POST /auth/switch-organization`.

Usuarios de demo (seed):

- `admin@backstage.local` / `BackstageAdmin123!`
- `analyst@backstage.local` / `BackstageAnalyst123!`
- `viewer@backstage.local` / `BackstageViewer123!`

> Cambiar contraseñas y `JWT_SECRET` antes de uso productivo real.

## Primeros pasos

1. Navegar a `backend/` y ejecutar `npm install`.
2. Navegar a `frontend/` y ejecutar `npm install`.
3. Iniciar backend con `npm start` desde `backend/`.
4. Iniciar frontend con `npm run dev` desde `frontend/`.

## Ejecución con Docker Compose

1. Construir y levantar servicios:
   - `docker compose up --build`
2. Backend disponible en `http://localhost:4000`.
3. Frontend disponible en `http://localhost:3000`.
4. La base de datos Postgres se ejecuta con PostGIS.

## Ejecución local rápida

El frontend consume `/api/*` y usa proxy:

- local (`vite`): `/api` -> `http://localhost:4000`
- producción (`frontend/api/index.js`): `/api` -> `BACKEND_URL` (backend desplegado)

Variable opcional local:

- `VITE_LOCAL_API_TARGET=http://localhost:4000`

## Carga de datos y migraciones

Desde `backend/`:

- `npm run migrate:up` — ejecutar migraciones.
- `npm run db:init` — cargar esquema y datos de ejemplo.

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
