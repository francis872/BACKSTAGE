# Preparación de publicación: estado comprobado

## Cierre operativo con versión congelada · 26 de octubre de 2026

Se mantuvieron intactos los cuatro proyectos Vercel y su acceso; no se habilitaron datos reales. La [matriz de cierre](../BACKSTAGE_OPERATIONS_CLOSURE.md) separa estados **verificado, pendiente y bloqueado** y documenta los permisos externos de cada operación. Auditoría de pruebas: credencial con `atlasAdmin`, sin mínimos privilegios. Se verificaron once comprobaciones locales de claves y cinco grupos de respaldo/restauración sintéticos: diez colecciones, diecinueve documentos y treinta y nueve índices, aplicación restaurada utilizable, aislamiento/auditoría válidos y ambas bases retiradas. Regresión: **470 backend aprobadas y una omitida, 41 frontend y build aprobados**. Observabilidad ampliada y muestra de telemetría real sin guardar registros crudos; no hay monitor independiente ni recepción administrativa certificados. Reversión validada como plan, sin mover alias. **NO_GO productivo vigente.** [Evidencia final](../evidence/operations-closure-postflight.json). Las variables productivas mencionadas en el apartado anterior pertenecen a la preparación histórica; en este cierre no se cambiaron.

## Operación real solicitada · 26 de octubre de 2026

El propietario confirmó que desea usuarios y datos reales; completará la conexión Atlas y actualmente no tiene proveedor de correo. Se prepararon claves de cifrado productivas y URL de recuperación exclusivamente para próximos despliegues; permanecen intactas las credenciales existentes. Los paquetes API/web conservan el código aceptado, sin secretos. La versión productiva anterior sigue respondiendo y exige sesión Backstage; la versión nueva continúa en Preview protegido. **No se activó la nueva versión para datos reales: faltan conexión administrativa Atlas, separación/privilegios, respaldos/restauración, correo, monitoreo y aceptación operativa.** [Acciones y dependencias verificadas](../BACKSTAGE_REAL_USER_ACTIVATION.md), [evidencia](../evidence/user-operations-preparation.json). NO_GO productivo vigente; esta actualización sustituye la afirmación histórica de que no hubo cambios de configuración: se añadieron tres variables para futuros despliegues, sin cambiar aplicaciones ni alias.

## Publicación en Vercel Preview · 26 de octubre de 2026

