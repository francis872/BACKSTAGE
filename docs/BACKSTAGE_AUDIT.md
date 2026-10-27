# BACKSTAGE — auditoría de evolución Origin

## Fase 2 · 25 de octubre de 2026

Se realizó un [diagnóstico previo de dieciocho responsabilidades](BACKSTAGE_PHASE2_AUDIT.md), con inventario y copia de código antes de implementar. La evolución posterior conserva MongoDB Atlas y las vistas. [Aceptación, intentos y reparaciones verificadas](BACKSTAGE_PHASE2_TEST_REPORT.md).

## Ampliación del 25 de octubre de 2026: acceso y sesiones

Se auditó el nuevo prompt sin reconstruir la plataforma. La identidad continúa en Atlas; no hay proveedor de correo configurado. Se implementaron recuperación/verificación preparadas, cambio con contraseña actual y revocación compartida por HTTP/WebSocket. [Diseño, límites, evaluación de Supabase y evidencias](BACKSTAGE_ACCOUNT_SECURITY.md). La inspección preservó BSIE/OR-Tools y no encontró GWO/ACO/SSA/RBF. Los módulos nuevos restantes no se declaran terminados.

Fecha: 24/10/2026. Inspección del repositorio existente antes de modificar ejecución. El árbol contiene trabajo previo sin commit; se conserva íntegro. La publicación original continúa activa hasta validar este incremento. MongoDB Atlas es la única persistencia de aplicación; no se incorporará PostGIS.

## Arquitectura encontrada

React 18, Router 7, Vite 5, MapLibre GL 6; Express 4 sobre Node 24 y funciones Python 3.12 en Vercel. `frontend/src/App.jsx` concentra sesión, navegación y contexto; `lib/operationalContext.js` conserva selección por usuario/organización. `backend/infrastructure/platformMongo.js` exige esquema 2 y transacciones Atlas. `mongoIndexRegistry.js` mantiene las colecciones existentes. Los motores financieros, GIS, comparador, Monte Carlo y OR-Tools conservan contratos versionados.

Autenticación JWT y membresías vigentes se comprueban en backend; `mongoIdentity.service.js`, `organizationContext.js` y `rbac.js` aportan el aislamiento. La protección del último administrador y las invitaciones ya tienen regresiones. Las rutas públicas se sirven por el proxy del frontend y la ciencia remota exige HMAC.

| Capacidad | Archivos y evidencia | Estado al inspeccionar |
| --- | --- | --- |
| Acceso y organización | `App.jsx`, `UsersAdmin.jsx`, identidad Mongo; integración real anterior y postflight público | Funcional y verificada en el alcance documentado; Cuenta limitada a datos de perfil |
| Explorador | `pages/NativeTerritorialExplorer.jsx`, `components/SpatialSearch.jsx` | Parcial: 2D/terreno 3D, fuentes y herramientas existentes; constructor WebGL sin recuperación local; no modo globo operacional |
| Centro de operaciones | `pages/MissionControl.jsx`, `/analysis/operations` | Funcional con proyectos y SLA; pantalla independiente y diagnósticos técnicos dentro del área operacional |
| Proyectos | `pages/RetailZones.jsx`, `analysis.service.js` | Persistencia y evidencia verificadas anteriormente; selector territorial redundante y página separada |
| Activos | `pages/AssetsWorkspace.jsx`, `assets.service.js` | Altas, consulta y selección verificadas; separadas del mapa |
| Comparador | `pages/AdvancedComparator.jsx`, `LegacyAdvancedComparator.jsx`, `shared/comparison.mjs` | Cálculo/evidencia versionados verificados; dos modos existentes, navegación separada; no sustituir matemática |
| AirHeart | `pages/EarthArt.jsx`, `LiveTerritoryOverview.jsx`, servicios territoriales | Contexto/meteo existentes; pantalla propia y nombre técnico EarthArt heredado |
| SOI y rutas | `SoiWorkspace.jsx`, `SoiRoutes.jsx`, `SanitaryWorkspace.jsx`, servicios sanitarios | Persistencia y optimización verificadas; navegación fragmentada; GPS de vehículos bloqueado por ausencia de proveedor |
| Clean Com | `pages/CleanCom.jsx`, manifiesto `shared/modules.json` | Datos históricos conservados; referencia de origen, no imponerlos como proyecto sectorial actual |
| Búsqueda | `SpatialSearch.jsx`, `geography.service.js`, `territoryLive.service.js` | Geocodificación real con respuesta de proveedor; autocompletar depende de capacidad/autorización del proveedor |
| Meteorología | `territoryLive.service.js`, Open-Meteo | Implementada con fuente/fecha y fallos explícitos; requiere disponibilidad y condiciones comerciales válidas |
| Capas | fuentes MapLibre, `LayerCatalogAdmin.jsx`, importador y Atlas espacial | Varias operativas; falta control de capas unificado con disponibilidad y leyendas consistentes |
| Feed | Sin entidad/interfaz colaborativa específica | No implementado; eventos operativos existentes no equivalen a colaboración interorganizacional |
| Órbitas/IA contextual externa | Sin proveedor/configuración operacional verificable | No implementadas; evaluar contratos y datos sin fingir telemetría o respuestas de IA |

