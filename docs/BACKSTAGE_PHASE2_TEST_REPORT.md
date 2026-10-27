# BACKSTAGE · aceptación técnica del backend de fase 2

25 de octubre de 2026, Bogotá. **Incremento aceptado en staging protegido**, sobre MongoDB Atlas. No se reconstruyeron las vistas ni se cambió Mapbox. La publicación original de producción conserva sus despliegues. El worker se ejecutó en procesos separados durante los ensayos; no se declara alojado permanentemente.

## Resultado ejecutado

| Comprobación | Resultado | Evidencia / alcance |
| --- | --- | --- |
| Backend completo | 379 pruebas: 378 aprobadas, una integración externa omitida, cero fallos | [Registro](evidence/phase2-backend-tests.txt); ejecutor sin credenciales Atlas heredadas |
| Frontend existente | 33 aprobadas | [Registro](evidence/phase2-frontend-tests.txt); la prueba HTTP también atraviesa el proxy real |
| Ciencia BSIE | 27 aprobadas | [Registro](evidence/phase2-science-tests.txt); entorno científico existente |
| Ciencia sanitaria | 11 aprobadas | [Registro](evidence/phase2-sanitary-tests.txt); OR-Tools y predicción existentes |
| Dependencias de ejecución | Cero vulnerabilidades reportadas por npm audit --omit=dev | [Backend](evidence/phase2-backend-dependencies.json), [frontend](evidence/phase2-frontend-dependencies.json); no es una auditoría integral |
| Migración aditiva | Tres índices comprobados en Atlas de pruebas | [Evidencia](evidence/phase2-indexes.json); sin nuevas colecciones, esquema existente 2 conservado |
| BCO real remoto | Catorce grupos aprobados | [Ensayo](evidence/phase2-staging-live.json), API sin interceptar y workers nativos separados |
| Explorador real remoto | Once grupos aprobados | [Ensayo](evidence/origin-live.json), Mapbox/OSM, comparación, GIS, rutas y mapa 2D/3D/globo |
| Código conservado | 109 archivos de frontend/src y 67 científicos/compartidos sin cambios | [Hashes](evidence/phase2-source-review.json); dependencias del backend iguales |
| Paquete del worker | Preparado, huella comprobada; no alojado como proceso continuo | [Manifiesto](evidence/phase2-worker-package.json) |
| Postflight independiente | Aprobado | [Evidencia](evidence/phase2-postflight.json); protección, salud, limpieza, código y producción |

## Integración real y rendimiento

Ejecución BCO `atlas-core-20261025203601-dd11a00a47c7`. Dos procesos compitieron por el mismo trabajo: solo uno ejecutó el intento. Se verificaron idempotencia HTTP concurrente, revisión optimista con 200/409, aislamiento multiempresa, riesgo conocido 0,125 y Moran −1/3 para conectividad completa. Un trabajo terminado conserva el enlace al proyecto, el GeoJSON exportable y hashes históricos verificables. Las rutas analíticas antiguas rechazan ese registro BCO.

La expiración controlada de un lease se recuperó con otro propietario, conservando el fencing frente al antiguo. El timeout real produjo TIMED_OUT. La propuesta defensiva requirió otro administrador, registró su identidad correcta y no aplicó políticas sensibles. El CRUD de fuentes verificó referencia propia, idempotencia del evento y archivo con conservación del historial. Se comprobaron la cadena canónica de auditoría, la omisión de payloads y la ausencia de leases en eventos públicos.

Veinte lecturas reales con concurrencia cuatro: p95 **632,68 ms** en ese ensayo. Es una muestra de lecturas de organizaciones de prueba; no certifica capacidad productiva ni un SLA.

[Benchmark local](evidence/phase2-runtime-benchmark.json): dos ejecuciones de Monte Carlo de 100.000 iteraciones, semilla 42, resultados numéricos iguales; 625,01 ms totales en esa máquina. RSS del proceso Node muestreado cada 10 ms: 37.527.552 bytes iniciales y 77.041.664 bytes de pico muestreado (aproximadamente 73,5 MiB). Incluye el proceso y su thread; no mide el pico absoluto, una instancia Vercel o todos los cálculos. Los datos son sintéticos explícitos y no se escribieron en Atlas.

## Intentos conservados y correcciones

1. El primer catálogo remoto falló porque el empaquetado Node omitía `bsie/temporal.py`, requerido por el fingerprint. Se declararon los recursos científicos explícitos en includeFiles y se añadió una regresión de empaquetado. No se retiró la comprobación del motor.
2. El ensayo ampliado de recuperación encontró un trabajo RUNNING con tarea completada y lease perdido. Se separó el sondeo de cancelación de las escrituras de renovación, se actualizaron los instantes en reintentos transaccionales y se drenan las renovaciones antes del cierre. La regresión reproduce una renovación en curso; el ensayo final comprobó recuperación y timeout reales.
3. La primera lista de limpieza omitía analytics_jobs. [La reparación](evidence/phase2-cleanup-recovery.json) respaldó y retiró seis registros de ensayo, con pertenencia verificada contra los BSON originales. Los informes iniciales conservan la anotación y sus copias anteriores. La lista de colecciones ahora es explícita y tiene regresión; el ensayo final y el postflight comprueban analytics_jobs desde una conexión nueva.
4. Hubo timeouts y un fallo DNS en lecturas de preflight de Vercel, antes de registrar cuentas. Se añadieron reintentos acotados a lecturas. Las escrituras no se repiten automáticamente ante un resultado de red incierto.

Los informes fallidos anteriores y sus backups se conservan; no se presentan como aceptación final. Las organizaciones temporales de los ensayos aprobados se exportaron a BSON privado y retiraron con selectores de propiedad comprobados. Los contadores, leases globales compartidos y trazas globales de seguridad se conservaron.

## Pareja aceptada y límites

API: `dpl_9Zsc6VGBXduCGphFJK1b8yVEhBDH`. Web: `dpl_8kGSBjtZ9BoxMwL9UjyTXeVicUaL`. [Staging protegido](https://backstage-staging-web.vercel.app). El postflight confirmó 238 archivos de ejecución API y 120 web coincidentes con sus fuentes, y 263 archivos del paquete separado del worker coincidentes. Sin acceso autorizado, Vercel responde 302; con acceso, salud 200; sin JWT de aplicación, Cuenta responde 401. Los dominios originales de producción mantienen sus IDs anteriores.

Pendientes de operación: alojamiento supervisado del worker, monitoreo independiente del equipo local, separación de Atlas productivo, custodia y recuperación productiva, y una imagen de reversión que mantenga los filtros de seguridad. El correo, el GPS y los conectores satelitales sin proveedor no se activaron. GWO/ACO/SSA/RBF/genéticos permanecen identificados como ausentes. La aprobación de defensa es un registro humano de revisión, no aplicación autónoma de configuración.

[Arquitectura](BACKSTAGE_PHASE2_ARCHITECTURE.md), [permisos](BACKSTAGE_PHASE2_PERMISSIONS.md), [seguridad y reversión](BACKSTAGE_PHASE2_SECURITY.md), [diagnóstico previo](BACKSTAGE_PHASE2_AUDIT.md).
