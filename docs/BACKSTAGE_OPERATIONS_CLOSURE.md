# Backstage 2.0 · matriz de cierre operativo

26 de octubre de 2026, Bogotá. **Decisión: NO_GO productivo.** Se ejecutaron comprobaciones de solo lectura sobre Vercel y ensayos aislados con datos sintéticos en Atlas de pruebas. No hubo despliegue, reasignación de alias, cambio de protección, variables, claves activas ni habilitación de usuarios reales. La versión publicada y el acceso protegido de Preview se conservaron.

«Verificado» acredita únicamente el alcance de la fila; no acredita otros entornos. «Pendiente» identifica una prueba o decisión aún no ejecutada. «Bloqueado» identifica la operación concreta que necesita acceso, recursos o permisos externos. Se continuó con las actividades independientes de cada bloqueo.

## Matriz de preparación

| Frente y alcance | Estado | Evidencia y límite |
| --- | --- | --- |
| Conservación de los cuatro proyectos Vercel | **verificado** | Inventarios de producción/Preview al inicio y al final: mismos despliegues, alias, protección y nombres/tipos/destinos de variables. [Antes](evidence/operations-closure-audit-before.json), [después](evidence/operations-closure-audit-after.json). No se leyeron valores secretos remotos ni se certifica su contenido comparando nombres. |
| Permisos efectivos de la conexión Atlas de pruebas | **verificado** | `connectionStatus` con privilegios confirmó `atlasAdmin` y acceso amplio. **No cumple mínimos privilegios.** La identificación es de la credencial de datos, no un permiso de administración del servicio Atlas. [Auditoría](evidence/operations-closure-audit-before.json). |
| Separación Atlas pruebas/producción, usuarios y red productiva | **bloqueado** | La integración administrativa de Atlas sigue sin conectar. No se certifican clúster, usuarios, permisos de producción, lista de acceso IP ni separación usando una configuración local histórica. [Conexión](evidence/operations-atlas-connection.json). Permisos exactos en el apartado siguiente. |
| Reglas de configuración segura de Resend | **verificado** | Validador local rechaza inyección de cabeceras, remitente de ensayo y origen de recuperación ajeno. Una respuesta de dominio verificado no se convierte en entrega ni en recepción. Las pruebas no enviaron mensajes. [Controles](../scripts/operations/controls.cjs), [regresión](evidence/operations-closure-backend-tests.txt). |
| Dominio, remitente, ámbito de clave y entrega reales | **bloqueado** | No hay cuenta/configuración de Resend ni destinatario administrativo autorizado. La operación de lectura de dominios y el envío real se detienen; no se crean valores ficticios. [Preflight](evidence/operations-resend-preflight.json). |
| Observabilidad: agregación y ciclo de incidentes | **verificado** | Métricas de disponibilidad, errores, latencia y operaciones críticas; control de antigüedad; apertura/cierre tras dos muestras; outbox administrativo con idempotencia, reintentos y presupuesto. No se conservan identidades/rutas en los agregados ni se confunde 2xx del webhook con recepción humana. [Implementación](../scripts/operations/controls.cjs), [observador](../scripts/operations/observe-release.js). |
| Lectura de telemetría real de Vercel | **verificado** | Muestra acotada de quince minutos: cinco eventos estructurados, cero errores de servidor y cero operaciones críticas observadas. Los registros sin procesar no se guardaron ni imprimieron. **La ventana completa y el presupuesto de errores no se certifican.** [Muestra](evidence/operations-telemetry-sample.json). |
| Servicio independiente, flujo continuo y alerta recibida por administrador | **bloqueado** | Falta host/scheduler con estado duradero y canal/destinatario. El observador se ejecutó localmente, creó cuatro avisos locales sobre evidencias ausentes y no envió alertas. Su outbox no se presenta como panel/monitor externo desplegado. [Estado](evidence/operations-observability.json). |
| Separación local de claves por entorno y ensayo de rotación/recuperación | **verificado** | Once comprobaciones: material de claves distinto, contexto autenticado, lectura histórica tras cambio de clave activa en memoria, rechazo al retirar clave antigua, recuperación de copia cifrada y rechazo de corrupción/clave incorrecta. No se alteraron claves de runtime ni documentos históricos. [Ensayo](evidence/operations-key-recovery.json). |
| Custodia externa, segundo custodio y recuperación desde el almacén productivo | **bloqueado** | Las copias ensayadas permanecen locales y cifradas, con sus claves de recuperación en otra carpeta del mismo equipo. Esto no acredita independencia de custodia. Faltan almacén externo autorizado, identidad de recuperación y segundo operador. |
| Respaldo y restauración de fixture sintético con aplicación nativa | **verificado** | Cinco grupos: instantánea coherente, copia AES-GCM, restauración BSON/índices, lectura/reproducción nativa, aislamiento organizacional y auditoría válida. Diez colecciones, diecinueve documentos y treinta y nueve índices; TTL suspendido en destino. Ambas bases exclusivas se eliminaron y el origen sintético conservó sus hashes. [Restauración](evidence/operations-restore-drill.json). |
| Calendario/retención y restauración del respaldo productivo real | **bloqueado** | Sin administración Atlas ni política del servicio productivo. La prueba sintética no acredita snapshot administrado, PITR, custodia externa, RPO ni RTO productivos. |
| Procedimiento de reversión y controles preventivos | **verificado** | Se identificaron la pareja productiva actual y la anterior; se verificaron propiedad y estado READY. Los controles bloquean otro proyecto, claves históricas faltantes, descenso de MFA y contratos no acreditados. Cero cambios de alias y cero restauraciones sobre el origen. [Plan](evidence/operations-rollback-plan.json). |
| Compatibilidad completa y ejecución real de reversión | **pendiente** | La compatibilidad de claves/MFA/sesiones/datos de la pareja anterior no se acreditó. El plan permanece bloqueado para ejecutar; no se infiere incompatibilidad definitiva de la ausencia de evidencia. La instrucción actual exige mantener la versión publicada. Una ventana posterior requerirá autorización expresa. |
| Regresión, seguridad y aislamiento | **verificado** | **470 backend aprobadas y una omitida; 41 frontend y compilación aprobadas.** Incluye seis pruebas nuevas de controles operativos y la regresión previa. El ensayo Atlas volvió a comprobar acceso cruzado denegado antes/después de restaurar y evidencia cifrada reproducible. [Backend](evidence/operations-closure-backend-tests.txt), [frontend](evidence/operations-closure-frontend-tests.txt), [build](evidence/operations-closure-build.txt). |
| Aceptación representativa, carga sostenida y SLA comerciales | **pendiente** | Los umbrales del monitor son orientativos y no son SLA aprobados. La aceptación Preview anterior sigue vinculada a sus despliegues conservados; no se hicieron nuevas escrituras en la aplicación publicada ni se certificó capacidad empresarial con cinco solicitudes. [Aceptación previa](evidence/community-preview-live.json). |
| Activación productiva de la nueva versión con datos reales | **bloqueado** | Depende de cerrar las filas productivas, registrar sus evidencias y recibir autorización expresa posterior. La restricción operativa a datos sintéticos permanece; no se inventa una barrera técnica de detección automática de datos personales. |

