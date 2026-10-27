# BACKSTAGE · ejecución autónoma en staging

25 de octubre de 2026, Bogotá. Ensayo `auto-20261025234838-1315eafd`. Estado: ejecución en nube comprobada; comprobación física con PC apagado pendiente.

| Clasificación | Resultado |
| --- | --- |
| Implementado | Contenedor construido por Vercel, dos Daemons en iad1, BCO existente y programación finita persistida en Atlas. Sin worker local, cola nueva ni cambios al frontend. |
| Probado | Programación automática, resultados JavaScript/Python, interrupción real, recuperación, idempotencia, auditoría y autenticación del diagnóstico. |
| Pendiente | Confirmación del propietario de que el PC estuvo apagado durante una ejecución programada. |
| Bloqueado | Aceptación productiva hasta cerrar monitoreo externo y administración de Atlas. |

El proyecto protegido `backstage-autonomy-1315eafd` usa destino **Production dentro del proyecto de staging independiente**. No corresponde a la producción empresarial. Su base `backstage_auto_1315eafd` está en el mismo clúster de pruebas, con namespace separado y datos sintéticos. La credencial de base existente todavía tiene privilegios amplios.

Despliegue inicial de los cuatro casos: `dpl_vHsnth9UK3m2LEGk9pG3FmWDsdqe`. Despliegue actual, después de reversión/restablecimiento: `dpl_EVu1bjPBUXERghUKamWFw3HjPkGp`. [Proyecto protegido](https://backstage-autonomy-1315eafd.vercel.app). El endpoint `/api/status` exige además secreto dedicado; consultarlo no programa ni ejecuta trabajos.

| Caso | Programado, UTC | Finalización, UTC | Resultado |
| --- | --- | --- | --- |
| known-risk | 25 oct. 23:53:21.015 | 23:53:22.240 | COMPLETED; riesgo 0.125; un intento |
| interruption-recovery | 25 oct. 23:53:51.015 | 23:54:43.981 | COMPLETED; dos intentos tras SIGKILL |
| workflow-timeout | 25 oct. 23:54:51.015 | 23:54:52.224 | TIMED_OUT esperado |
| known-moran | 25 oct. 23:55:21.015 | 23:55:25.012 | COMPLETED; Moran −1/3; motor Python existente |

Todos se programaron antes de su hora prevista y comenzaron por reloj del daemon. El observador local solo leyó evidencias. Las invocaciones repetidas conservaron un trabajo por caso; los completados tienen un único hecho de finalización y hashes verificables. [Evidencia y horarios completos](evidence/automation-staging-execution.json).

También finalizaron la sonda de vencimiento real de función y el caso automático de capacidad. Queda un caso finito `pc-off-observation` programado para **26 de octubre 00:53:21.015 UTC, equivalente a 25 de octubre 7:53:21 p. m. en Bogotá**. Para acreditar el requisito físico, el propietario debe mantener apagado el PC entre 7:50 y 8:00 p. m. y confirmar posteriormente ese intervalo. Si no lo hace, una finalización en nube sigue sin demostrar que el PC estuvo apagado.

Los dos daemons permanecen activos para ese caso; después continúan consultando la cola aunque el calendario de seis casos sea finito. Tras recoger la evidencia, `node scripts/automation-staging.js stop --apply` escala exclusivamente este ensayo a cero. No se presenta este calendario de aceptación como scheduler empresarial de todos los módulos.

[Daemons](https://vercel.com/docs/daemons) está en beta. [La cuota Hobby](https://vercel.com/docs/daemons/limits) es cinco horas de CPU activa mensuales, con suspensión al agotarla. No se cambió el plan ni se certificó disponibilidad empresarial. La producción original conserva sus despliegues API y web anteriores.
