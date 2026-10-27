# BACKSTAGE · capacidad y reversión

25 de octubre de 2026, Bogotá. Estado: ensayo acotado y reversión real aprobados; dimensionamiento productivo pendiente.

| Clasificación | Alcance |
| --- | --- |
| Implementado | Límites BCO existentes, métricas del proceso alojado y herramientas restringidas al proyecto aislado. |
| Probado | Concurrencia acotada, rechazo por presupuesto, aislamiento organizacional, resultados conocidos y reversión/restablecimiento real. |
| Pendiente | Carga representativa, duración sostenida, aceptación funcional y objetivos empresariales de latencia/recuperación. |
| Bloqueado | Certificación productiva hasta definir tier Atlas, capacidad contratada y monitoreo independiente. |

Veinte lecturas HTTPS protegidas con concurrencia cuatro: **20/20 satisfactorias**, p50 162.06 ms, p95 1 579.06 ms y máximo 1 580.07 ms. Cuatro creaciones concurrentes de trabajos en otra organización de ensayo: tres admitidas y una 429 por el límite. El daemon limitado a la organización principal dejó las tres ajenas en QUEUED durante 7 251 ms; posteriormente se cancelaron explícitamente. Lectura cruzada 404 e intento de membresía falsa 403. [Evidencia de capacidad](evidence/automation-capacity.json).

El caso de cálculo alojado consumió 80 610 µs de CPU de usuario y 15 369 µs de sistema. RSS muestreada máxima: 99 926 016 bytes, cada 250 ms. Corresponde al proceso Node con sus threads; excluye procesos Python hijos y no acredita pico absoluto. La muestra pequeña no certifica capacidad productiva ni garantiza que las cuotas Hobby soporten la carga empresarial.

El SIGKILL y el vencimiento de función fueron fallos reales de componentes. La regresión contiene simulaciones de falla MongoDB; no se interrumpió el clúster ni se indujo una caída global de Vercel. Corte real de conectividad y recuperación tras indisponibilidad prolongada permanecen pendientes de ventana controlada.

La reversión probada fue `dpl_EVu1bjPBUXERghUKamWFw3HjPkGp → dpl_G4AxySzXUgmz2sxeKzxqrxpdUUSa → dpl_EVu1bjPBUXERghUKamWFw3HjPkGp`. Se comprobó salud de la versión anterior y restablecida, hash de trabajos sin cambios y nombres de variables conservados. Se retiraron explícitamente overrides de escalado y se restablecieron dos instancias; el postflight confirmó ambas ready/alive. Los valores secretos no se publican ni se certifican solo comparando nombres. [Evidencia](evidence/automation-rollback.json).

Un primer intento de revertir a un despliegue más antiguo recibió 402: el plan de esta cuenta permite la versión inmediatamente anterior. Se conservó ese intento y se ejecutó la prueba contra esa versión permitida, sin cambiar a Pro. No se asume que cualquier versión histórica sea reversible con el plan actual.

El calendario está persistido en Atlas y este proyecto no usa Cron nativo. Revertir código no revierte jobs, variables, overrides ni calendarios. Para una reversión futura: pausar nuevas programaciones y escalar el ensayo a cero con la herramienta acotada; registrar trabajos pendientes y leases; comprobar compatibilidad de estados —incluido RETRY_PENDING— con el destino; revertir; revisar calendario, variables y escalado; reactivar solo después de verificar datos y autenticación. La prueba actual no autoriza descartar trabajos ni revertir backups sobre el origen.

Herramientas: `scripts/verify-automation-capacity.js` y `scripts/verify-automation-rollback.js`. Las validaciones usan marcadores de propiedad; no apuntan a los proyectos empresariales originales.
