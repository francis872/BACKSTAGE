# Contratos generales disponibles

Los prefijos siguientes son de backend; el frontend los consume bajo `/api`. Requieren Bearer JWT y una organización seleccionada mediante `X-Organization-Id` o la sesión. El backend consulta membresías vigentes y reemplaza el rol del token antes de autorizar. Un registro ajeno no se devuelve; membresía revocada produce 403 y almacenamiento indisponible falla explícitamente.

| Método y ruta | Rol | Comportamiento |
| --- | --- | --- |
| GET `/assets` | admin, analyst, viewer | `{data,pagination,sources}`; `limit` 1–500, por defecto 100; `offset` 0–10000; `origin` opcional `platform`/`soi`. Orden estable por fuente e ID. |
| GET `/assets/:asset_id` | lectura | ID compuesto, por ejemplo `platform:12` o `soi:12`. |
| POST `/assets` | admin, analyst | Registro general mediante `locations.service`; responde 201 y `{data}`. Nombre/tipo obligatorios; geometría WGS84 validada. Tenant/actor/procedencia los determina el servidor. |
| GET `/comparisons` | lectura | `{data}`; últimos 100 snapshots de la organización. |
| GET `/comparisons/:id` | lectura | `{data}` con entrada, resultado y autor del snapshot. |
| POST `/comparisons` | admin, analyst | `project_name`, `candidates`, `criteria`, `observations`; calcula en servidor y crea otro snapshot. No acepta el resultado o tenant del cliente como autoridad. |
| POST `/comparisons/:id/project` | admin, analyst | `{territory?,project_name?}`; responde 200 `{data: proyecto}`. Vincula una vez el snapshot al proyecto existente en una transacción MongoDB. Reintentos devuelven el mismo proyecto; enlace roto produce 409. |
| GET `/analysis`, GET `/analysis/:id` | lectura | Listado y recuperación originales; el proyecto contiene referencias al snapshot, activos y territorio en `metadata`. |
| `/geography/*` | lectura; escritura de planes restringida | Mismos contratos GIS que `/soi/geo/*`: capacidades, búsqueda, reverse, elevación, superficie, rutas, perfiles y planes guardados. |

Un activo contiene `asset_id`, `origin`, `source_record_id`, geometría/coordenadas disponibles y procedencia sin atribuir verificación. `location_id` conserva el valor nativo únicamente para `platform`; es null para SOI, evitando usar accidentalmente un ID sanitario como referencia a `locations`. No se convierten coordenadas ausentes en cero. El cero geográfico real sí es válido.

Las colecciones no se fusionan: altas generales escriben en `locations`; SOI conserva `soi_assets`. La configuración sanitaria puede excluir su inventario de la vista general. La lectura excluye activos archivados. GIS y selectores consultan como máximo 500 registros por petición; no representan un inventario ilimitado.

Comparaciones conservan la colección/contador `soi_comparisons` como almacenamiento compatible. Observaciones, fuentes, unidades y reglas faltantes son explícitas; no se generan puntuaciones a partir de coordenadas. Recuperar en UI muestra el resultado persistido con su versión original; comprobar reproducibilidad repite explícitamente con esa versión. Editar y guardar crea una nueva versión. Se mantienen las rutas SOI y la clave histórica de borradores para evitar perder trabajo del navegador.

Clean Com usa `/clean-com/cases`; `/soi/historical/cases` continúa como alias. Sus artefactos siguen protegidos por sesión, membresía y alcance de caso. No se declaran datos históricos como operación vigente.

El enlace conserva `soi_comparisons.project_analysis_run_id` y `analysis_runs.metadata.comparison_snapshot_id`. El proyecto comienza `pending`; no crea filas artificiales en `analysis_results`. El servidor resuelve cada activo compuesto por organización y guarda una descripción de su asociación. [Flujo y contexto](GLOBAL_WORKSPACES.md).


## Identidad y auditoría — Fase 4

