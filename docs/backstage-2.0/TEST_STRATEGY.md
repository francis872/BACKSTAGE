# Verificación de la estabilización

`node scripts/verify-soi-release.js` ejecuta suites backend, frontend, BSIE, sanitarias, RPC y probabilidad; registra comando, estado y evidencias en `docs/evidence`. Backend fuerza `MONGODB_URI=''`. No se ejecutan escrituras Atlas para validar esta fase. Los motores científicos mantienen sus pruebas numéricas anteriores.

Las nuevas pruebas HTTP emplean Express, JWT firmados, repositorios reales y una base de documentos de prueba. Cubren alta/lectura de activos, IDs de fuentes distintas, alcance, procedencia, proyección GeoJSON, snapshots y reducción/revocación de permisos. El fixture no es un modo de almacenamiento productivo. La prueba WebSocket usa sockets locales y membresías mutables; comprueba tenant, canal, rol, vigencia y revocación sin acceder a Atlas.

`npm run build --prefix frontend` compila el producto. `node frontend/scripts/soi-browser-smoke.mjs` sirve ese build e intercepta APIs y cartografía; requiere Chrome y acepta su ruta mediante `SOI_TEST_BROWSER`. Se comprueban formularios, navegación, modos de análisis, guardado/recuperación, acceso a páginas conservadas y errores de ejecución. Sus datos están identificados como fixtures. No acredita un proveedor real ni persistencia remota.

La matriz visual captura tres pantallas en siete anchuras y comprueba desbordamiento de página, foco básico y preferencia de movimiento reducido. Las tablas pueden tener desplazamiento horizontal interno. Las capturas permiten revisión humana; no son certificación WCAG, métricas Core Web Vitals ni comparación contra una versión histórica aprobada.

Las pruebas de límites de módulos son complementarias a las funcionales. Los manifiestos de release se verifican por SHA-256, presencia de Node/Python, contratos generales, requirements planos y locks consistentes. CI repite estas comprobaciones sin publicar. El único test omitido es la ruta vial real optativa; no se simula como prueba aprobada.


## Cobertura de Platform Core

`backend/domain/platformCore.test.js` ejecuta invitación/aceptación, caducidad, revocación, cuenta/organización equivocadas, administrador deshabilitado, token obsoleto, reversión por fallo de auditoría, retirada de capacidad y saneamiento HTTP. La integración abre rutas Express y sockets nativos reales contra identidad MongoDB inyectada; no sustituye los guards por roles de token. El fixture transaccional no certifica concurrencia real del driver/Atlas.

`npm run test:core-ui --prefix frontend` conserva las comprobaciones anteriores y añade miembros/invitaciones/auditoría. Sus API son fixtures y el transporte WebSocket del navegador se sustituye por indisponibilidad explícita; el servidor nativo se comprueba en el test de backend. Se revisan invitación/auditoría/aceptación en 390 y 1440 px, además de las siete anchuras conservadas. Los informes de Fase 4 no sobrescriben los de Fase 3.


## Integración autorizada en Atlas de pruebas

`node backend/scripts/verify-platform-core-atlas.js` imprime el plan sin conectar. `--test-environment --preflight` realiza únicamente las comprobaciones de lectura. Tras revisar ese resultado, `--test-environment --apply` aplica solo los índices de invitaciones, crea datos propios de ejecución, comprueba concurrencia/rollback/permisos y restaura su respaldo lógico en colecciones nuevas antes de limpiar los datos de prueba. No debe ejecutarse automáticamente en CI ni contra producción. `inspect-platform-core-validation.js` confirma el resultado en modo de solo lectura desde un proceso nuevo.

La ejecución real del 22/10/2026 está en [Atlas Validation](ATLAS_VALIDATION_REPORT.md). La única prueba local añadida comprueba límites de selectores de limpieza y exclusión de contadores. No se repitieron los motores científicos o el build: las fuentes de aplicación no cambiaron.


## Staging real autorizado

`verify-staging.js --test-environment --apply` abre dos navegadores Chrome y consulta el proxy, la API y Atlas reales. No usa Fetch interception. Dispositivo con posición emulada, criterio/observaciones declarados como ensayo y dos tenants nuevos; ninguna acreditación de GPS físico. Por defecto imprime el plan. Las cuatro pruebas locales de transporte se ejecutan con `MONGODB_URI` vacío.

