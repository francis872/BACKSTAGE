# SOI — Operaciones de Inteligencia Sanitaria

Especificación vigente: documento aportado el 21 de octubre de 2026. Se respetó la prioridad del usuario: implementar y verificar las nuevas fases antes de desplegar. API y frontend fueron promovidos después de las verificaciones remotas. Sitio: https://backstage-web-seven.vercel.app; API: https://backstage-api.vercel.app.

## Auditoría y compatibilidad

El módulo ya está integrado en Backstage: React/Vite/MapLibre, Express/Node, MongoDB Atlas y ejecución científica Python. CleanCom conserva sus artefactos históricos y etiquetas de demostración; no constituye un cliente ni una conexión de telemetría. Se reutilizan identidad, membresías, capacidades, activos, cuadrillas, órdenes, rutas, auditoría, datos meteorológicos y BSIE; no se reconstruye la plataforma.

La conexión local Atlas quedó corregida: el DNS SRV original usaba 127.0.0.1 sin resolver disponible. `MONGODB_DNS_SERVERS` permite usar un resolver explícito en el proceso, sin modificar el DNS del sistema ni desactivar TLS. Se configuró la clave local JWT que faltaba, sin reemplazar una existente. Los índices se aplicaron en la instancia de pruebas autorizada. Se verificaron registro/login, flujo operativo, importación, rollback real, worker BSIE, caché, exportación, aislamiento y eliminación TTL real. La organización temporal de verificación se eliminó; no se modificaron registros empresariales preexistentes. Evidencia: [soi-mongo-live.json](evidence/soi-mongo-live.json).

BSIE 1.1 incorpora OLS, diagnósticos LM clásicos/robustos, Spatial Lag y Spatial Error mediante spreg, selección explicada, ventanas móviles, pruebas de cambio con hipótesis explícita y tendencias descriptivas. Pruebas científicas: 27 aprobadas. Backend previo a estas fases: 255 aprobadas y una prueba externa optativa omitida. No hay proveedor GPS, sensores reales o autorización para SCADA; sus contratos deben conservar estados de desconexión y lectura exclusivamente.

## Backlog de fases

| Fase | Estado | Trabajo verificable |
|---|---|---|
| 0. Auditoría | Verificado | Stack, límites, datos históricos, MongoDB y dependencias identificados |
| 1. Núcleo multiempresa | Verificado | Capacidades sanitarias, membresías vigentes, referencias del tenant, permisos, transacciones y esquema v2 aditivo |
| 2. Residuos/logística | Verificado; proveedor bloqueado | Categorías, instalaciones, contenedores, movimientos, unidades, estados, ejecuciones y flota; no existe telemetría real conectada |
| 3. Optimización | Verificado | OR-Tools CVRP/VRPTW, depósitos/turnos/capacidad/ventanas, objetivo normalizado, escenarios, aprobación, comparación y comprobación independiente |
| 4. Geoespacial | Verificado con límites declarados | Mapas de activos sanitarios, BSIE 1.1, cobertura con huecos poligonales e inventario real; propuesta VRP conserva orden sin inventar geometría vial |
| 5. Ambiente/clima | Verificado; proveedores bloqueados | Estaciones, sensores, mediciones, naturaleza/calidad, alertas, series temporales y exposición climática de rutas; fallos externos explícitos |
| 6. Agua/saneamiento | Verificado; SCADA bloqueado | Redes, inspecciones, mantenimiento previsto y órdenes/cuadrillas/incidentes reutilizados; adaptador industrial de lectura sin conexión real |
| 7. Carbono | Verificado | Fuentes/alcances, factores inmutables, vigencia, conversión compatible, snapshot, correcciones, índice contra doble conteo e informes |
| 8. Predicción | Verificado con límites declarados | Ridge temporal con baseline/backtest, frescura, gate de habilidad, MAD separado de evaluación, entradas/resultados versionados y simulación identificada |
| 9. Centro de operaciones | Verificado | Centro sanitario integrado, capacidades, indicadores/unidades, filtros, formularios, mapas, revisión de propuestas, alertas, historial e informes exportables |
| 10. Endurecimiento/despliegue | Verificado y desplegado; carga concurrente pendiente | OpenAPI, permisos, recuperación/cancelación, pruebas, benchmarks y runbook; Node/Python y persistencia comprobados en Vercel antes de promover |

