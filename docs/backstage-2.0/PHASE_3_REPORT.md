# Fase 3 — recorrido global aprobado

Fecha: 22 de octubre de 2026, Colombia. Autorización: «hazlo» para territorio → activo → análisis → proyecto → recuperar contexto, con las páginas/APIs existentes y pruebas aisladas.

## A. Estado

Completado el recorrido de Fase 3 dentro del alcance aprobado. Referencia: rama `recovery/backstage-2-audit-20261021`, cambios locales sin commit nuevo. La copia previa de 362 archivos se archivó y restauró para verificar hashes; no es un backup de datos. [Revisión de fuentes](evidence/phase-3-source-review.json).

BACKSTAGE, su identidad negro/rojo, portada orbital, páginas generales, SOI y Clean Com se conservan. MongoDB Atlas sigue siendo la única persistencia de aplicación. No hubo publicación, escrituras en Atlas, inicialización de índices, cambios de secretos ni migraciones durante esta fase.

## B. Cambios

| Archivos principales | Responsabilidad y comportamiento |
| --- | --- |
| `AssetsWorkspace.jsx` | Analizar un activo del inventario general o SOI, conservar territorio y comenzar con mediciones vacías. Mantener registro, mapa e inmobiliario. |
| `AdvancedComparator.jsx` | Abrir el modo solicitado, recuperar snapshots, crear el proyecto desde evidencia guardada, invalidar la acción al editar y separar nuevas versiones. Mantener el motor territorial histórico. |
| `RetailZones.jsx`, `projectContext.mjs` | Recuperar el proyecto con su territorio, activos, snapshot y candidatos canónicos; mostrar el enlace al análisis en el listado existente. |
| `App.jsx`, `operationalContext.js`, `territory.js` | Contexto por usuario/organización, identidad compuesta, historial, enlaces recuperables y reintento de consultas temporales fallidas. |
| `comparisons.routes.js`, `comparisons.service.js` | Endpoint autorizado e idempotente para vincular snapshot y proyecto en una transacción MongoDB. Resolver activos dentro de su organización. |
| `analysis.repository.js`, `workspaceContext.js` | Reutilizar el registro de proyecto existente con sesión transaccional; validar territorio sin atribuir verificación a datos aportados. |
| Pruebas, harness, scripts de verificación y CI | Integración HTTP, aislamiento, reversión, recuperación de contexto y batería visual conservada. CI valida y prepara fuentes, sin publicar. |

Los contratos y límites se detallan en [Global Workspaces](GLOBAL_WORKSPACES.md) y [Core API](CORE_API.md). No se modificaron los algoritmos de comparación ni se fabricaron puntuaciones con coordenadas.

## C. Verificación

263 pruebas de backend aprobadas; una prueba externa de ruta quedó omitida por ser opt-in. Incluyen cinco pruebas nuevas de validación territorial, enlace/reintento, reversión, permisos y recorrido HTTP de registro → inventario → snapshot → proyecto → recuperación. [Registro](evidence/phase-3-backend-tests.txt).

26 pruebas de frontend aprobadas, incluidas seis nuevas sobre almacenamiento por propietario, referencias compuestas, cero geográfico, recuperación canónica, cambio de territorio y nombre del borrador. [Registro](evidence/phase-3-frontend-tests.txt).

Compilación correcta de 127 módulos. Persisten las advertencias de Vite/CJS y tamaño de MapLibre; no se certifica rendimiento por compilar. [Registro](evidence/phase-3-build.txt).

En navegador se mantienen los 26 recorridos previos y las 20 comprobaciones de diseño/accesibilidad. Se añaden 11 comprobaciones del recorrido aprobado: análisis nuevo sin mediciones heredadas, ambos inventarios, proyecto original, evidencia recuperada, recarga, historial, URL sin contexto almacenado, idempotencia, edición que invalida el resultado, fallo temporal con reintento y nueva versión independiente. Cero errores de ejecución. [Informe](evidence/phase-3-browser.json).

Las capturas incluyen las 35 vistas de Command/activos/comparación/diálogo/portada en siete anchuras, cinco estados/formulario/acceso y cuatro vistas del recorrido. El proyecto se revisa además en 390 y 1440 px. El harness verifica desbordamiento horizontal, foco, teclado y movimiento reducido; las capturas no constituyen una certificación completa de accesibilidad.

Los paquetes locales API y web se prepararon sin vinculación a proyectos remotos y se verificaron por hash. [Resultado y cantidades](evidence/phase-3-packaging.json). Los motores científicos no se volvieron a ejecutar: este incremento conserva sus fuentes y el comparador compartido. El workflow actualizado no se ha ejecutado en GitHub durante esta fase.

## D. Riesgos y límites

Pruebas HTTP contra fixture MongoDB y navegador con API aislada; faltan transacciones concurrentes y persistencia real en Atlas/staging. Se bloquean proveedores externos: cartografía, GPS, sensores y conectores no se certifican en esta ejecución. El inventario conserva los límites de paginación actuales y el selector consulta hasta 500 activos.

El proyecto comienza pendiente y referencia el análisis; no se declaran completadas las etapas posteriores de riesgo/probabilidad/recomendación. La nueva ruta no emite aún el evento histórico de creación; su listado se actualiza por consulta. El contexto histórico sin propietario no se restaura automáticamente para evitar mostrar trabajo de otro usuario.

El repositorio ya contenía cambios extensos antes de esta fase. La reversión debe usar el snapshot de entrada y el inventario de archivos de esta fase de forma selectiva; no un reset global. [Procedimiento](ROLLBACK.md).

## E. Próxima fase propuesta

Fase 4 — Platform Core: revisar identidad, membresías/permisos, capacidades y auditoría sobre los servicios Atlas existentes, con un recorrido de invitación → cambio de rol → revocación → intento de acceso.

Dependencias: aprobar ese alcance y disponer de entorno de pruebas para las verificaciones que requieran Atlas. Riesgos: privilegios obsoletos, revocación incompleta y eventos sin trazabilidad. Aceptación: permisos actuales aplicados a HTTP/WebSocket, aislamiento por organización, auditoría verificable y regresiones actuales aprobadas. No se ha iniciado esta fase ni desplegado la recuperación.
