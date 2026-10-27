# Hoja de ruta y propuesta de Fase 1 — BACKSTAGE 2.0

**Fase 1 aprobada e implementada en local**, mediante la respuesta «apruebo» del propietario. El alcance de los siete pasos se conserva debajo para revisión. Ver [resultado, pruebas y límites](PHASE_1_REPORT.md). La Fase 2 fue aprobada posteriormente e implementada en local: [resultado y siguiente gate](PHASE_2_REPORT.md). La Fase 3 fue aprobada con «hazlo» e implementada en el recorrido concreto territorio → activo → análisis → proyecto → recuperar contexto: [resultado](PHASE_3_REPORT.md). La Fase 4 fue aprobada posteriormente con «hazlo» e implementada en local: [resultado](PHASE_4_REPORT.md). La validación integrada en Atlas de pruebas fue aprobada posteriormente con «hazlo» y completada: [resultado](ATLAS_VALIDATION_REPORT.md). El staging fue aprobado posteriormente con «hazlo», desplegado en proyectos aislados y validado: [resultado y acceso](STAGING_REPORT.md). La publicación en los proyectos originales de producción tiene un alcance separado.

BACKSTAGE es la plataforma. SOI es el módulo sanitario. La persistencia seguirá siendo MongoDB Atlas. El plan recupera selectivamente componentes existentes; no crea otra aplicación.

## Alcance concreto propuesto: Architectural Stabilization

| Paso | Áreas previstas | Responsabilidad | Aceptación |
| --- | --- | --- | --- |
| 1. Aislamiento y autorización | wsServer, guards y pruebas de seguridad | Tenant, permiso, canal y vigencia/revocación | Tenant B y viewer no reciben auditoría A; accesos válidos funcionan; membresía vigente aplicada en rutas revisadas |
| 2. Accesos globales | App.jsx, integración de MissionControl/portafolio y navegación | Centro general y módulos explícitos | SOI no sustituye páginas principales; Clean Com accesible; links y Back/Forward conservan contexto |
| 3. Límites de módulos | Registro neutral pequeño y composición del shell, reutilizando código | Separar composición de lógica sanitaria | Dependencias permitidas probadas, rutas/permisos explícitos, sin pantallas vacías |
| 4. Activos y GIS | Servicios generales, adaptadores de lectura y consumidores Explorer/AirHeart/comparación | Identidad, procedencia y tenant | Activo general visible en recorrido autorizado; activos sanitarios conservan identidad; sin renumerar/fusionar documentos |
| 5. Comparación transversal | Comparadores existentes y contratos de análisis/comparación | Reutilizar motores y evidencia | Seleccionar, ejecutar, explicar, guardar y recuperar sin entrar a SOI; conservar criterios y snapshots existentes |
| 6. Ejecución y CI | Empaquetado, workflow y validación de artefactos | Build Node/Python reproducible y gate | Archivos/función científica comprobados; aprobación antes de publicar; staging preparado solo en alcance autorizado |
| 7. Verificación y documentación | E2E, arquitectura, contratos y matriz de recorridos | Demostrar preservación | Suites actuales y nuevas pruebas relevantes pasan; comparación visual acordada; secretos/datos intactos; release revisable |

### Decisión de datos propuesta

Mantener colecciones e IDs actuales durante Fase 1. Definir contratos neutrales y adaptadores explícitos con procedencia. No realizar unificación física, copia de registros, renombrado de colecciones ni migración masiva. Cualquier intervención posterior en datos necesita inventario real, restauración comprobada, reversión y autorización específica.

El portafolio inmobiliario no se declara automáticamente gestor universal. Se conserva su funcionalidad y se integra la capacidad general con tipos explícitos; SOI conserva su especialización. Aprobar el plan autoriza preparar esa separación en código, no conectar proveedores o inventar datos.

### Pruebas de aceptación

- Sesión/organización: iniciar, cambiar tenant, caducar y revocar; backend rechaza roles y recursos ajenos.
- Navegación: Command general, Explorer, activos, proyectos, AirHeart, comparación, Clean Com y acceso explícito a SOI; conservar enlaces, contexto y borradores seguros.
- Activos: en un entorno autorizado, guardar un activo de prueba y comprobar selección/mapa/análisis/relectura; no duplicarlo para aparentar integración.
- Análisis: ejecutar un caso conocido, explicar supuestos y guardar/recuperar versiones. Mantener validación independiente de optimización/predicción.
- WebSocket: pruebas por tenant, rol, canal, caducidad y revocación; fallos no difunden eventos o secretos.
- UI: contrastar pantallas preservadas en 360, 390, 768, 1024, 1280, 1440 y 1920 px; teclado, foco y movimiento reducido. Capturas son pruebas, no rediseños aprobados.
- Arquitectura: importaciones permitidas, excepción del punto de composición, rutas duplicadas y ciclos; pruebas de comportamiento y contratos, no espejos del código.