Las dependencias externas bloqueadas no se sustituyen con datos ficticios. El contrato y su adaptador pueden verificarse con fixtures identificados; la conexión de producción requiere proveedor, acceso y autorización reales. No se activan comandos de control industrial.

## Entrega y evidencia por fase

| Fases | Archivos principales / interfaz | API y algoritmo | Verificación ejecutada |
|---|---|---|---|
| 0–1 | `backend/infrastructure/soiMongo.js`, `mongoDns.js`, `backend/soi/sanitary.contract.js`, `SoiWorkspace.jsx` | Esquema v2, capacidades y membresía fresca | HTTP de revocación/rol/tenant y Atlas real; índices aplicados sin borrar datos |
| 2 | `soiSanitary.service.js`, `soiFleet.service.js`, `soiMongo.service.js`, `SanitaryWorkspace.jsx` | `/resources/waste-*`, facilities/containers/route-executions; estados y masa explícita | Vida completa de movimiento, deduplicación, historia, referencias y conversión t→kg en Atlas; flota sin señal honesta |
| 3 | `soiSanitaryAnalytics.service.js`, `sanitary/routing.py`, `SanitaryAnalysisForms.jsx` | `/optimization`, approve/compare/retry/cancel; solver y validación independiente | Óptimo pequeño por enumeración, capacidades, ventanas, múltiples depósitos, costos/emisiones, matriz ordenada y ejecución Python real persistida |
| 4 | `MeasurementTimeline.jsx`, `CleanComMap.jsx`, `bsie/*` y explorador existente | `/coverage`, `/soi/bsie/*`; topología, pesos, Moran, Gi*, KDE, regresión y tiempo | Referencias SciPy/PySAL/spreg; polígonos con huecos, series, UI BSIE y persistencia real del worker |
| 5 | Servicios sanitarios, `soiSanitaryIntegrations.service.js`, línea temporal | stations/sensors/measurements/alert-rules/alerts; `/climate` | Naturaleza/calidad/antigüedad, invalidación, revisión, alerta/ack/anulación sobre Atlas; fallo meteorológico verificado con fixture explícita |
| 6 | Contrato networks/inspections y núcleo de órdenes/incidentes | `/resources/networks`, inspections; enlaces a órdenes reales | Persistencia Atlas de inspección ligada a orden completada; roles y referencias; SCADA sin escribir |
| 7 | Ledger sanitario y snapshot de factores | emission-sources/emission-factors/carbon-entries; actividad×factor | Unidades, vigencia, inmutabilidad, anulación/corrección, exclusión en informe e índice de una actividad activa |
| 8 | `sanitary/predictive.py`, formularios y resultados | `/predict`; Ridge, folds cronológicos, persistencia baseline, MAD | Tendencia, falta de habilidad, serie irregular/vencida y fuente simulada; cálculo y resultado real en Atlas |
| 9 | `SanitaryWorkspace.jsx/.css`, formularios, gráficos y tablas | `/dashboard`, `/reports`, export, history/events | 15 comprobaciones de navegador aislado y snapshot/hash/export real Atlas |
| 10 | `backend/soi/openapi.js`, scripts de preparación/verificación, `deployment/science.py`, RPC y auditoría | OpenAPI 3.1, HMAC con vencimiento, límites, lease/reintento/cancelación | Regresión, builds, benchmark, seis controles de runtime, 17 flujos remotos y 15 controles de navegador sobre archivos desplegados |