El primer ensayo de restauración detectó un fixture que omitía correos únicos requeridos por el índice nativo. Su base temporal se retiró. El fixture se corrigió con direcciones reservadas para pruebas y el ensayo completo posterior pasó. Se conservaron ambos informes; el intento fallido no cuenta como una restauración aprobada.

## Accesos externos que detienen operaciones concretas

No se requiere entregar claves por el chat. Los permisos deben concederse a una identidad de servicio y al proyecto concreto, por el tiempo necesario. La cuenta de datos con `atlasAdmin` no sustituye los permisos de Atlas ni se usó para intentar crear usuarios con comandos que Atlas no admite.

| Operación detenida | Acceso necesario | Qué continúa sin ese acceso |
| --- | --- | --- |
| Inventariar clústeres y controles Atlas productivos | Conexión administrativa del proyecto; `Project Read Only` para comenzar. Lectura de proyecto/clústeres, usuarios de base, lista de acceso y políticas/snapshots del clúster. Verificar cada endpoint y registrar cualquier 403 sin ampliar privilegios automáticamente. | Auditoría de la conexión de pruebas, herramientas locales, fixture/restauración aislados y pruebas. |
| Crear usuario runtime y rol específico | `Project Database Access Admin`, acotado al proyecto. Runtime necesita las acciones de datos y transacciones realmente utilizadas sobre su base; inicialización de índices debe usar otra identidad. | Diseñar el rol y ensayar denegaciones con la cuenta provisionada cuando exista. No se inventa que el rol mínimo ya pasó. |
| Cambiar la lista de acceso de red | `Project Network Access Manager` y una estrategia acordada compatible con los egresos del alojamiento. | Revisar requisitos; no se añade acceso global por conveniencia. |
| Programar respaldos/retención | `Project Backup Manager` en el proyecto y un clúster que soporte la política elegida. El nivel y costo aún no se han verificado. | Copia/restauración sintéticas; documentación de requisitos. |
| Restaurar un snapshot administrado | `Project Backup Recovery Operator`; permiso de crear el destino aislado si aún no existe. Nunca sobrescribir el clúster de origen como ensayo. | Pruebas lógicas y verificación nativa sobre un destino sintético nuevo. |
| Crear o modificar clúster | `Project Cluster Creator` para crear o `Project Cluster Manager` para modificar, según la operación y el endpoint autorizado. Cualquier costo requiere aprobación específica. | Paquetes y procedimientos preparados; ninguna compra. |
| Verificar dominio y preparar remitente Resend | Cuenta titular, control DNS del dominio y lectura `GET /domains`. El control plane utiliza una identidad separada; el runtime solo una clave `sending_access` restringida a `domain_id`. | Validación de configuración/seguridad local. El preflight es de solo lectura y no crea claves ni dominios. |
| Probar entrega de correo/alertas | Remitente verificado, clave de envío, destinatario autorizado y recepción comprobada. Para las alertas del observador: webhook HTTPS autorizado y su secreto, sin URLs con credenciales incrustadas. | Outbox local y pruebas con transporte controlado, identificadas como tales. |
| Monitoreo independiente | Cuenta/host elegido, permiso para programar el observador, almacenamiento duradero y lectura acotada de logs. La lectura de logs Vercel ya pudo ejecutarse; un flujo o drenaje continuo no se configuró porque alteraría la configuración congelada. | Lecturas de salud y muestra de telemetría; agregados sin registros crudos. |
| Custodia y recuperación externa de claves | Almacén seguro elegido, identidad con lectura de la versión necesaria para recuperar, escritura separada para rotar y acceso de un custodio autorizado. | Ensayo cifrado local sin rotar runtime. |
| Ensayo activo de reversión | Permiso para mover los dos alias específicos y autorización posterior para la ventana. Ninguno se ejerce durante esta tarea. | Metadatos de las dos parejas, evaluación de compatibilidad y controles de seguridad. |

