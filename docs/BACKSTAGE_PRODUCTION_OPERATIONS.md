# BACKSTAGE · cierre operativo de producción

25 de octubre de 2026, Bogotá. El propietario autorizó preparar y publicar la versión nueva después de cerrar su operación. Esta entrega amplía el código de operación y sus comprobaciones. **No equivale a un worker alojado, un Atlas productivo aprovisionado o una publicación nueva en producción.** La aplicación ya tiene alojamiento en Vercel; faltan la operación de tareas y las configuraciones productivas descritas a continuación.

## Infraestructura confirmada: Vercel

El propietario aclaró que la plataforma está alojada en Vercel, sin servidor adicional ni dominio propio. Se conservan los proyectos y las direcciones `.vercel.app`; adquirir un dominio no es requisito para seguir operando la aplicación. La consulta de solo lectura a la cuenta confirmó plan **Hobby**, sin cambios de facturación. [Contexto comprobado](evidence/vercel-operating-context.json).

En Hobby, Vercel Cron admite una ejecución diaria por tarea; no permite el ciclo de un minuto previsto para el monitor. Las funciones tienen duración acotada, y el paquete actual configura 60 segundos: el bucle continuo del worker no se despliega allí directamente. Vercel dispone de Workflows y Queues para trabajo durable; su integración con este backend, límites, recursos científicos y recuperación aún debe evaluarse y probarse. No se declara activada por consultar su documentación.

La siguiente evaluación parte de Vercel y del plan existente. El contenedor preparado conserva valor como alternativa si se elige un proceso externo; **no implica que sea obligatorio contratar otro hosting**. El monitoreo también necesita una comprobación independiente del servicio supervisado para detectar una caída de Vercel. Atlas de producción, respaldos, correo y GPS mantienen sus requisitos propios.