No cambiar pruebas para ocultar fallos. Separar fixtures, integración real autorizada y límites pendientes. Health o compilación correctos no acreditan un recorrido completo.

### Fuera de esta aprobación

Rediseño total, nuevos proveedores, Google/Gmail operativo, mensajes externos, control industrial, acciones financieras, cambios de secretos, nuevos motores duplicados, expansión simultánea de industrias y producción. No eliminar funciones o migraciones históricas por parecer incompletas. No hacer push que dispare publicación sin verificar el gate.

## Fases posteriores y gates

| Fase | Trabajo incremental | Reutilización | Gate |
| --- | --- | --- | --- |
| 0. Recovery & Audit | Inventario, snapshot, riesgos y propuesta | Git, código y evidencia real | Diagnóstico aprobado; recuperación de código probada; backup de datos aún sin certificar |
| 1. Architectural Stabilization | Siete pasos anteriores | Páginas, guards, APIs, motores y Atlas actuales | Funciones críticas y límites demostrados; siguiente alcance aprobado |
| 2. Design System | Tokens, siete componentes UI, shell, estados, motion y accesibilidad | Negro/rojo, portada orbital, components/ui | Referencias visuales aprobadas; evolución gradual |
| 3. Global Workspaces | COMMAND/EXPLORE/ANALYZE/OPERATE | Centro, mapa, análisis, proyectos y operaciones | Recorridos completos, coherentes y neutrales |
| 4. Platform Core | Identidad, permisos, capacidades, auditoría, invitación/revocación | Servicios Atlas existentes | Aislamiento y autorización probados |
| 5. Intelligence Core | Contratos, unidades, versiones, precisión monetaria y reproducibilidad | Matemáticas, probabilidad, GIS, finanzas, multicriterio, BSIE, OR-Tools | Pruebas numéricas/funcionales y límites documentados |
| 6. Backstage Connect | Registry/gateway y un piloto; OIDC tras decidir configuración | Adaptadores/fuentes/eventos existentes | Conector auténtico, permisos mínimos y condiciones verificadas |
| 7. Backstage Live | Eventos versionados y procesamiento durable acorde al hosting | Jobs, leases, auditoría y sondeo | Idempotencia, reintentos, aislamiento y fallos demostrados |
| 8. Backstage Collaborate | Revisión contextual, comentarios, tareas y notificaciones | Proyectos, asignaciones, aprobaciones y auditoría | Visibilidad/tenant/compartición autorizada validados |
| 9. Industry Expansion | SOI estabilizado y un caso completo por industria priorizada | Platform/Operations/Intelligence Core | Evidencia por caso; sin cinco módulos vacíos |
| 10. Production Readiness | Backup restaurable, staging, rendimiento, seguridad, observabilidad y rollback | Pipeline único y pruebas acumuladas | Veinte criterios del prompt aceptados y autorización expresa para publicar |

No se asignan fechas ni capacidades operativas ficticias. Datos, proveedores y decisiones de producto deben resolverse antes de prometer sus funcionalidades.

## Documentación y revisión

Fase 0 entrega los cinco documentos de auditoría solicitados y sus evidencias. Los otros documentos obligatorios del prompt (Core API, Design System, Integrations, etc.) se completarán con implementaciones y decisiones verificadas en sus fases; no se crean plantillas vacías para aparentar avance.

Cada incremento aprobado entregará estado/referencia, archivos y responsabilidades, pruebas, riesgos y siguiente gate. Siguiente gate de publicación: comprobar respaldo completo/restauración, diferencias de configuración, observabilidad y reversión antes de producción. Atlas de pruebas y staging ya están validados dentro del alcance autorizado. La recuperación está desplegada exclusivamente en staging protegido. El recorrido de Fase 5 de comparación reproducible y proyectos está implementado y validado: [informe](PHASE_5_REPORT.md). La extensión a finanzas y simulación Monte Carlo fue aprobada con «hazlo», implementada, desplegada y validada en staging: [informe](PHASE_5_ENGINES_REPORT.md). Las reglas existentes se inventariaron y se completó el incremento de distancia/contención GIS y optimización SOI versionadas, con configuración auditada y validación real de staging: [informe](PHASE_5_SPATIAL_REPORT.md). Quedan ratificación de políticas comerciales, otras operaciones GIS y preparación de producción; no se declara completado todo Intelligence Core.