Referencias oficiales: [separación de usuarios Atlas y usuarios de base](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/), [roles Atlas](https://www.mongodb.com/docs/atlas/reference/user-roles/), [requisitos de acceso para herramientas Atlas](https://www.mongodb.com/docs/mcp-server/prerequisites/), [respaldos según clúster](https://www.mongodb.com/docs/atlas/backup/cloud-backup/overview/), [dominios Resend](https://resend.com/docs/dashboard/domains/introduction), [ámbitos de claves](https://resend.com/docs/api-reference/api-keys/create-api-key), [lectura de dominios](https://resend.com/docs/api-reference/domains/list-domains). Los permisos se volverán a validar contra el servicio real, no se infieren de un rol de aplicación Backstage.

## Observabilidad y alertas

La implementación nueva vive en herramientas transversales externas a las aplicaciones publicadas. Reutiliza las transiciones de incidentes existentes. Agrega `http.completed` a totales, errores 4xx/5xx, 429, latencias y mutaciones críticas; descarta identificadores, rutas, mensajes y cuerpos al publicar agregados. La evidencia de auditoría se trata por separado: HTTP 200 no certifica integridad ni ejecución de trabajos.

La disponibilidad, métricas y evidencia de auditoría tienen antigüedad acotada; ausencia o caducidad no se convierten en «saludable». El outbox conserva avisos pendientes y falla explícitamente al alcanzar presupuesto. El despachador exige origen autorizado, no sigue redirecciones, transmite solo campos permitidos, conserva ID estable y aplica backoff. La aceptación por un webhook no acredita recepción administrativa. Durante esta tarea **no se llamó al despachador con un canal real**.

`observe-release.js` realiza un único ciclo de solo lectura, mantiene journal privado con un solo escritor y exporta métricas OpenMetrics locales. La planificación y el almacenamiento externo están bloqueados. Los archivos de entrada de métricas/auditoría son una frontera de confianza: deben producirlos colectores autorizados; el lector no firma ni autentica por sí solo esos archivos. El colector de Vercel publica una muestra explícitamente incompleta y no la usa automáticamente como un flujo completo y vigente del monitor.

Se conservó una primera muestra HTTP fallida, seguida de lecturas satisfactorias. No se certifica caída global ni una causa raíz con esa muestra; tampoco se borró el fallo del expediente.

## Claves, recuperación y rotación

El ensayo leyó únicamente los anillos privados locales previamente configurados y utilizó cargas sintéticas. Separación local de material no prueba que todo despliegue remoto tenga las claves correctas. El inventario remoto confirma nombres/configuración, no exporta valores secretos.

Procedimiento preparado: inventariar versiones usadas por registros; añadir la clave nueva manteniendo todas las históricas requeridas; ensayar lectura en destino aislado; cambiar solo la versión activa en una ventana autorizada; comprobar escrituras nuevas y lectura histórica; conservar recuperación y evidencias. No se sobrescriben ciphertexts ni compromisos de versiones inmutables para «rotar». La retirada de una clave antigua exige resolver retención/eliminación de toda información que dependa de ella y una recuperación comprobada. La prueba mostró que retirarla prematuramente vuelve ilegible el histórico.

La recuperación productiva debe funcionar desde el almacén externo, con equipo independiente y custodio autorizado, aun sin el PC de desarrollo. Este criterio permanece bloqueado, aunque la recuperación local cifrada pase.

## Respaldo/restauración y reversión

El respaldo sintético captura todas las colecciones del namespace propio con un tiempo de snapshot común, BSON crudo, opciones e índices. Se verifica lectura cifrada y rechazo de alteraciones; el destino nuevo conserva tipos largos, decimales, binarios, datos cifrados y definiciones de índices. TTL queda suspendido durante la verificación para evitar borrado por caducidad. Después del cotejo se abre el documento con el servicio nativo, se reproduce su análisis y se verifica auditoría/aislamiento. El origen sintético conserva sus hashes. La limpieza exige nombres exactos y marcador de propiedad de esta ejecución.

Para producción faltan calendario/retención/custodia y prueba administrada según el clúster real. Definir RPO y RTO antes de medirlos. Una restauración de diecinueve documentos no certifica tiempos de recuperación empresariales.

La reversión preparada exige identificar pareja API/web actual y candidata, fuente y contratos compatibles, claves históricas disponibles y políticas MFA/sesión equivalentes. No se debe volver a una API que ignore MFA después de activarlo. Registrar jobs/leases y escrituras en curso antes de pausar trabajo; verificar en una ventana autorizada sin restaurar backups sobre el origen. Código, datos, variables, colas y claves no se revierten como una sola unidad. Bajo la instrucción vigente no se mueven alias siquiera para ensayar; por eso la ejecución real sigue pendiente.

## Reproducción sin despliegue

```text
node scripts/operations/resend-preflight.js
node scripts/operations/key-drill.js
node scripts/operations/restore-drill.js
node scripts/operations/rollback-plan.js
```

El restore anterior imprime un plan. Solo `--apply --test-environment` permite el ensayo en bases nuevas sintéticas y con la huella de conexión autorizada. `audit-live.js` y `observe-release.js` son lecturas remotas; `collect-telemetry.js --cli RUTA_CLI_EXISTENTE` solo lee una muestra acotada. Ninguna de estas herramientas despliega ni cambia variables de Vercel. Las claves/copies privadas quedan excluidas del empaquetado y la documentación no incluye sus valores.

[Comprobación final de cierre](evidence/operations-closure-postflight.json). La matriz no sustituye las comprobaciones productivas pendientes ni constituye autorización de publicación.