## Problemas y prioridades

1. El único ErrorBoundary rodea toda la aplicación y registra objetos de error completos. Un fallo de una capacidad derriba navegación y contexto. El constructor `new maplibregl.Map` puede lanzar antes de registrar el manejador de errores. Reproducir con WebGL deshabilitado y limitar el fallo al mapa.
2. Accesos a `localStorage` fuera de bloques protegidos en `auth.js` y `operationalContext.js`. `setStoredOperationalContext` vuelve a escribir tras un fallo de cuota sin proteger ese segundo intento. El fallo reaparece al montar la aplicación en navegadores con almacenamiento restringido. Deben conservarse sesión/contexto en memoria sin cruzar usuarios u organizaciones.
3. Cambiar territorio en `mergeOperationalContext` borra proyecto, comparación y candidatos; explorar municipios próximos puede destruir el contexto que el nuevo requisito pide conservar. Distinguir exploración de una limpieza explícita; conservar el territorio original del proyecto.
4. `App.jsx` muestra contexto, meteorología y tarjeta de identidad también en Cuenta/Organización. La navegación ofrece pantallas independientes para capacidades que deben integrarse. Mantener URLs antiguas como adaptadores compatibles.
5. Las pruebas anteriores no acreditan las nuevas interacciones ni reproducen necesariamente todos los fallos manuales reportados. No atribuir una causa única a esos fallos sin reproducir sus condiciones. Añadir regresiones de almacenamiento, WebGL, datos incompletos y navegación.

## Riesgos operativos existentes

La publicación y staging comparten el Atlas que se confirmó como pruebas. No ejecutar migraciones destructivas ni presentar esa conexión como producción aislada. Monitoreo continuo, custodia externa de respaldos, licencias de proveedores y aceptación humana siguen pendientes según `backstage-2.0/READINESS_REPORT.md`.

## Causas reproducidas y correcciones

- **Respuesta geográfica con fuente estructurada:** el comparador y el inspector intentaban renderizar el objeto `source` directamente como hijo de React. Se reprodujo el error y se agregó `sourceLabel.mjs`; la etiqueta visible se separa de los metadatos conservados. La regresión renderiza el comparador real con un proveedor estructurado.
- **Almacenamiento restringido:** accesos a sesión/contexto lanzaban `SecurityError` o `QuotaExceededError`. Los adaptadores usan memoria por ventana, con borrados efectivos y aislamiento por usuario/organización; no prometen persistencia después de cerrar la pestaña si el navegador la impide.
- **Recuperación tardía del proyecto:** en staging real, después de cambiar de capacidad y recargar, una respuesta de proyecto sobrescribía la comparación vigente y abría el modo anterior. `restoreValidatedProjectContext` mezcla contra el estado actual y comprueba el ámbito antes de aplicar la respuesta. El intento fallido y el recorrido corregido se conservaron como evidencia.
- **Identificadores de candidatos incompatibles:** IDs de coordenadas con decimales o identificadores URL no cumplían el contrato matemático. Un adaptador conserva el identificador original y produce una identidad estable admitida; las reglas del motor permanecen intactas.
- **WebGL ausente:** el mapa ofrece recuperación local sin bloquear proyectos, búsqueda o navegación. Las herramientas tienen límites de fallo independientes; los registros nuevos de recuperación no imprimen payloads ni objetos de error completos.

El [estado de implementación](BACKSTAGE_IMPLEMENTATION_STATUS.md) y el [informe de pruebas](BACKSTAGE_TEST_REPORT.md) distinguen lo implementado de las dependencias pendientes. La tabla inicial describe la inspección previa, no el estado posterior al incremento.

## Secuencia de implementación

Estabilización y regresiones → contexto/navegación compatibles → explorador persistente y paneles existentes → capas/modos/búsqueda → Feed con permisos y Cuenta/Organización → identidad Origin → aceptación integrada. Cada paso actualizará el estado y sus límites. La copia previa de código está en `.vercel/origin-before-latest.json`; no contiene secretos ni datos Atlas.
