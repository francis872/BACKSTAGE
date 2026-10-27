# BACKSTAGE · auditoría inicial de ejecución autónoma

25 de octubre de 2026, Bogotá. Diagnóstico previo a modificar la ejecución del nuevo ensayo. Vercel y MongoDB Atlas se conservan. El árbol Git tiene 394 entradas pendientes al inicio; no se descarta, sobrescribe ni publica ese trabajo mediante Git. Copia de 360 archivos seleccionados en `.vercel/automation-before-latest.json`, sin entornos ni credenciales; no sustituye un respaldo Atlas.

| Frente | Implementado o probado anteriormente | Pendiente del ensayo actual |
| --- | --- | --- |
| BCO | API, dominio, repositorio transaccional, catálogo y worker CLI; trabajos en analytics_jobs con discriminador bco.workflow | Ejecutor desplegado que funcione sin proceso local |
| Disparadores | Creación/queue por API; bucle CLI manual; no Cron nativo activo para BCO | Programación y evidencia de una ejecución iniciada por infraestructura desplegada |
| Recuperación | Leases de 45 segundos, renovación de diez segundos, dos slots globales, uno por organización, tres intentos, fencing y hashes | Reinicio/interrupción reales del ejecutor alojado, backoff persistido y estado RETRY_PENDING cuando corresponda |
| Efectos | Resultados, enlace de proyecto, eventos y auditoría en transacción; ID y revisión estables | Comprobar que invocaciones repetidas no duplican efectos en la infraestructura nueva |
| Persistencia | Atlas de pruebas confirmado; el despliegue público anterior comparte ese destino | Base nueva exclusiva del ensayo; credencial Atlas de datos existente aún administrativa, sin acreditar mínimo privilegio |
| Vercel | Cuenta Hobby comprobada; funciones actuales con maxDuration 60; proyectos staging Preview protegidos | Proyecto de automatización separado; Cron y Daemons requieren destino Production dentro de ese proyecto de staging |
| Capacidad nativa | Cron Hobby una vez al día; documentación actual ofrece Daemons beta en todos los planes y construcción remota de contenedores | Verificar disponibilidad real de Daemons en la cuenta y construir el paquete existente; sin introducir cola alternativa por adelantado |
| Monitor | Monitor con estado Atlas y panel admin probado localmente; no hay servicio externo operativo | Monitor fuera de Vercel, canal autorizado y recepción de alerta comprobada |
| Seguridad | RBAC/ABAC y revisión de identidad vigentes; runtime cerrado sin código del cliente; logs sin secretos | Identidad de servicio acotada, endpoint programado autenticado y acceso mínimo a la base |
| Backups | Antecedentes de snapshot lógico cifrado y restauración aislada sobre pruebas | Tier/contrato Atlas, programación productiva, custodia externa y RPO/RTO de producción |
| Correo/GPS | Adaptadores conservados y pruebas anteriores | Cuentas y autorizaciones; no bloquean el ensayo autónomo |

No se confunde Production del proyecto aislado de staging con producción empresarial. No se modificarán los dominios ni los datos de la publicación original. El nuevo ensayo utilizará exclusivamente registros señalados como pruebas, una base diferente y una duración limitada.

La documentación de Daemons indica reinicio gestionado, ejecución en Production, build remoto desde Dockerfile y cuota Hobby sin facturación de Daemons. Es una capacidad candidata hasta que el despliegue real la confirme. La prueba no requiere cambiar el plan ni contratar un host externo. La ausencia física del PC apagado no puede inferirse de una llamada HTTP: se distinguirá entre independencia demostrada del proceso local y una comprobación física pendiente del propietario.

Credenciales requeridas, sin valores: sesión Vercel existente para desplegar; MONGODB_URI existente para crear el destino de pruebas; secreto exclusivo del endpoint programado; identidad empresarial dedicada al ensayo. Administración Atlas, monitor externo y destino de notificación todavía requieren acceso/autorización. No se reutilizan claves del frontend.

Fuentes primarias: [Daemons](https://vercel.com/docs/daemons), [límites y cuota](https://vercel.com/docs/daemons/limits), [configuración](https://vercel.com/docs/daemons/config-reference), [Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing). Los resultados nuevos se registrarán en los demás expedientes solicitados; esta auditoría no declara aceptación ni producción lista.

Actualización posterior al ensayo: **implementado** el ejecutor nativo y backoff, **probados** despliegue/recuperación/restauración/reversión en staging, **pendientes** confirmación física de PC apagado y aceptación productiva, **bloqueados** monitor externo con recepción y administración Atlas hasta disponer de las conexiones indicadas por el propietario. La tabla anterior conserva el diagnóstico inicial; el resultado vigente está en [GO/NO_GO](BACKSTAGE_PRODUCTION_GO_NO_GO.md).
