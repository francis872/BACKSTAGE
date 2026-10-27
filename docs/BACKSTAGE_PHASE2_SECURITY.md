# BACKSTAGE · seguridad y compatibilidad de fase 2

25 de octubre de 2026, Bogotá. [Arquitectura](BACKSTAGE_PHASE2_ARCHITECTURE.md), [matriz de permisos](BACKSTAGE_PHASE2_PERMISSIONS.md) y [diagnóstico previo](BACKSTAGE_PHASE2_AUDIT.md).

## Controles implementados

Autenticación y revocación de sesiones existentes se conservan. Las nuevas rutas consultan organización y membresía actuales; los servicios vuelven a comprobarlas dentro de las mutaciones. Los atributos de autor, estado, revisión, sensibilidad y vigencia completan RBAC. Los filtros de persistencia incluyen organización y discriminador, y las referencias de proyecto/fuente se verifican en esa organización.

Los contratos rechazan campos de control ajenos, números no finitos, claves de prototipo y operadores MongoDB. Tamaños, tareas, tiempo y concurrencia están acotados. No se ejecutan expresiones, SQL, shells o módulos enviados por usuarios. La selección de algoritmo pertenece a un catálogo revisado; versión y hash de fuentes evitan ejecutar silenciosamente otro código sobre un trabajo ya preparado.

Las fuentes de integración no devuelven su configuración privada. Se rechazan nombres comunes de credenciales y URL con credenciales/consulta/fragmento; esto no constituye un detector universal de secretos. Las credenciales reales se administran en el servidor. La API no descarga arbitrariamente una URL de configuración. Los cuerpos de `/computational` e `/integrations` se omiten de la auditoría HTTP; la auditoría canónica conserva hashes y actor, con transacción compartida.

El runtime JavaScript no hereda claves de Atlas, JWT, Mapbox o correo. Sus salidas estándar no vuelcan parámetros. Se preserva el runtime Python existente; no se afirma que un worker thread sea un entorno para código hostil. El principio de seguridad es que el cliente no elige código ejecutable.

Los eventos del outbox no aplican automáticamente acciones críticas. El dispatcher publica notificaciones con ID estable y requiere consumidores idempotentes. Un fallo de publicación no revierte una mutación empresarial ya confirmada; el evento queda pendiente/reintentable y finalmente FAILED si agota su presupuesto.

## Compatibilidad y cambios intencionales

No cambia el motor de datos ni los IDs. Los campos y los tres índices nuevos son aditivos. La API BCO tiene contrato versionado propio, sin reemplazar rutas heredadas. La única modificación del proxy web es transmitir la clave idempotente y permitirla en CORS; la configuración del bypass sigue siendo exclusiva del servidor.

Integraciones conserva sus rutas anteriores. Se añaden lectura y edición/archivo de fuentes. El POST por nombre conserva su comportamiento de registro/actualización; PATCH incorpora revisión explícita. El DTO deja de aceptar operadores o credenciales en configuración y el resultado no expone esa configuración. Los helpers internos de `ingestion.js` delegan al servicio validado y requieren el ID del actor; los callers internos deben proporcionarlo. No se encontró una vista existente que dependiera de devolver secretos de configuración. El cambio de referencia entre organizaciones se rechaza, aunque antes pudiera llegar a almacenarse.

Una fuente se archiva/desactiva sin borrar sus eventos. Ingresar un evento realiza una escritura técnica en la fuente dentro de la misma transacción: serializa la ingestión con una desactivación concurrente. Un evento procesado no se vuelve a procesar y su ID externo no admite otro contenido.

## Reversión

La copia previa del código y su manifiesto están referenciados en `.vercel/phase2-before-latest.json`; la pareja anterior de staging está en `.vercel/phase2-before-staging-private.json`. Son archivos privados y no deben publicarse. Los backups BSON del ensayo contienen únicamente registros propios de prueba; no sustituyen un respaldo completo de Atlas ni una restauración productiva.

Volver al backend anterior sin conservar los filtros de `kind:bco.workflow` podría revelar posiciones BCO mediante las rutas analíticas antiguas. Una reversión compatible debe mantener esos filtros, los comprobadores de sesión de la fase anterior y la omisión de leases del outbox. No se reducen versiones de sesión, se restauran contraseñas ni se eliminan evidencias operativas para deshacer una interfaz. La migración de índices no requiere borrado ni reversión destructiva. No se certifica aquí una nueva imagen de rollback productivo: debe prepararse y probarse conservando estas barreras antes de producción.

## Límites operativos que permanecen

- Worker continuo, supervisor de proceso y transporte entre procesos todavía necesitan operación alojada. El bus local no acredita entrega WebSocket entre hosts.
- Atlas de producción separado, backup administrado/PITR, custodia fuera del equipo y restauración productiva siguen pendientes del expediente de operación.
- Correo de recuperación, proveedor GPS y conectores satelitales no se activan en esta fase.
- Las propuestas defensivas no modifican políticas sensibles. Las métricas offline no prueban detección o latencia futura sobre tráfico real.
- Límites de borde, pruebas de capacidad mayores, privilegios mínimos de las credenciales Atlas y evaluación de seguridad integral siguen siendo tareas productivas. Un audit npm sin hallazgos no las sustituye.