Resultados de la regresión: **275 backend aprobadas y una integración externa optativa omitida; 13 frontend; 27 BSIE; 11 sanitarias; seis probabilísticas**. [Registro completo](evidence/soi-release-checks.json). El build Vite compila; conserva la advertencia de tamaño de MapLibre. El navegador usa fixtures y no acredita proveedores: [evidencia](evidence/soi-browser-smoke.json). La comprobación real de Atlas pasó **17 verificaciones** y eliminó únicamente su tenant temporal: [evidencia](evidence/soi-mongo-live.json).

Rendimiento medido, no estimado: fixtures CVRP de 10/50/100 nodos factibles con comprobación independiente, ~1,0 s de cálculo con límite de búsqueda de un segundo; forecast de 1000 observaciones y 200 folds, ~2,0 s. Excluye importación Python, HTTP, MongoDB y concurrencia. [Benchmark sanitario](evidence/sanitary-benchmark.json); [benchmark espacial](evidence/bsie-benchmark.json).

## Límites y dependencias pendientes

Los entregables de las fases están verificados en los alcances anteriores; no equivalen a certificación productiva ni a todas las extensiones posibles del documento maestro.

- **Bloqueado por proveedor/autorización:** GPS físico, sensores reales, SIATA/IDEAM e industrial/SCADA. Contratos/adaptadores de lectura verificados con fixtures explícitas; no se acredita conexión real. Tampoco hay tokens de máquina ni sincronización autónoma programada: la sincronización actual exige una sesión admin.
- **Límites matemáticos:** VRP de una carga por vehículo, sin descarga intermedia ni tráfico en vivo; reoptimización y aprobación explícitas. No se implementan despachos automáticos. Series predictivas regulares, modelo temporal por serie y evaluación un paso; no se afirma causalidad, precisión multihorizonte o intervalos calibrados. Clima es muestreo de exposición, sin hidrología/inundación o alertas oficiales. Carbono conserva fuentes declaradas y no usa factores oficiales precargados.
- **Límites de escala:** hasta 100 nodos/20 vehículos, 1000 observaciones predictivas, 5000 registros por dominio de snapshot/cobertura; sin prueba de carga simultánea en destino. No hay cola distribuida nueva ni garantía de conexión continua de proveedores.

Próximas tareas externas: conectar proveedores autorizados, validar dispositivos físicos, medir carga concurrente y planificar la migración de dominios históricos que todavía la requieran. Contratos, payloads, permisos, preparación del paquete y operación: [SOI_SANITARY_API.md](SOI_SANITARY_API.md).

## Evidencia del alojamiento

- API promovida: `dpl_7Ht4yhJnBXuFckEKSnkp2sbgNu4d`; frontend: `dpl_9vMfAvdqVZWhcMzHTjqpKooy3KzP`.
- [17 comprobaciones por API remota](evidence/soi-cloud-live.json), incluidos identidad, transacciones, Python, inventarios, alertas, carbono, reportes, auditoría y TTL real. Solo se eliminaron registros del tenant temporal; se conservaron contadores, índices y la auditoría global de autenticación.
- [Seis controles de motores remotos](evidence/soi-cloud-science.json), incluida denegación de solicitudes sin firma, spreg, OR-Tools y backtest.
- [15 controles de interfaz desplegada](evidence/soi-cloud-ui.json), con respuestas de API aisladas: comprueban los archivos publicados y los formularios, sin representar datos operativos.
- [Comprobaciones de dominios y proxy públicos](evidence/soi-public-release.json).
- Auditoría corregida y probada con BSON real: campos opcionales normalizados antes de calcular el hash; `waitUntil` conserva la tarea después de la respuesta. Las cargas científicas no se duplican en el log HTTP. `npm audit --omit=dev --audit-level=high`: cero vulnerabilidades de ejecución; el audit completo conserva dos hallazgos en herramientas de desarrollo heredadas.

El bundle Python medido por Vercel fue ~466 MB antes de optimización. Es una comprobación de ejecución y persistencia en este alojamiento, no una certificación de capacidad concurrente productiva. Los límites por proceso Node no son una cuota distribuida entre todas las instancias serverless.