**La versión que incluye Community ya está desplegada en [Preview protegido](https://backstage-staging-web.vercel.app)**, en los proyectos dedicados `backstage-staging-web` y `backstage-staging-api`. Pasaron nueve comprobaciones reales de HTTP/navegador/Atlas: sesión, documentos cifrados, revisión/reproducción, doble aprobación, revocación, eliminación y auditoría. El navegador observó 32 respuestas API y cero errores de ejecución; los datos sintéticos se retiraron. Se configuró cifrado persistente exclusivo de Preview y se conservaron las credenciales existentes. Los alias y destinos productivos capturados antes del despliegue permanecen iguales. **No se promovió a producción; NO_GO productivo sigue vigente.** [Informe](../BACKSTAGE_COMMUNITY_PREVIEW.md), [aceptación](../evidence/community-preview-live.json), [comprobación final](../evidence/community-preview-postflight.json). Los apartados siguientes describen las aceptaciones anteriores a esta publicación.

## Community contextual · 26 de octubre de 2026

Se completó el incremento documental de Community desde los objetos del Explorador: biblioteca privada, carga de texto, clasificación y frases candidatas revisables, historial, reproducción y eliminación. Comparte el registro documental original, identidad, cifrado y Hebra. El intercambio opcional exige autorización del administrador de origen y aceptación del destino; una nueva versión o eliminación retira el acceso a la fuente anterior. No se añadió navegación independiente.

Aceptación final: **464 backend aprobadas y una omitida; 41 frontend y build; ocho comprobaciones Community Atlas, ocho normativas, ocho económicas y veintitrés de navegador aprobadas**. Cero errores de ejecución, auditorías verificadas y base sintética exclusiva eliminada. [Informe y límites](../BACKSTAGE_COMMUNITY.md), [aceptación](../evidence/community-live.json), [comprobación final](../evidence/community-postflight.json). Las frases extraídas no certifican obligaciones legales. PDF/OCR, búsqueda semántica, Colab y cierre operativo siguen pendientes; se conservan los pendientes gráficos WebGL y adaptadores sectoriales. **Sin despliegue Vercel ni modificación de producción; NO_GO vigente.** Las secciones siguientes conservan su fecha y alcance históricos.

## Inteligencia normativa Colombia · 26 de octubre de 2026

Se añadió el diccionario de fuentes oficiales y catorce reglas formales acotadas, con separación entre fuente, interpretación revisada, dato, evaluación y evidencia. El panel se abre desde la copropiedad del Explorador. Consume los resultados económicos reproducidos, conserva documentos y decisiones cifrados/versionados en Atlas y reutiliza Identity, Security y Hebra. Requiere designación explícita de revisores por objeto y vincula la revisión financiera con el escenario y sus huellas. Los documentos aportados no se convierten automáticamente en ley.

Línea base: 440 backend aprobadas/una omitida, 38 frontend. Aceptación final: **455 backend aprobadas/una omitida, 40 frontend y build aprobados; ocho comprobaciones normativas Atlas, ocho de regresión económica y veintitrés de navegador aprobadas**. Incluye alcance documental por escenario, reproducción, versiones, discrepancias, eliminación, permisos vigentes y MFA. Auditoría válida y base sintética exclusiva eliminada. El incremento queda aceptado técnicamente con los límites expresos de su informe; no acredita cumplimiento jurídico integral.

Los estados se refieren a condiciones concretas, sin concepto jurídico definitivo. Las excepciones no resueltas, reuniones especiales, calendarios hábiles y fuentes inciertas requieren revisión. Se conservan los pendientes económicos WebGL y adaptadores sectoriales; Community y Colab no se comenzaron. **Sin despliegue Vercel ni cambios productivos; NO_GO vigente.** [Fuentes, arquitectura y límites](../BACKSTAGE_NORMATIVE_INTELLIGENCE.md), [aceptación](../evidence/normative-intelligence-live.json), [postflight](../evidence/normative-postflight.json). Las secciones siguientes son antecedentes fechados.

## Inteligencia económica contextual · 26 de octubre de 2026

Se implementó el núcleo económico transversal y su adaptador PH dentro del Explorador: caja, egresos, cartera/antigüedad/concentración, proyecciones con backtest temporal y bandas de sensibilidad, escenarios versionados, optimización presupuestaria y propuestas de cuotas con conservación exacta. Reutiliza aritmética, identidad, seguridad, MongoDB Atlas y Hebra existentes. Incluye aprobación interna verificable, reproducción de capturas y capa categórica de saldos con exclusiones explícitas. No añade navegación independiente.

Línea base: 424 backend aprobadas y una omitida, 36 frontend. Resultado: **440 backend aprobadas y una omitida; 38 frontend y build aprobados; ocho comprobaciones económicas Atlas y veinte de navegador aprobadas**. Auditoría válida y base sintética exclusiva eliminada. El optimizador coincide con 208 enumeraciones exhaustivas y 48 casos independientes HiGHS. Mediana local del núcleo: 251 ms con 500 entidades, 5.000 hechos y 36 meses; no certifica capacidad de Atlas/HTTP ni concurrencia productiva.

Límites: libro administrativo sin conciliación bancaria; proyección condicional con resto del mes actual no modelado, cuotas propuestas sin cobros ni certificación legal, optimizador lineal de un recurso con cotas independientes. WebGL no se valida en este recorrido. El núcleo es neutral; los adaptadores sectoriales distintos de PH todavía no están implementados. Normativa Colombia, Community, Colab y cierre operativo siguen pendientes. **Sin despliegue Vercel ni cambios productivos; NO_GO vigente.** [Informe, fórmulas y decisiones](../BACKSTAGE_ECONOMIC_INTELLIGENCE.md), [aceptación real](../evidence/economic-intelligence-live.json), [postflight](../evidence/economic-postflight.json). Las secciones siguientes conservan su estado histórico fechado.

## Incremento de inteligencia espacial contextual · 26 de octubre de 2026

Se conectó el BSIE existente a los datos PH seleccionados en el Explorador: Queen/Rook, KNN, banda/inverso de distancia, Moran global/local, LISA y atípicos espaciales, Gi*, KDE ponderada y periodos temporales. Conteos PQRS y saldos manuales provienen de registros autorizados; se preservan monedas, geometrías propias, exclusiones, fuentes, revisiones y parámetros. Las instantáneas/resultados se cifran con Hebra y se auditan. Se puede reproducir el conjunto congelado o capturar uno nuevo sin sobrescribir historia.

Línea base comprobada antes de cambios: 416 backend aprobadas y una omitida, 36 frontend y 27 científicas. Regresión nueva: **424 backend aprobadas y una omitida, 36 frontend y build aprobados**; el motor científico conserva sus 27 pruebas aprobadas. La aceptación API/Python/Atlas pasó ocho comprobaciones matemáticas y de seguridad con datos sintéticos; Moran coincide con una fórmula matricial independiente. **La aceptación final pasó ocho comprobaciones espaciales y dieciocho de navegador, sin errores de ejecución; auditoría válida y bases exclusivas eliminadas.** La revisión visual también detectó y corrigió la codificación UTF-8 del adaptador Python; su repetición pasó con acentos intactos.

Límites: datos registrados sin cobertura completa verificada; temporal descriptivo; sin detector universal de fraude ni integración sanitaria nueva; resultados en panel/exportación, todavía sin capa temática dibujada. Economía avanzada, normativa Colombia, Community y Colab siguen pendientes. **Sin despliegue nuevo en Vercel ni cambios productivos; no se promoverá sin autorización expresa.** [Informe y decisiones](../BACKSTAGE_SPATIAL_CONTEXT_INCREMENT.md), [evidencia API](../evidence/spatial-context-live.json), [plan vigente](../BACKSTAGE_UNIFIED_INCREMENTAL_PLAN.md). Los expedientes siguientes conservan sus fechas y alcances anteriores.

## Operación PH y confianza nativa · 26 de octubre de 2026

Se implementaron operaciones desde el objeto PH seleccionado: PQRS, reservas exclusivas, portería, tareas, agenda/acta, cartera/pagos manuales y presupuesto. Se añadieron cifrado autenticado por versión, eliminación de contenidos cerrados, historial contextual y MFA sobre la identidad existente. **Backstage Identity, Security y Hebra son nativos; SATYA/Vault/Sincronía no son dependencias ni bloqueos.** Colombia es la primera jurisdicción normativa.

Aceptación: 417 pruebas backend (416 aprobadas, una omitida), 36 frontend y build aprobados; siete comprobaciones operativas de API real y trece de navegador sobre Atlas de pruebas, auditoría válida y base temporal eliminada. Incluye segundo factor y rechazo de reutilización de códigos. No certifica WebGL, pasarela bancaria, quórum legal, capacidad empresarial ni cumplimiento normativo.

**Sin despliegue nuevo en Vercel ni cambios en producción; NO_GO vigente.** Las claves de protección aún requieren custodia/configuración por entorno. Matemática contextual, proyecciones/optimización, normativa, Community y Colab siguen como fases pendientes, ya autorizadas y sin esperar contratos externos. [Informe completo](../BACKSTAGE_UNIFIED_OPERATIONS_REPORT.md), [arquitectura nativa](../BACKSTAGE_NATIVE_TRUST_ARCHITECTURE.md), [plan vigente](../BACKSTAGE_UNIFIED_INCREMENTAL_PLAN.md), [evidencia](../evidence/unified-operations-live.json). Las secciones siguientes son antecedentes fechados; sus condiciones de esperar complemento ya fueron sustituidas.

## Visión unificada y base de Propiedad Horizontal · 25 de octubre de 2026

Auditoría previa y plan incremental completados. PH está implementada como **capa del Explorador**, con activos canónicos en Atlas, jerarquía, geometría opcional o referencia al ancestro, coeficientes declarados exactos, permisos, revisión, idempotencia y archivo auditado. No añade navegación principal, Docker ni paquetes. La visión completa conserva Community, Colab, Hebra, motores e integraciones; su implementación espera la especificación complementaria solicitada por el propietario.

Regresión nueva: 404 backend, 403 aprobadas y una omitida; 35 frontend aprobadas; build aprobado. La integración y el navegador pasaron contra una base Atlas exclusiva del ensayo, retirada después. Las llamadas PH fueron reales mediante API local; WebGL y proveedores cartográficos no se validaron en ese recorrido. **Este incremento todavía no está desplegado en staging Vercel ni en producción.**

[Auditoría](../BACKSTAGE_UNIFIED_AUDIT.md), [plan de fases](../BACKSTAGE_UNIFIED_INCREMENTAL_PLAN.md), [funciones, reglas y límites PH](../BACKSTAGE_HORIZONTAL_PROPERTY.md), [evidencia](../evidence/horizontal-property-live.json). El NO_GO productivo continúa. Las secciones siguientes conservan las evidencias y pendientes de incrementos anteriores.

## Ensayo autónomo desplegado · 25 de octubre de 2026

**Estado actual: NO_GO productivo; ejecución autónoma en staging comprobada.** Vercel construyó el contenedor y aloja dos Daemons activos en un proyecto independiente protegido, con base Atlas nueva del ensayo. Se ejecutaron automáticamente casos JavaScript/Python conocidos, recuperación tras SIGKILL, timeout real de función, carga acotada, respaldo/restauración y reversión/restablecimiento. Producción empresarial conserva sus despliegues originales. Regresión final: 396 pruebas backend, 395 aprobadas, una omitida, cero fallos.

Se programó un caso para el 25 de octubre a las **7:53:21 p. m., Bogotá**; ese intervalo ya pasó. Falta la confirmación física de PC apagado durante ese intervalo. También faltan monitor independiente y alerta recibida —el propietario configurará servicio y destino—, acceso administrativo Atlas —el propietario conectará la cuenta—, privilegios mínimos, políticas productivas de respaldo y aceptación de capacidad/funcionalidad. La base nueva comparte clúster y credencial amplia; no certifica separación productiva.

[Decisión actual y ocho expedientes](../BACKSTAGE_PRODUCTION_GO_NO_GO.md), [evidencia autónoma](../evidence/automation-staging-execution.json), [postflight](../evidence/automation-postflight.json). Las secciones siguientes son antecedentes: sus referencias a contenedor no construido o worker todavía sin alojar describen etapas anteriores. El alojamiento actual cubre el harness finito de aceptación, no todos los trabajos empresariales. Correo/GPS siguen pendientes y no bloquean esta prueba.

## Aclaración de alojamiento · 25 de octubre de 2026

La plataforma ya está alojada en **Vercel**. El propietario no tiene servidor adicional ni dominio propio; se conservan las direcciones `.vercel.app`. La consulta de la cuenta confirmó **Hobby**, cuyo Cron permite una ejecución diaria por tarea, insuficiente para el monitoreo cada minuto previsto. La próxima evaluación debe partir de las opciones de ejecución durable de Vercel y comprobar su compatibilidad con este backend y plan. El paquete Docker es una alternativa preparada, no un hosting adicional obligatorio ni un servicio ya activo. [Contexto comprobado](../evidence/vercel-operating-context.json), [alcance y fuentes](../BACKSTAGE_PRODUCTION_OPERATIONS.md).

## Cierre operativo solicitado · 25 de octubre de 2026

El nuevo [expediente de operación productiva](../BACKSTAGE_PRODUCTION_OPERATIONS.md) incorpora el paquete de worker/monitor alojados, latidos, incidentes persistentes, controles transaccionales de vigencia y el conector de metadatos Sentinel/Landsat. Las comprobaciones nuevas usan API/proxy locales y Atlas de pruebas; no deben confundirse con el staging aceptado de la sección siguiente. El paquete no se ha construido en Docker ni alojado como servicio continuo. La publicación productiva permanece pendiente de cuentas/hosting, Atlas separado, permisos mínimos, backups programados/restauración, capacidad, aceptación y reversión. Resend/Traccar conservan sus adaptadores y esperan configuración autorizada.

Regresión actual: 390 pruebas backend (389 aprobadas, una omitida, cero fallos), 33 frontend aprobadas y dieciséis grupos reales aprobados. El postflight independiente comprobó limpieza de las dieciséis colecciones de ensayo, coincidencia del paquete y producción original intacta. [Resumen](../evidence/production-ops-summary.json).

## Backend de fase 2 · 25 de octubre de 2026

Revisión del prompt recibido nuevamente: es idéntico al documento de fase 2 anterior. La [matriz de sus 20 secciones](../BACKSTAGE_PHASE2_REQUIREMENTS.md) distingue el incremento aceptado de los pendientes operativos; esta revisión documental no implica otro despliegue ni nuevas pruebas remotas.

Incremento aceptado en staging protegido: BCO asíncrono, contratos versionados, RBAC/ABAC por recurso, leases y recuperación, outbox, percepción de datos aportados, evaluación defensiva con aprobación humana y CRUD seguro de fuentes. MongoDB Atlas se conserva; los 109 archivos de frontend/src y 67 científicos/compartidos mantienen sus hashes.

Regresión: 379 pruebas backend (378 aprobadas y una omitida), 33 frontend y 38 científicas aprobadas. Catorce grupos reales BCO y once del Explorador/Mapbox pasaron sobre Atlas de pruebas. Se corrigieron empaquetado científico, competencia de renovación/cierre y una omisión inicial de registros BCO en la limpieza; sus intentos y reparación se conservan. El postflight desde una conexión nueva confirma protección, código y limpieza, con producción original intacta.

El worker tiene paquete preparado y fue probado como proceso separado; **falta alojarlo de forma continua**. Permanecen los pendientes productivos y proveedores no configurados. [Aceptación y límites actuales](../BACKSTAGE_PHASE2_TEST_REPORT.md), [arquitectura](../BACKSTAGE_PHASE2_ARCHITECTURE.md), [permisos](../BACKSTAGE_PHASE2_PERMISSIONS.md), [seguridad/reversión](../BACKSTAGE_PHASE2_SECURITY.md).

## Incremento de acceso · 25 de octubre de 2026

El nuevo flujo conserva MongoDB Atlas, usuarios, roles y organizaciones. Incluye cambio de contraseña, enlaces con propósito/vencimiento/consumo único y cierre de sesiones comprobado en HTTP/WebSocket. El propietario confirmó que no tiene correo configurado: no hay entrega real habilitada. [Expediente actual y límite de reversión de seguridad](../BACKSTAGE_ACCOUNT_SECURITY.md). Esta fase no sustituye los pendientes productivos ni certifica los módulos futuros del prompt maestro. Los resultados de las secciones siguientes son históricos.

**Incremento Origin y Mapbox, 24 de octubre, 22:26 Bogotá:** [staging protegido](https://backstage-staging-web.vercel.app) actualizado tras once grupos de integración real con Atlas y Mapbox y 21 comprobaciones de interfaz. Se integraron el explorador persistente, cuatro destinos principales, Feed, Cuenta/Organización y evidencia de rutas vinculada al proyecto. [Estado del incremento](../BACKSTAGE_IMPLEMENTATION_STATUS.md), [pruebas y límites](../BACKSTAGE_TEST_REPORT.md). Mapbox quedó activado en el backend local y de staging: sugerencias mientras se escribe, atribución y almacenamiento permanente comprobados; el token permanece fuera del frontend. La publicación pública que se describe a continuación conserva su versión anterior; no se promovió Origin a producción.

Actualizado el 24 de octubre de 2026, Bogotá. BACKSTAGE conserva identidad, motores y MongoDB Atlas. La pareja final de Preview pasó integración, carga y reversión; los aliases estables de staging ya apuntan a ella. Se incorporó la [mejora de UI y UX](USABILITY_REPORT.md). La publicación autorizada se completó el 24 de octubre a las 13:33 de Bogotá en los proyectos originales. [Abrir BACKSTAGE](https://backstage-web-seven.vercel.app). [Publicación, aceptación y reversión](PRODUCTION_RELEASE.md). La conexión anterior se conservó y coincide con el Atlas de pruebas: todavía no hay una base productiva separada.

## Resultado y pendientes

| Frente | Comprobado | Falta para cerrarlo |
| --- | --- | --- |
| Reglas comerciales | Configuración por organización, versión, auditoría, SLA conservados; revisión de vigencia y excepciones administrativas con motivo, fuente exacta, proyecto, política y vencimiento. Pruebas locales y recorrido real del administrador aprobados. | Ampliar la aplicación automática de vigencia a los puntos de aprobación/cierre de todos los módulos que la requieran. |
| Respaldo | Todas las bases de usuario accesibles: una base, 75 colecciones, 149 documentos y 238 índices. Copia cifrada, restauración aislada verificada y destino temporal retirado. | Retención, programación, custodia fuera del equipo y recuperación administrada/PITR según el servicio contratado. |
| Rendimiento y seguridad | Parches, contador de acceso compartido en Atlas, salud HTTP 503 ante fallo, registros sin consultas/credenciales. 327 pruebas backend y 26 frontend; carga acotada y ocho grupos de seguridad/concurrencia/recuperación aprobados. | Dimensionar producción; el ensayo no certifica su capacidad. |
| Monitoreo | Tarea local cada cinco minutos; comprobaciones reales de ambos aliases protegidos y estado persistente y panel del administrador aprobados en integración real. | Un ejecutor continuo independiente de este equipo/sesión. |
| Reversión y aceptación | Aceptación técnica, aliases y reversión/restablecimiento aprobados; herramienta limitada a IDs de staging. | Aceptación funcional del propietario y prueba de comprensión con una persona nueva. |

## Reglas operativas

El usuario autorizó continuar con «hazlo» e indicó al administrador como destinatario. La base `backstage-commercial-rules-1` conserva SLA de 48 horas para probabilidad, 24 para revisión de riesgos, 24 para revisión de recomendación y 72 para otras etapas pendientes. El reloj conserva horas transcurridas desde `updated_at` del proyecto; no se definió un calendario contractual distinto por prioridad.

La vigencia inicial configurable es 720 horas para fuentes aportadas/importadas y 24 para API externa. Históricos y simulaciones mantienen su clasificación. Se distinguen ausencia de fecha, fecha futura, vencimiento, histórico y simulación. La revisión usa metadatos aportados; no certifica la fuente ni cambia la evidencia científica.

El administrador vigente configura plazos y aprueba excepciones de revisión de vigencia. El máximo inicial es 24 horas, configurable hasta siete días. Cada excepción conserva referencia/hash de metadatos, proyecto, versión/revisión/hash de reglas, actor, motivo y vencimiento. Cambiar metadatos o política impide aplicar la excepción anterior. Las excepciones no dispensan autenticación, aislamiento, capacidad o integridad del motor. No se creó rol supervisor ni proveedor GPS.

La configuración usa la organización existente; revisión y excepciones usan el proyecto existente y auditoría canónica transaccional. No se renombraron colecciones ni reemplazaron IDs; esquema 2 conservado. El panel está preparado en Organización → Miembros y roles → Reglas comerciales y alertas del administrador. Su validación remota pasó en el ensayo integrado.

## Respaldo y restauración

Respaldo actualizado `atlas-full-20261024161620-7ada2a41e368`, 24 de octubre, 11:16–11:18 Bogotá. El respaldo previo de 106 documentos se conserva en su directorio privado. El inventario incluyó todas las colecciones de la única base de usuario accesible. Las lecturas compartieron un instante snapshot; las opciones e índices no cambiaron durante la copia.

La copia conserva BSON original y usa AES-256-GCM. SHA-256 cifrado: `968c95dc14ee9ba408ae88e1400e30849aee6c0c89d74da6f5a7df6a7307c011`. Se releyó y descifró el archivo guardado, comprobando rechazo de alteraciones. La restauración utilizó ese archivo en una base nueva: coincidieron todos los hashes BSON, recuentos, opciones e índices. Se suspendió la expiración de cinco índices TTL durante la comprobación. Después se eliminó únicamente el destino temporal; no se restauró sobre el origen.

Archivo privado: `.vercel/atlas-full-20261024161620-7ada2a41e368/data.bson.aes256gcm`. Clave separada en `.vercel/atlas-backup-keys/`; no incluirla en paquetes, repositorio o documentación pública. Falta custodia autorizada fuera del equipo. La copia no incluye usuarios administrados de Atlas, configuración del clúster o bases internas `admin`, `config`, `local`; no acredita snapshot administrado/PITR. El script falla sin certificar una copia parcial ante tipos no soportados o más de 64 MiB de BSON.

El primer intento fue rechazado por el límite de nombres de Atlas de 38 bytes antes de crear la base. Se conservó su evidencia y se corrigió el nombre. [Resultado final](evidence/readiness-atlas-backup.json), [intento inicial](evidence/readiness-atlas-backup-attempt-1.json).

## Pruebas y seguridad

- Backend: 328 pruebas, 327 aprobadas, una integración externa omitida, cero fallos. [Registro](evidence/readiness-backend-tests.txt).
- Frontend: 26 aprobadas; build de 142 módulos. Persisten advertencias anteriores de Vite/tamaño de chunks. [Pruebas](evidence/readiness-frontend-test.txt), [build](evidence/usability-frontend-build.txt).
- Auditorías de producción: cero vulnerabilidades reportadas tras actualizar `body-parser` y aplicar el override compatible de `zod` fijado por una dependencia indirecta. [Backend](evidence/readiness-backend-dependency-audit.json), [frontend](evidence/readiness-frontend-dependency-audit.json). No equivale a auditoría integral de seguridad.
- Los archivos de ejecución comprobados coinciden con los paquetes Preview finales; los motores y contratos científicos conservan sus hashes. Los cambios intencionales de interfaz tienen revisión y capturas independientes. `analysis.service.js` cambia expresamente la lectura de SLA del tablero. [Revisión](evidence/readiness-source-review.json).
- Dos pruebas locales heredaron inicialmente la conexión de ensayo y dejaron seis trazas globales de solicitudes, sin organización asociada. Se detuvo la ejecución y se conservaron trazas/contadores. `npm test --prefix backend` ahora deshabilita Atlas mediante un ejecutor aislado; la ejecución completa aprobada lo utilizó.

El presupuesto de acceso distribuido usa contadores atómicos por cuenta normalizada o usuario autenticado al aceptar invitaciones; guarda claves HMAC en `soi_provider_locks`. Devuelve 429 con `Retry-After` y falla con 503 si no puede comprobar el presupuesto. El proxy conserva esas cabeceras. No cubre abuso global con múltiples cuentas. Límites de borde y privilegios mínimos de credenciales siguen siendo comprobaciones adicionales de producción: la conexión de ensayo dispone de rol administrativo Atlas.

## Monitoreo del administrador

Tarea `BACKSTAGE-Staging-Monitor-F8B21D9C`, ejecución oculta cada cinco minutos con el usuario conectado. Comprueba salud MongoDB, correlación de solicitudes y denegación sin protección en ambos aliases de staging. Dos fallos consecutivos abren incidente; dos recuperaciones lo resuelven. Latencias superiores a dos segundos quedan señaladas. Historial local limitado a 288 ciclos; el estado técnico se publica en Atlas para `/operations/monitor`, restringido al administrador vigente.

Si Atlas falla, el diario local conserva estado y reintenta publicarlo en el siguiente ciclo. El panel marca como antiguo un monitor con más de diez minutos sin actualizar. El canal es interno, sin correos/mensajes externos. Apagado, suspensión o cierre de sesión interrumpen la cobertura. El supervisor previo conserva métricas por proceso y no se declara un scheduler durable del hosting.

[Tarea](evidence/readiness-monitor-schedule.json), [última lectura local](evidence/readiness-monitor-latest.json), [recuperación entre procesos](evidence/readiness-monitor-recovery.json). Esta última prueba usa respuestas simuladas y archivos reales entre procesos nuevos; no provocó una caída de Atlas ni escribió estado simulado en la aplicación.

## Validación previa en Preview

API: `dpl_3BG4YRnq1uhMjBuYBKMMK1EQh8Yq`. Web: `dpl_96mKM6xEKxmouQc5KYjRnZc1UqJe`. Ambos READY, Preview protegido, en proyectos aislados. La web usa la API inmutable correspondiente. [Paquetes](evidence/readiness-packaging.json), [despliegues](evidence/readiness-deployment.json). Los aliases estables apuntan a esta pareja. El postflight confirmó ambos destinos protegidos y saludables, limpieza de 16 ensayos integrados y dos de carga. Los proyectos, dominios y destinos originales de producción se volvieron a comprobar sin cambios.

El intento inicial de aceptación fue impedido por la revisión automática por créditos. Después se pudieron completar las comprobaciones autorizadas. Un primer despliegue web recibió 403 de Vercel; se renovó y comprobó la sesión existente antes de reintentar. Esos incidentes históricos ya no bloquean la validación técnica.

Resultado final:

- Integración `atlas-core-20261024160943-a16ba1dd535d`: veinte grupos aprobados, 186 respuestas de API, cero errores del navegador, auditoría completa de 69 eventos. [Evidencia](evidence/readiness-live.json).
- Carga: 102 consultas exitosas con concurrencias 1/5/10; p95 de 538/914/458 ms en salud y 632 ms en lecturas autenticadas. Ocho escrituras concurrentes con IDs únicos, conflicto de política detectado (200/409), contador atómico entre clientes, reversión transaccional, límites y revocación aprobados. [Evidencia](evidence/readiness-load-security.json).
- El primer ensayo de carga detectó un 502 ante JSON inválido. Se corrigió el proxy y se repitió la prueba con éxito; no se relajó la expectativa 400. [Intento conservado](evidence/readiness-load-security-attempt-1.json).
- Reversión: pareja anterior comprobada y pareja nueva restablecida. El primer intento falló una comprobación inmediata; se verificó que el destino nuevo estaba saludable y se añadió espera acotada de propagación. El segundo ensayo pasó. No se demuestra una causa única para el primer fallo. [Resultado](evidence/readiness-rollback.json), [primer intento](evidence/readiness-rollback-attempt-1.json).
- Limpieza/aliases desde proceso nuevo: aprobados. Solo se retiraron datos de ensayo propios y sus contadores técnicos; contadores compartidos y trazas globales de seguridad se conservan. [Postflight](evidence/readiness-postflight.json).

Pendientes operativos después de publicar el código:

1. Prueba humana de comprensión y aceptación funcional del propietario, usando [los recorridos propuestos](USABILITY_REPORT.md).
2. Cobertura continua de monitoreo y alertas independiente del equipo/sesión Windows.
3. Respaldos programados, retención, custodia de la clave/copia fuera del equipo y recuperación administrada según el servicio disponible.
4. Privilegios mínimos de credenciales, protección de borde, dimensionamiento de producción y ampliar los controles de vigencia donde corresponda.
5. Separar Atlas de producción del entorno de pruebas y definir su operación. La autorización de publicación ya se recibió y la publicación está comprobada; no acredita separación de bases ni cobertura productiva continua.