La ejecución aprobada pasó nueve comprobaciones y 73 respuestas observadas, sin excepciones de runtime. `inspect-staging.js` confirmó desde un proceso nuevo la limpieza y los aliases protegidos. Se preservan las trazas globales de registro/login y los contadores. El primer intento falló por un selector del ensayo para detalles plegados y su limpieza también pasó. [Informe, alcances y evidencia](STAGING_REPORT.md).


## Intelligence Core: Fase 5

`backend/domain/intelligenceCore.test.js` añade trece pruebas con valores conocidos: centavos fuera del rango entero seguro, razones exactas, transformaciones afines, ausentes/restricciones, redondeo final, rechazo de unidades, huellas, alteraciones, versiones antiguas/desconocidas, atomicidad y permisos HTTP. La suite backend final aprobó 289 pruebas y omitió una externa; frontend aprobó 26; las seis suites de regresión pasaron.

`node frontend/scripts/soi-browser-smoke.mjs --phase5` conserva los 66 checks existentes en evidencia separada. `node backend/scripts/verify-staging.js --test-environment --apply --phase5` no intercepta APIs: importa real precisión decimal en Atlas, pulsa comprobación, descarga desde Chrome, recupera el proyecto y abre un registro v1 sin backfill. Los doce grupos pasaron; incluyen el rechazo de certificación/proyecto para un registro v1 inválido y esperas por el documento nuevo en cada navegación/recarga. El archivo descargado se recalculó después de la limpieza desde otro proceso y coincidió con las huellas del servidor. `inspect-staging.js --phase5` confirmó la limpieza y los aliases protegidos. [Informe](PHASE_5_REPORT.md).


El cierre del 23/10 revalidó las trece pruebas del contrato y volvió a ejecutar la integración contra los Preview finales. Dos intentos del ensayo se detuvieron al actuar antes de cargar opciones/tarjetas; se corrigieron las esperas y se confirmó la limpieza de cada ejecución. No se modificó la interfaz para adaptar la prueba.


## Extensión de Fase 5: finanzas y probabilidad

`financialProbabilityEvidence.test.js` verifica casos independientes de VPN, DCF, capitalización, payback y TIR; centavos por encima del entero seguro; entradas inválidas; cambio de semillas y orden JSON; conservación histórica; mutaciones de manifiestos; transacción de job/proyecto/auditoría y rollback; lectura de consulta y rechazo de escrituras, revocación y tenant ajeno por HTTP. El ajuste importado conserva parámetros y no acepta certificación del cliente.

Los verificadores admiten `--engines`, con evidencias `phase-5-engines-*` para conservar las anteriores. La integración usa cuentas/organizaciones nuevas, API real sin interceptar, Chrome y Atlas de pruebas; comprueba formulario financiero, simulación, recarga, exportación descargada, permisos y limpieza acotada. Incluye `analytics_jobs` y `property_valuations` en su respaldo BSON y limpieza de datos propios. No elimina auditoría global ni retrocede contadores compartidos.


## GIS y reglas de rutas

`spatialEvidence.test.js` verifica trece casos: distancias conocidas, coordenadas/CRS/frontera, alteraciones de contrato, reglas y parámetros efectivos, fuentes/unidades, aprobación con recursos/configuración cambiados, verificación independiente de soluciones, repetición sin sobrescribir, inviabilidad frente a tiempo agotado, motor Python real sin cambios, rollback de resultado/proyecto/evento, revisión/auditoría de configuración y permisos HTTP. El fixture anterior de aprobación se amplió con un recorrido matemáticamente válido y versión identificada; las aserciones de permisos y estado se conservaron.

`--spatial` en helpers de staging y navegador conserva evidencia `phase-5-spatial-*`. La integración real usa formulario GIS, carga real de matriz JSON de ensayo, optimización Python protegida, comprobación/repetición, vínculos con proyecto y rechazo de aprobación tras cambiar configuración. Su respaldo/limpieza añade únicamente colecciones propias de configuración, activos/vehículos SOI, escenarios y eventos de dominio de los tenants temporales. Los motores GIS/Python originales y los archivos que determinan huellas financieras se comparan con el respaldo previo.
