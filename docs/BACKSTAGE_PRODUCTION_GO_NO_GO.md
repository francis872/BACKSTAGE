# BACKSTAGE · decisión de publicación

**Cierre operativo con despliegues congelados · 26 de octubre de 2026: NO_GO.** Se verificó por lectura que los cuatro proyectos conservan despliegues, alias, protección y metadatos de variables. La credencial Atlas de pruebas tiene `atlasAdmin`; mínimos privilegios productivos no están acreditados. Pasaron once comprobaciones locales de claves, cinco grupos de restauración sintética y la regresión: 470 backend aprobadas/una omitida, 41 frontend y build. Ambas bases exclusivas se retiraron. Correo/dominio, administración Atlas productiva, respaldo administrado, custodia externa, monitor independiente y recepción de alertas siguen bloqueados; la reversión permanece como plan sin ejecutar. No se habilitaron datos reales ni se cambió Vercel durante este cierre. [Matriz con estados, evidencias y permisos](BACKSTAGE_OPERATIONS_CLOSURE.md), [comprobación final](evidence/operations-closure-postflight.json).

**Preparación posterior para datos reales · 26 de octubre de 2026: NO_GO conservado.** El propietario autorizó operación real, completará Atlas y no dispone de correo. Se prepararon claves de cifrado y URL de recuperación en Production para próximos despliegues, sin cambiar las aplicaciones ni sus alias. Los paquetes coinciden con el código aceptado; la versión pública anterior responde correctamente. La conexión administrativa y la infraestructura/recepción de correo, respaldos y monitoreo siguen sin acreditar. [Estado concreto y activación pendiente](BACKSTAGE_REAL_USER_ACTIVATION.md). La autorización no se confunde con disponibilidad de esos recursos.

**Actualización posterior · 26 de octubre de 2026: Preview publicado; NO_GO productivo conservado.** La versión con Community se desplegó únicamente en proyectos dedicados de staging con protección Vercel. Nueve controles reales HTTP/Atlas/navegador aprobados, auditorías válidas y registros sintéticos retirados. Se configuraron claves persistentes para Preview; no se acreditan por ello la custodia y restauración productivas. Los destinos y alias productivos permanecen iguales al inventario capturado antes de esta publicación. [Informe y límites](BACKSTAGE_COMMUNITY_PREVIEW.md), [evidencia final](evidence/community-preview-postflight.json). Las notas de «todavía no desplegado» que siguen describen expedientes anteriores; los bloqueos productivos continúan abiertos.

**Actualización vigente · 26 de octubre de 2026: NO_GO productivo.** El incremento de operación PH, cifrado y MFA pasó 416 pruebas backend (una omitida), 36 frontend, build y aceptación real en Atlas de pruebas/navegador. Todavía no se desplegó este incremento en Vercel. Sus claves requieren custodia/configuración por entorno; no cierra los bloqueos operativos siguientes. [Informe](BACKSTAGE_UNIFIED_OPERATIONS_REPORT.md), [arquitectura nativa](BACKSTAGE_NATIVE_TRUST_ARCHITECTURE.md). No hay dependencia pendiente de SATYA/Vault. Las fechas relativas de los expedientes anteriores corresponden al 25 de octubre; la comprobación física de PC apagado no se certifica por haber pasado esa hora.

25 de octubre de 2026, Bogotá. **NO_GO para publicar este incremento en producción empresarial.** Sí pasó el ensayo autónomo desplegado en staging; producción conserva la versión anterior.

Actualización posterior: la [base PH del Explorador](BACKSTAGE_HORIZONTAL_PROPERTY.md) pasó pruebas locales y una integración aislada real en Atlas; aún no se ha desplegado en staging Vercel ni en producción. Su regresión amplía el total a 404 backend (403 aprobadas y una omitida), con 35 frontend aprobadas. No cierra los bloqueos operativos siguientes ni cambia esta decisión.

| Criterio | Estado | Evidencia o cierre requerido |
| --- | --- | --- |
| Ejecutor alojado y disparador automático | Probado | Dos Daemons Vercel, reloj y estados Atlas; resultados JavaScript/Python conocidos. [Ejecución](BACKSTAGE_STAGING_EXECUTION_REPORT.md) |
| PC físicamente apagado | Pendiente | Caso programado hoy 7:53:21 p. m. Bogotá; falta confirmar PC apagado y revisar después el resultado. |
| Persistencia, leases, backoff y recuperación | Probado | SIGKILL y función 504 reales; dos intentos y una finalización. [Recuperación](BACKSTAGE_JOB_RECOVERY_TESTS.md) |
| Efectos idempotentes e integridad | Probado en ensayo | Un job por caso, auditoría y hashes verificados. No se afirma ejecución exactamente una vez. |
| Identidad y aislamiento | Probado en aplicación | Servicio analyst, una organización, 404/403 cruzados; credencial Atlas todavía amplia. |
| Monitor independiente y alerta recibida | Bloqueado | Adaptador local implementado/probado. Faltan servicio externo y destino que el propietario configurará. [Monitoreo](BACKSTAGE_EXTERNAL_MONITORING.md) |
| Atlas productivo y privilegios mínimos | Bloqueado | Cuenta administrativa que el propietario conectará; tier, red, separación y credencial mínima sin verificar. [Atlas](BACKSTAGE_ATLAS_PRODUCTION_READINESS.md) |
| Respaldo/restauración | Probado solo en ensayo | 82 documentos restaurados en destino aislado; faltan calendario, retención y custodia productivos. [Restauración](BACKSTAGE_RESTORE_TEST_REPORT.md) |
| Capacidad | Probado de forma acotada | 20/20 lecturas; p95 1.58 s. Faltan carga representativa, fallos de proveedor y criterios aceptados. |
| Reversión | Probado en proyecto aislado | Código anterior y restablecido, datos conservados, escalado revisado. [Capacidad/reversión](BACKSTAGE_CAPACITY_AND_ROLLBACK.md) |
| Aceptación funcional | Pendiente | Recorridos con propietario y persona nueva; confirmar comprensión y criterios comerciales. |
| Correo y GPS | Pendiente, sin bloquear autonomía | Adaptadores existentes; sin proveedor/cuenta configurados. No se anuncian operativos. |

Implementado: reutilización BCO/MongoDB Atlas, RETRY_PENDING, backoff y harness finito desplegado; monitor portable, pruebas y ocho expedientes. No se reconstruyó el frontend ni se introdujo SQL. Regresión final: **396 pruebas backend, 395 aprobadas, una integración externa optativa omitida, cero fallos**. [Registro](evidence/automation-backend-tests.txt).

Pendiente inmediato: confirmar el intervalo de PC apagado; conectar administración Atlas; configurar el monitor fuera de Vercel e indicar el destino del administrador. Estas son dependencias concretas ya comunicadas al propietario; no se interpreta su intención de conectarlas como acceso existente. No se enviaron alertas a terceros.

Después: cerrar políticas Atlas y restauración productiva, aceptación funcional/capacidad, prueba externa de alerta recibida y recuperación de conectividad. Solo tras registrar esos resultados corresponde publicar y comprobar reversión en el contexto productivo definitivo.

Los daemons del ensayo siguen activos para la ejecución programada; el calendario tiene seis casos y no representa un scheduler global productivo. Daemons está en beta y sujeto a [cuotas del plan](https://vercel.com/docs/daemons/limits). No se contrató hosting, dominio ni ampliación de plan. [Auditoría inicial](BACKSTAGE_AUTOMATION_AUDIT.md), [postflight](evidence/automation-postflight.json).
