# BACKSTAGE · respaldo y restauración comprobada

25 de octubre de 2026, Bogotá. Estado: copia lógica del ensayo restaurada y verificada. [Evidencia](evidence/automation-staging-restore.json).

| Clasificación | Resultado |
| --- | --- |
| Implementado | Snapshot lógico BSON, AES-256-GCM, clave separada, restauración sobre base temporal con comprobación de propiedad. |
| Probado | Once colecciones, 82 documentos y dieciocho índices no predeterminados; hashes BSON, recuentos y definiciones de índices coincidentes. Archivo cifrado releído; alteraciones rechazadas. |
| Pendiente | Respaldo programado de producción, retención, custodia externa, recuperación operacional completa y medición de RPO. |
| Bloqueado | Política administrada/tier de Atlas y almacenamiento externo hasta disponer de administración y destino autorizado. |

La copia utilizó un mismo instante snapshot `{t:1792972900,i:36}`. Es una fotografía anterior a los trabajos posteriores de capacidad; no describe el estado actual completo. Alcance: exclusivamente la nueva base de ensayo, sin escrituras al origen ni restauración sobre producción. No contiene administración del clúster, usuarios Atlas ni sus políticas.

SHA-256 del archivo cifrado: `adf0f98ef364df2c3c633440001748f40756e4159e505c94e10bfdacc9e00958`. Los archivos y la clave separada permanecen privados bajo `.vercel/automation-backup-*` y `.vercel/automation-backup-keys/`; no deben incluirse en código, paquetes ni documentos públicos. Su custodia fuera del equipo no está comprobada.

La restauración y su validación tardaron **8 565 ms**, sobre el pequeño conjunto de staging. Se suspendió un índice TTL únicamente en el destino temporal para impedir que expirara durante la comparación. Después se retiró ese destino de propiedad comprobada. Los TTL y datos del origen permanecieron intactos.

**RPO: no medido.** Una hora de snapshot no establece un objetivo de pérdida de datos cumplido si no existe calendario de respaldos. **RTO observado: 8.565 segundos para restaurar y verificar esta muestra**, excluyendo provisión, recuperación de secretos, reparación de infraestructura, publicación y aceptación. No es el RTO empresarial.

El procedimiento reproducible está en `backend/scripts/backup-automation-atlas.js`, restringido al namespace del ensayo y con aplicación explícita. No se ha ejecutado contra la base productiva. El cierre exige una nueva restauración aislada del respaldo productivo programado, recuperación de clave desde su custodia externa y aceptación de RPO/RTO completos.
