> Estado vigente (27/10/2026, Bogotá): **NO_GO para activar la nueva versión con usuarios y datos reales**. La versión publicada en Vercel se conserva. La regresión local aprobó 470 pruebas backend (una omitida), 41 frontend y compilación; los ensayos de recuperación usan datos sintéticos y no certifican respaldos productivos. Faltan verificaciones administrativas de Atlas, correo, monitoreo independiente y custodia externa. Consulta la [matriz de preparación y evidencias](docs/BACKSTAGE_OPERATIONS_CLOSURE.md) y el [informe final](docs/evidence/operations-closure-postflight.json). Las notas siguientes son históricas y conservan el alcance de cada fecha.

> Origin (24/10/2026, Bogotá): [staging protegido](https://backstage-staging-web.vercel.app) actualizado con explorador persistente, Feed, Cuenta/Organización y rutas vinculadas a proyectos en MongoDB Atlas. Once grupos de integración real y 21 comprobaciones de interfaz aprobados. Producción conserva su versión anterior. Mapbox activo en el backend de staging, con sugerencias y almacenamiento permanente verificados. [Estado y límites](docs/BACKSTAGE_IMPLEMENTATION_STATUS.md), [pruebas](docs/BACKSTAGE_TEST_REPORT.md).

> Publicado el 24/10/2026, 13:33 Bogotá: [abrir BACKSTAGE](https://backstage-web-seven.vercel.app). API, Atlas, cálculos y acceso móvil/escritorio comprobados. Conserva la conexión Atlas anterior, compartida con pruebas; separar producción, monitoreo continuo y respaldos programados sigue pendiente. [Publicación y evidencia](docs/backstage-2.0/PRODUCTION_RELEASE.md). Los estados inferiores son históricos.

> Estado vigente (24/10/2026, Bogotá): UI/UX simplificadas y publicadas en [staging protegido](https://backstage-staging-web.vercel.app). Inicio por tareas, ayuda contextual y lectura cómoda; 76 comprobaciones UI y 20 grupos reales aprobados. Carga, reversión, limpieza y respaldo completo actualizado con restauración aislada comprobados. Producción original intacta. [UI/UX](docs/backstage-2.0/USABILITY_REPORT.md), [preparación y pendientes reales](docs/backstage-2.0/READINESS_REPORT.md). Las notas inferiores son históricas.

> Estado actualizado (24/10/2026, Bogotá): respaldo lógico completo de Atlas y restauración aislada comprobados (75 colecciones, 106 documentos, 238 índices); 325 pruebas backend y 26 frontend aprobadas. Reglas comerciales y alertas del administrador preparadas en nuevos Preview. Faltan aceptación integrada, carga, reversión remota y cobertura continua antes de producción. La revisión automática impidió iniciar la aceptación por falta de créditos del workspace. [Estado y continuación](docs/backstage-2.0/READINESS_REPORT.md). Las notas siguientes conservan su alcance histórico.

# BACKSTAGE Intelligence

> Reglas de negocio, GIS y rutas (23/10/2026, Bogotá): [staging](https://backstage-staging-web.vercel.app). Catálogo versionado, configuración con revisión/auditoría, análisis GIS y evidencia logística vinculados a proyectos. Dieciocho grupos de integración real aprobados. MongoDB Atlas y motores/identidad existentes conservados; producción original intacta. [Informe vigente](docs/backstage-2.0/PHASE_5_SPATIAL_REPORT.md), [reglas](docs/backstage-2.0/BUSINESS_RULES.md).

> Intelligence Core ampliado a finanzas y Monte Carlo (23/10/2026): [abrir staging](https://backstage-staging-web.vercel.app). Entradas, moneda, periodos, supuestos, modelo y semilla conservados; reproducción, descarga y vínculo con proyectos. Quince grupos de integración real aprobados, datos temporales retirados y producción original intacta. MongoDB Atlas e identidad de BACKSTAGE conservados. [Informe vigente](docs/backstage-2.0/PHASE_5_ENGINES_REPORT.md).

> Intelligence Core aplicado al comparador y proyectos (23/10/2026): [abrir staging](https://backstage-staging-web.vercel.app). Decimales exactos, versión y huellas de análisis, comprobación y exportación; doce grupos de integración real aprobados y datos temporales retirados. MongoDB Atlas e identidad de BACKSTAGE conservados; producción sin cambios. [Informe y límites](docs/backstage-2.0/PHASE_5_REPORT.md).

> Atlas de pruebas validado (22/10/2026): tres índices de invitaciones aplicados; persistencia, concurrencia, revocación y auditoría comprobadas con MongoDB real. Respaldo/restauración de 22 documentos del ensayo y limpieza verificados. [Informe y límites](docs/backstage-2.0/ATLAS_VALIDATION_REPORT.md). Sin despliegue; el respaldo completo del entorno sigue pendiente de certificación.

> Recuperación local — Fase 4 completada (22/10/2026): invitaciones, roles, revocación y auditoría sobre MongoDB Atlas. [Informe y límites](docs/backstage-2.0/PHASE_4_REPORT.md). Pendiente la validación integrada en Atlas de pruebas; sin publicación ni aplicación de índices durante esta fase.

> Recuperación local — Fase 3 completada (22/10/2026): territorio → activo → análisis → proyecto → recuperar contexto. MongoDB Atlas, identidad y funciones de BACKSTAGE conservadas. [Informe, pruebas y límites](docs/backstage-2.0/PHASE_3_REPORT.md). Sin publicación ni escrituras en Atlas durante esta fase.

BACKSTAGE es la plataforma empresarial de inteligencia territorial y operaciones. Conserva su centro de operaciones, explorador, activos, proyectos, AirHeart y comparadores. SOI (Operaciones de Inteligencia Sanitaria) es su módulo sanitario; CleanCom es un caso de referencia con acceso propio.

La persistencia de la aplicación utiliza exclusivamente MongoDB Atlas: identidad, organizaciones, activos, operaciones, residuos, sensores, carbono, análisis y auditoría.

Web publicada: https://backstage-web-seven.vercel.app
API publicada: https://backstage-api.vercel.app

## Desarrollo

Requiere Node.js 24, MongoDB Atlas con transacciones y Python para los motores científicos.

1. Configura `backend/.env` tomando `backend/.env.example`: `MONGODB_URI`, `MONGODB_DB` o `MONGODB_SPATIAL_DB`, `SPATIAL_STORE=atlas` y `JWT_SECRET`.
2. Ejecuta `npm run setup`.
3. Revisa `npm run mongo:plan --prefix backend` y aplica `npm run mongo:init --prefix backend` al entorno autorizado.
4. Ejecuta `npm run setup:scientific` y `npm run dev`.

Los índices se inicializan sin crear usuarios ni datos operativos de ejemplo. El registro crea una cuenta y su organización. Si Atlas no está disponible, las operaciones persistentes fallan explícitamente.

## Verificación

- `npm run test:backend`
- `npm run test:frontend`
- `npm run test:bsie`
- `npm run test:sanitary`
- `npm run build`

Consulta [MongoDB Atlas](docs/SOI_MONGODB.md), [contratos sanitarios](docs/SOI_SANITARY_API.md), [BSIE](docs/BSIE.md) y [despliegue](DEPLOYMENT_GUIDE.md).

Los proveedores de GPS y sensores requieren configuración y autorización; su ausencia se muestra como falta de datos.

Recuperación arquitectónica: [informe de Fase 1](docs/backstage-2.0/PHASE_1_REPORT.md), [límites de módulos](docs/backstage-2.0/MODULE_BOUNDARIES.md) y [contratos generales](docs/backstage-2.0/CORE_API.md). La recuperación está verificada localmente; no se ha publicado este incremento.

Sistema de diseño consolidado: [contratos y cobertura](docs/backstage-2.0/DESIGN_SYSTEM.md), [resultado de Fase 2](docs/backstage-2.0/PHASE_2_REPORT.md).

