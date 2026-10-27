# BACKSTAGE · persistencia y recuperación de trabajos

25 de octubre de 2026, Bogotá. Estado: recuperación real aprobada en el ensayo aislado.

| Clasificación | Alcance |
| --- | --- |
| Implementado | BCO y transacciones MongoDB existentes; RETRY_PENDING aditivo, backoff persistido, leases, fencing, cancelación e idempotencia conservados. |
| Probado | SIGKILL de proceso desplegado, vencimiento real de función, timeout del workflow, duplicación de programación, aislamiento y verificación de evidencia. |
| Pendiente | Ensayo de indisponibilidad total del proveedor y corte de conectividad real contra Atlas bajo ventana controlada. |
| Bloqueado | Certificación de recuperación productiva con configuración definitiva de Atlas y monitor externo. |

Se conserva el recorrido `PENDING → QUEUED → RUNNING → COMPLETED`, con FAILED, CANCELLED, TIMED_OUT y RETRY_PENDING. La adquisición es atómica; el lease dura 45 segundos, se renueva durante ejecuciones normales y admite hasta tres intentos. En el nuevo ejecutor, un lease vencido pasa a RETRY_PENDING antes de esperar al menos cinco segundos. El backoff aumenta y está limitado a sesenta segundos. El parámetro es interno; el comportamiento anterior sin backoff se conserva para los consumidores existentes.

El caso de interrupción mata realmente el proceso Node dentro del contenedor después de persistir su adquisición. Otro proceso recuperó el trabajo, con dos UUID de instancia distintos y dos intentos. Atlas registra un evento retry_pending y un único hecho de finalización. El fencing impide que un propietario anterior confirme un resultado después de perder el lease. La inyección queda restringida al harness de staging y al primer intento del caso designado; el cliente HTTP no puede solicitarla.

La segunda prueba detuvo temporalmente los daemons del ensayo, adquirió un trabajo desde una función protegida y dejó vencer la función. Vercel respondió **504 FUNCTION_INVOCATION_TIMEOUT** a los **30 706 ms**. Tras restablecer los daemons, el trabajo terminó con riesgo 0.125, dos intentos y una sola finalización. Esto demuestra vencimiento de una función concreta; no representa caída de todo Vercel. [Evidencia](evidence/automation-function-expiry.json).

El timeout propio del workflow es independiente: límite de 100 ms, terminación TIMED_OUT observada. Las invocaciones repetidas del scheduler preservaron IDs y efectos. Auditoría canónica válida y verificación histórica de inputs, resultados y manifiestos aprobadas. [Evidencia de ejecución](evidence/automation-staging-execution.json).

No se afirma ejecución exactamente una vez: el cálculo puede repetirse tras un fallo. Las escrituras finales y los enlaces existentes se protegen mediante idempotencia, revisión y transacciones. Proveedores externos futuros deberán aplicar sus propias claves de idempotencia.

Las pruebas de regresión incluyen backoff, identidad revocada, rechazo del entorno productivo, protección del endpoint y fallos MongoDB simulados. [Registro completo](evidence/automation-backend-tests.txt). Las simulaciones no se cuentan como caída real de Atlas.
