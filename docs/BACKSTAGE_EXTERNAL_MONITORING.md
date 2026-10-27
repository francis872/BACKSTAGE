# BACKSTAGE · monitoreo independiente

25 de octubre de 2026, Bogotá. Estado: adaptador implementado y probado localmente; servicio externo y recepción de alertas pendientes.

| Clasificación | Alcance |
| --- | --- |
| Implementado | Monitor portátil `scripts/external-automation-monitor.js`, estado persistente, incidentes y outbox de notificaciones. |
| Probado | Detección de ejecuciones faltantes, demoradas, bloqueadas y fallos reiterados; persistencia entre invocaciones nuevas y ausencia de envíos sin canal configurado. Pruebas con respuestas simuladas. |
| Pendiente | Hospedar y programar un único monitor fuera de Vercel y del PC; almacenamiento duradero y canal del administrador. |
| Bloqueado | Alerta real de fallo y recepción comprobada: el propietario indicó que configurará el servicio e informará el destino. No se ha autorizado un destino concreto. |

La salud HTTP y el cumplimiento del calendario se evalúan por separado. Un 200 no compensa un trabajo esperado ausente. El monitor abre incidentes después de dos muestras fallidas y los resuelve después de dos satisfactorias. Los umbrales actuales son dos minutos de demora y tres minutos de RUNNING; corresponden al ensayo finito, no a SLA comerciales aprobados. El timeout esperado del caso workflow-timeout no dispara una falsa alarma.

Configuración en el futuro host, mediante su almacén de secretos:

| Variable | Uso |
| --- | --- |
| EXTERNAL_MONITOR_STATUS_URL | URL HTTPS protegida terminada en /api/status |
| EXTERNAL_MONITOR_STATUS_TOKEN | Secreto exclusivo del diagnóstico |
| EXTERNAL_MONITOR_VERCEL_BYPASS | Acceso a Deployment Protection, cuando corresponda |
| EXTERNAL_MONITOR_STATE_DIRECTORY | Volumen persistente fuera de Vercel y del PC |
| EXTERNAL_MONITOR_WEBHOOK_URL | Canal HTTPS autorizado por el administrador |
| EXTERNAL_MONITOR_WEBHOOK_TOKEN | Autenticación del canal |

El proceso se ejecuta con `node scripts/external-automation-monitor.js`, por ejemplo cada minuto en el servicio externo elegido. Deben acompañarlo `backend/domain/monitorState.js` y almacenamiento persistente. No iniciar múltiples escritores sobre el mismo archivo de estado. Las credenciales no se guardan en ese estado ni se registran en stdout.

Cada alerta usa ID estable y reintentos con backoff, hasta cinco intentos. Un 2xx del webhook significa ACCEPTED_BY_WEBHOOK; **no acredita recepción del administrador**. El estado conserva ese límite explícito. No se ha enviado ningún mensaje real. El historial del adaptador está acotado a cien alertas; la operación productiva requiere política de archivo y revisión de entregas fallidas.

La aceptación exige desplegar fuera de Vercel, provocar una falla autorizada del endpoint del ensayo, comprobar que el monitor continúa activo, recibir la alerta en el destino acordado y registrar su resolución. Los ensayos locales de fallo no satisfacen esa aceptación. El diagnóstico actual cubre el calendario del ensayo; extenderlo a los trabajos productivos y latidos operativos sigue pendiente. [Pruebas locales](evidence/automation-backend-tests.txt), [decisión productiva](BACKSTAGE_PRODUCTION_GO_NO_GO.md).