Fuentes: [direcciones asignadas por Vercel](https://vercel.com/docs/domains/working-with-domains), [límites de Cron por plan](https://vercel.com/docs/cron-jobs/usage-and-pricing), [duración de funciones](https://vercel.com/docs/functions/limitations), [Workflows](https://vercel.com/docs/workflows) y [Queues](https://vercel.com/docs/queues).

La fase 2 anterior conserva su [aceptación de staging](BACKSTAGE_PHASE2_TEST_REPORT.md). Los cambios de este expediente se ensayan con API/proxy locales, Atlas de pruebas y proveedores públicos reales; sus pruebas no sustituyen una aceptación en los hosts productivos.

## Implementación disponible

| Frente | Implementado y comprobable en esta entrega | Falta para operar |
| --- | --- | --- |
| Worker | Imagen definida con Node 24/Python 3.12, usuario sin privilegios, init y apagado controlado; Compose con reinicio, límites y archivos de secretos externos; paquete de fuentes sin credenciales y carga real de módulos/catálogo | Evaluar ejecución durable compatible con Vercel Hobby; si se elige la alternativa de contenedor, construirla y comprobarla en el host adicional |
| Latidos y monitoreo | Worker con latido Atlas cada 15 segundos; monitor separado cada minuto, estado persistente, leases entre monitores, detección de latido mayor de 60 segundos e incidentes tras dos fallos/dos recuperaciones | Alojamiento independiente del PC y alertas del proveedor sobre la caída del propio monitor; sin Atlas no puede publicar una alerta nueva en la aplicación |
| Panel del administrador | `/operations/monitor` consume el estado alojado cuando se define el entorno; comprueba sesión, identidad y rol vigentes y omite detalles técnicos del lease | Activar el entorno en el API después del aprovisionamiento; no se habilita solo por preparar el contenedor |
| Atlas productivo | Huella de host/base independiente de usuario/clave; procesos productivos rechazan un destino no registrado o igual al de staging; checklist de operación sin promoción automática | Aprovisionar entorno separado, usuarios mínimos y accesos de red; verificar permisos efectivos desde cada servicio |
| Respaldos | Se conserva el procedimiento de pruebas y su evidencia histórica; el checklist exige programación, custodia externa y restauración aislada | Configurar y ensayar el servicio de backups del Atlas productivo real; no hay una programación productiva aplicada |
| Vigencia | Revalidación transaccional de las fuentes declaradas al cerrar riesgo/proyecto, aprobar/iniciar/completar una recomendación, aprobar optimización vinculada y activar/completar/cerrar recursos operativos vinculados; evita crear directamente operaciones terminadas para saltarse la revisión | Recorrido funcional con el propietario y revisión de módulos sin vínculo a proyecto; no se inventa una política para recursos que carecen de esa referencia |
| Correo | Se conserva el adaptador Resend existente con envío idempotente y enlaces de propósito/vencimiento/uso único | Cuenta, remitente/dominio verificado, secretos y prueba de recepción real |
| GPS | Se conserva el adaptador Traccar existente: HTTPS, secreto del servidor, organización, consentimiento, fuente y mapeo de dispositivos/vehículos | Servidor autorizado, credencial, dispositivos y prueba de observaciones reales; no se conecta a servidores demo |
| Satélites | Nuevo adaptador de metadatos y huellas de escenas Sentinel/Landsat por Earth Search, API autenticada, límites de área/fecha/escenas/respuesta y GeoJSON para el explorador existente | No incluye descarga de imágenes, índices espectrales, análisis raster ni un conector directo de Copernicus |

La vigencia se evalúa nuevamente contra la política vigente y el reloj del servidor; no se confía en `requires_attention` guardado. Las excepciones deben coincidir con fuente, proyecto, hash/revisión de política y vencimiento. Históricos y simulaciones mantienen las clasificaciones admitidas por las reglas existentes. La revisión sigue basada en metadatos declarados: no certifica la fuente ni convierte simulaciones en observaciones reales. Las mutaciones verificadas comparten transacción con el registro del control y su auditoría.

Los algoritmos científicos y las vistas originales no se modificaron. No se introdujeron dependencias npm ni otra base de datos.

## Alojamiento y secretos

Fuente reproducible del paquete: `node scripts/prepare-production-runtime.js`. Su [manifiesto público](evidence/production-ops-runtime-package.json) declara por separado preparación, carga de módulos, construcción Docker y despliegue. El ZIP y los manifiestos completos se conservan en el directorio privado indicado por `.vercel/production-runtime-latest.json`. No contiene las dependencias instaladas ni archivos de entorno.

Únicamente si se elige la alternativa de host adicional con Docker/Compose, después de preparar los secretos fuera del repositorio:

```sh
docker compose -f deployment/operations.compose.yaml build worker
docker compose -f deployment/operations.compose.yaml up -d worker monitor
```

`BACKSTAGE_WORKER_ENV_FILE` y `BACKSTAGE_MONITOR_ENV_FILE` deben apuntar a archivos absolutos distintos del host. El paquete no los crea ni inventa sus valores. Cada proceso necesita `MONGODB_URI`, `MONGODB_DB` explícito y `BACKSTAGE_RUNTIME_ENV=staging` o `production`. En producción también requiere `BACKSTAGE_STAGING_TARGET_SHA256` y `BACKSTAGE_PRODUCTION_TARGET_SHA256`; se registran al aprovisionar los destinos y excluyen credenciales de la huella.

El monitor necesita `MONITOR_API_ORIGIN`, `MONITOR_WEB_ORIGIN` y `MONITOR_EXPECT_PROTECTION=true|false`; los orígenes deben ser HTTPS sin ruta, consulta, fragmento o credenciales. Si se exige protección Vercel, `MONITOR_VERCEL_BYPASS` se configura exclusivamente como secreto. El API utiliza el mismo entorno lógico para seleccionar el estado del monitor. El endpoint anterior de staging permanece compatible cuando no se define el entorno nuevo.

El worker de producción debe usar Python local del contenedor y no heredar un `SOI_SCIENCE_RPC_URL` de staging. Los límites Compose son valores del paquete, no una certificación de capacidad. No hay Docker disponible en este equipo para construir y certificar la imagen; la carga de módulos/catálogo sí se ejecutó desde las fuentes empaquetadas.

## Atlas, respaldo y publicación

Las credenciales de la aplicación deben limitarse a su base productiva. Las del monitor solo necesitan consultar el marcador de esquema y consultar/escribir sus registros técnicos en `soi_provider_locks`; no deben heredar una cuenta administrativa. Migración/provisión y restauración deben usar identidades separadas del proceso habitual. Se deben comprobar los permisos efectivos y la denegación de acceso a pruebas/otras bases. Una base con otro nombre y credenciales administrativas compartidas no acredita este aislamiento.

El respaldo productivo debe configurarse en el servicio real, con retención y custodia fuera del PC, y verificarse restaurando en un destino aislado. Falta definir y comprobar RPO/RTO sobre ese servicio. El script `atlas-backup.js --test-environment` sigue limitado deliberadamente al entorno de pruebas; no se reutiliza como si ya fuese un scheduler productivo. El respaldo anterior al cambio de código contiene 331 archivos seleccionados y queda identificado en `.vercel/production-ops-before-latest.json`; no es un respaldo Atlas.

`node scripts/production-preflight.js <expediente.json>` imprime un checklist local y falla ante controles ausentes. Aunque todos los campos estén completos, su resultado es `ready_for_review`, no una autorización ni una comprobación criptográfica de las evidencias. Nunca ejecuta promoción o cambios en Vercel. La aceptación debe corresponder a los IDs exactos de API/web y ser reciente.

Antes de publicar faltan: host y reinicio comprobados, monitor externo comprobado, Atlas aislado y permisos mínimos, backups programados y restauración, capacidad del host real, recorridos funcionales, aceptación de los controles comerciales y reversión compatible que conserve sesiones/filtros de privacidad BCO. El correo y GPS solo se declaran activos después de verificar sus entregas reales.

## Pruebas y evidencias

Resultado final: **390 pruebas backend, 389 aprobadas, una integración externa omitida y cero fallos; 33 frontend aprobadas**. Los dieciséis grupos de integración reales terminaron aprobados en `atlas-core-20261025230706-fde564883b9f`; el postflight de solo lectura aprobó la limpieza de las dieciséis colecciones de ensayo desde otra conexión y la coincidencia de 247 fuentes del paquete. [Resumen verificable](evidence/production-ops-summary.json). Veinte lecturas con concurrencia cuatro tuvieron p95 de 1.157,45 ms en el ensayo; no certifica el SLA o la capacidad de un host productivo aún no aprovisionado.

- [Integración real](evidence/production-ops-atlas-live.json): dieciséis grupos, HTTP/proxy reales, Atlas de pruebas, workers nativos separados, vigencia y consultas autenticadas Sentinel/Landsat. Los datos empresariales creados son ensayos propios explícitos; los metadatos satelitales provienen del proveedor real.
- [Consulta pública al proveedor](evidence/production-ops-satellite-live.json): dos colecciones, escenas reales, sin descargar imágenes ni escribir en Atlas. La colección devolvió `proprietary` como licencia; se conserva ese valor y no se atribuye una licencia abierta no confirmada.
- [Regresión backend](evidence/production-ops-backend-tests.txt) y [frontend](evidence/production-ops-frontend-tests.txt): resultados del código actual, separados de los históricos de fase 2.
- [Postflight independiente](evidence/production-ops-postflight.json): limpieza desde una conexión nueva, producción anterior conservada y fuentes del paquete comparadas con el repositorio.

La primera ejecución de integración omitía `soi_operations` y `soi_configuration` en el manifiesto de limpieza. Se conservaron el informe inicial y el BSON original; [la reparación](evidence/production-ops-cleanup-recovery.json) respaldó y retiró únicamente esos dos registros con pertenencia comprobada. Se amplió el manifiesto, se añadió regresión y se repitió la aceptación. Ese incidente no se presenta como una limpieza correcta desde el primer intento.

El primer ensayo de red del catálogo falló bajo el sandbox y se conserva; la consulta con acceso de red autorizado posterior aprobó. La primera regresión frontend encontró una restricción de lectura de esbuild; la repetición con acceso autorizado aprobó. El primer empaquetado omitía los módulos `.mjs`; la carga real del catálogo lo detectó, se corrigió y el paquete actual incluye esos módulos.

Referencias de proveedores: [workers de Render](https://render.com/docs/background-workers), [usuarios y permisos Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/), [catálogo y condiciones Earth Search](https://github.com/Element84/earth-search/blob/main/README.md), [API Traccar](https://www.traccar.org/traccar-api/), [envío Resend](https://resend.com/docs/api-reference/emails/send-email).
