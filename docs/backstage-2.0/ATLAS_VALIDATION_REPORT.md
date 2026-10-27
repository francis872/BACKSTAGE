# Validación integrada de Platform Core en Atlas

Fecha: 22 de octubre de 2026, Colombia. Alcance aprobado mediante «hazlo»: aplicar el delta de invitaciones y comprobar persistencia, concurrencia, permisos, auditoría y respaldo/restauración en la conexión de Atlas identificada previamente por el propietario como entorno de pruebas.

## A. Estado

Validación real completada, con diez comprobaciones aprobadas. Ejecución `atlas-core-20261022230533-4c79375205d7`. Se utilizó MongoDB Atlas con transacciones, rutas Express y WebSocket nativo del código existente; no se sustituyó el almacenamiento por fixtures. [Resultado completo](evidence/atlas-core-live.json).

La primera conexión restringida agotó DNS; el reintento autorizado fuera del aislamiento de red confirmó lectura y soporte transaccional. El preflight verificó esquema versión 2, índices únicos y contadores; antes de escribir, se comprobó que la conexión coincidiera con la huella del preflight. No se alteró configuración de red ni secretos.

No se modificaron fuentes de aplicación ni se desplegó una versión. Solo se añadieron herramientas de verificación y documentación. Los paquetes preparados en Fase 4 siguen siendo la referencia de aplicación.

## B. Cambios realizados

Se creó `identity_invitations` y se confirmaron exactamente los tres índices aprobados: `invitation_id_1` único, `token_hash_1` único y `organization_id_1_created_at_-1`. No se ejecutó la inicialización global de colecciones/índices ni se modificó el marcador de esquema.

Se registraron dos cuentas y organizaciones nuevas, con marcador exclusivo de ejecución y correos reservados `example.invalid`. El activo, comparación y proyecto pertenecieron a esas organizaciones; sus mediciones se identificaron como simuladas. No se consultaron proveedores externos ni se enviaron invitaciones por correo.

Las herramientas nuevas son `backend/scripts/verify-platform-core-atlas.js` y `inspect-platform-core-validation.js`. La primera imprime un plan por defecto, exige autorización explícita de entorno para conectar y el argumento `--apply` para escribir. La segunda confirma el resultado desde un proceso nuevo y de solo lectura. `atlasValidationSafety.test.js` comprueba que los selectores de limpieza nunca queden sin alcance y excluyan contadores compartidos.

## C. Verificación

| Comprobación real | Resultado |
| --- | --- |
| Preflight | Esquema, topología, índices únicos y contadores preparados. |
| Delta de invitaciones | Tres índices confirmados, sin inicialización global. |
| Persistencia entre conexiones | Cuentas y membresías releídas mediante otro `MongoClient`. |
| Dos aceptaciones simultáneas | Respuestas 200 y 410; una sola membresía. El servidor conserva rol/organización de la invitación. |
| Dos reducciones simultáneas de administradores | Respuestas 200 y 403; se conserva un administrador activo. Se restablecieron después ambos roles de prueba para continuar. |
| Activo → análisis → proyecto | Persistencia comprobada, separación de organizaciones y dos peticiones de creación con un único proyecto y hecho de auditoría. |
| Fallo antes del commit | Se ejecutaron escrituras reales de rol y auditoría y luego se lanzó un fallo intencional de aplicación dentro de la transacción. Otra conexión confirmó que ambos cambios se revirtieron. |
| Revocación HTTP/WebSocket | Los tokens antiguos pierden escritura/auditoría al reducir el rol y pierden acceso al retirar membresía. Los sockets no reciben los eventos posteriores; las otras membresías de la cuenta permanecen. Una invitación pendiente anterior queda invalidada. |
| Auditoría | Diez hechos, cadena completa e íntegra comprobada desde otra conexión. |
| Respaldo/restauración | Archivo BSON con 22 documentos y metadatos de índices de nueve colecciones, restaurado en nueve colecciones temporales nuevas. Se verificaron huellas de todos los documentos y se reejecutaron identidad y verificación de cadena sobre los datos restaurados. |

El respaldo privado permanece en `.vercel/atlas-core-20261022230533-4c79375205d7/owned-test-records.bson`, excluido por Git. Contiene exclusivamente datos de las cuentas de prueba, incluidos hashes de sus contraseñas y códigos; no se publica ni se incorpora a los paquetes. SHA-256: `503f5f4340b2b6695e9dd35748859cca0e895d5c9459c107f2313dc3c94a1783`.

Se limpiaron únicamente los documentos cuya pertenencia a esta ejecución se comprobó y las nueve colecciones de restauración. Los contadores compartidos avanzaron para asignar IDs y se conservaron; no se retrocedieron ni reutilizaron. Los tres índices de invitaciones permanecen.

Un proceso nuevo confirmó después **cero registros de prueba restantes**, **cero colecciones temporales restantes**, los tres índices y la huella del respaldo privado. [Postflight independiente](evidence/atlas-core-postflight.json). La prueba local de seguridad de los selectores también pasó.

## D. Límites

El respaldo/restauración acreditado es lógico y está limitado a los datos nuevos del ensayo. No certifica un respaldo completo del entorno, restauración de datos operativos, recuperación a un instante ni una política automática de backups de Atlas.

Las rutas y sockets se ejecutaron localmente contra Atlas real. Esto no certifica el dominio, proxy, secretos del hosting, disponibilidad de conexiones persistentes ni comportamiento del despliegue público. Tampoco prueba sensores, GPS o proveedores cartográficos. No se realizó despliegue.

El fallo inducido fue una excepción de aplicación después de escrituras y antes del commit; no se interrumpió el clúster ni se simularon failover o particiones de red.

## E. Siguiente incremento

Validar los paquetes actuales en un despliegue de staging: acceso mediante el proxy real, invitación/aceptación desde navegador, rol/revocación y transporte disponible, manteniendo el entorno de datos de pruebas. Antes de producción queda comprobar el respaldo completo requerido y su restauración, revisar diferencias de configuración y el plan de reversión del despliegue. La evolución de Intelligence Core continúa como Fase 5 de la hoja de ruta; no se inició en este incremento.