| Método y ruta | Rol/autenticación | Contrato |
| --- | --- | --- |
| GET `/users/invitations` | admin actual | `{data}`; hasta 100 invitaciones de la organización, sin código/hash. |
| POST `/users/invitations` | admin actual | `{email,role}`; 201 `{invitation,token}`. Código entregado una vez, vence en siete días, compartición manual. |
| DELETE `/users/invitations/:id` | admin actual | Revocar una invitación pendiente de la organización. |
| POST `/auth/invitations/accept` | cuenta autenticada destinataria | `{token}`; 200 `{token,user}` de sesión para la organización invitante. Aceptación explícita, no necesita membresía previa en ella. |
| PUT `/users/:id` | admin actual | Cambiar nombre local/rol de un miembro. Autorización transaccional y protección del último administrador activo. |
| DELETE `/users/:id` | admin actual | Revocar membresía e invitaciones pendientes anteriores; conservar cuenta y otras organizaciones. |
| GET `/audit-logs` | admin actual | Array de eventos con `user_id`, `resource_type`, `resource_id`, organización y hashes. |
| GET `/audit-logs/chain-status` | admin actual | `enabled`, `valid`, `checked`, `complete` para el resultado correcto; `complete:false` significa que solo se comprobó un prefijo. |

Las mutaciones administrativas internas también requieren el ID del actor autenticado como argumento, nunca desde el cuerpo del cliente. Las invitaciones caducadas/usadas/revocadas responden 410; una cuenta distinta responde 403 y un miembro ya existente 409. Ver [Platform Core](PLATFORM_CORE.md) para auditoría atómica, compatibilidad y preparación del esquema.


## Intelligence Core: contrato de comparación

| Método y ruta | Roles | Resultado |
| --- | --- | --- |
| GET `/comparisons/:id/reproducibility` | admin, analyst, viewer | `{data: informe}`; sin escrituras. Estados `verified`, `legacy_replayed`, `mismatch`, `unsupported_version`, `unsupported_contract`, `engine_changed`, `missing_contract`, `invalid_input` o `invalid_snapshot`. Un informe negativo responde 200 con `verified:false`; no es una nueva certificación. |
| GET `/comparisons/:id/export` | admin, analyst, viewer | JSON descargable `{format,snapshot,verification}` del registro persistido; aislamiento por organización. |

POST conserva entrada pública saneada y añade `analysis` calculado por el servidor: versión/fuentes del motor, huellas, unidades, procedencia, redondeo e incertidumbre no estimada. No acepta un manifiesto o resultado del cliente como autoridad. Cantidades canónicas como cadenas decimales en MongoDB Atlas; máximo 34 cifras significativas y 18 decimales; unidades incompatibles producen 400.

Crear un proyecto nuevo exige un snapshot reproducible; un registro alterado o con versión no disponible produce 409. Un proyecto ya enlazado continúa siendo idempotente. La metadata referencia las huellas del snapshot existente. Los registros anteriores no se migran ni reciben huellas retroactivas. [Contrato completo](INTELLIGENCE_CORE.md), [evidencia](PHASE_5_REPORT.md).


## Intelligence Core: finanzas y Monte Carlo

`POST /analytics/financial` y Monte Carlo en `POST /analytics/risk-simulation` guardan entradas canónicas y contrato del servidor en `analytics_jobs`. `analysis_run_id` vincula la ejecución con un proyecto de la misma organización; resultado, referencia y auditoría se confirman juntos. Las rutas previas y los campos numéricos compatibles se conservan.

`GET /analytics/jobs?project_id=ID` recupera ejecuciones del proyecto. `GET /analytics/jobs/:id/reproducibility` comprueba sin escribir y `GET /analytics/jobs/:id/export` descarga `{format:"backstage-analytics-export-1",snapshot,verification}`. Admin, analista y consulta pueden leer; solo admin/analista pueden ejecutar. Tenant ajeno: 404; membresía/rol insuficiente: 403; entradas inválidas: 400. Un resultado negativo de comprobación responde 200 con `verified:false`. Ver [contrato, precisión, semilla y límites](FINANCIAL_PROBABILITY_CORE.md).


## GIS, reglas y optimización

`GET /analytics/spatial-rules` expone el catálogo versionado; `POST /analytics/gis` guarda matriz esférica o contención planar en los jobs existentes, con referencia WGS84/CRS84, fuente y huellas. Reutiliza comprobación/exportación/historial de jobs y el vínculo transaccional a proyectos.

`GET /soi/sanitary/optimization/:id/reproducibility` comprueba integridad/restricciones del escenario guardado; `GET /export` descarga su snapshot e informe; `POST /reproduce` repite la búsqueda con entradas congeladas y conserva intacto el original. Lectura: admin/analista/consulta; repetición: admin/analista. Aprobación exige admin y propuesta/recursos/configuración vigentes. `analysis_run_id` vincula nuevas propuestas a proyectos de la misma organización. Cambios de configuración incrementan revisión y registran antes/después en auditoría. [Reglas](BUSINESS_RULES.md), [contrato y límites](SPATIAL_INTELLIGENCE_CORE.md).
