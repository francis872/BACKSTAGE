# Identidad, membresías y auditoría

La Fase 4 reutiliza las cuentas, organizaciones, membresías, guards y cadena de auditoría MongoDB existentes. La aplicación conserva MongoDB Atlas como única persistencia y los IDs públicos actuales. Las invitaciones añaden `identity_invitations`; las demás colecciones no se sustituyen.

## Invitación y aceptación

En **Organización → Miembros y roles → Invitar miembro**, un administrador indica correo y rol y obtiene un enlace para compartir manualmente. El producto no envía correo. El enlace usa un fragmento `#invitation=...`, que el navegador no incluye en las peticiones HTTP de la página. El destinatario inicia sesión y pulsa **Aceptar invitación**; aceptar no ocurre al abrir el enlace.

El código contiene 32 bytes aleatorios. El servidor conserva únicamente su SHA-256 y entrega el código una vez al crear la invitación. Los listados no devuelven códigos ni hashes. Vence a los siete días, se utiliza una vez y se puede revocar. El rol, organización y vencimiento proceden del registro del servidor; la aceptación ignora afirmaciones del cliente sobre esos campos.

La aceptación requiere una cuenta activa cuyo correo coincida, una organización activa y que el creador siga siendo administrador vigente. No reemplaza el rol de alguien que ya pertenece a la organización. Una cuenta nueva usa el registro existente, que crea su propio workspace, y después puede aceptar la invitación; este incremento no cambia ese contrato de registro. No hay proveedor de correo ni verificación automática de titularidad del buzón: el administrador debe entregar el enlace al destinatario correcto por su canal habitual.

La creación, aceptación, cambio de rol y revocación vuelven a autorizar al administrador en la transacción. Las operaciones serializan sus cambios sobre `identity_organizations.membership_revision`, también al aceptar una invitación. Se conserva al menos un administrador con cuenta activa; una cuenta deshabilitada no satisface esa condición.

Revocar un miembro retira exclusivamente su membresía de la organización e invalida sus invitaciones pendientes anteriores para esa organización. La cuenta y otras organizaciones permanecen. Las invitaciones creadas por alguien que pierde su rol de administrador dejan de poder aceptarse.

## Permisos y vigencia

| Rol | Acceso relevante |
| --- | --- |
| Administrador | Miembros, invitaciones, configuración y lectura/verificación de auditoría; funciones de analista. |
| Analista | Activos generales, análisis y proyectos; capacidades industriales habilitadas. |
| Consulta | Lecturas autorizadas; no escrituras, miembros ni auditoría administrativa. |

El token identifica al usuario. Los guards HTTP consultan sus membresías actuales. Las capacidades SOI se leen desde la configuración de la organización; un rol alto no habilita una capacidad retirada. El navegador actualiza el perfil al recibir foco y cada 20 segundos; un fallo temporal conserva la sesión. Un 403/404 de `/auth/me` cierra la sesión local y limpia contexto. Las denegaciones de otras rutas no cierran automáticamente la sesión.

El servidor WebSocket nativo revalida antes de enviar eventos y periódicamente cada 15 segundos. Una reducción de administrador a consulta cierra seguridad, pero mantiene operaciones de lectura; retirar la membresía cierra ambos. También falla de forma cerrada ante errores de identidad. La garantía probada corresponde al servidor nativo local; el hosting debe soportar ese transporte. El panel conserva el sondeo cuando el canal no está disponible.

## Auditoría de operaciones

La implementación canónica es `mongoAudit.service.js`; `soiMongoAudit.service.js` queda como alias compatible. Se conservan `soi_audit_events`, `soi_audit_heads`, IDs, hashes y formato de la cadena. `appendAuditEvent` acepta la misma base/sesión de una mutación; no abre una transacción paralela.

Estos hechos se guardan junto con su mutación y actor/organización/recurso:

- `invitation.created`, `invitation.revoked`, `invitation.accepted`.
- `member.created`, `member.updated`, `member.password_updated`, `member.revoked`.
- `asset.created`, `asset.updated`, `asset.deleted` para inventario general mediante `/assets` y las rutas de ubicaciones aplicables.
- `analysis.saved` para snapshots configurables y `project.created` para proyectos operativos del repositorio existente.

Si falla la auditoría, estas mutaciones se revierten. Reintentar crear el proyecto de un snapshot ya vinculado no duplica su hecho de creación. Las rutas HTTP entregan el actor autenticado a los servicios; las operaciones administrativas de identidad requieren ese actor también en su contrato interno.

El middleware conserva además el registro de petición y de intentos fallidos. Ese registro genérico sigue siendo posterior a la respuesta y no garantiza atomicidad para las rutas históricas aún no incorporadas a los hechos anteriores. Por eso pueden existir un hecho `DOMAIN` y un registro HTTP para una misma acción: describen confirmación de negocio y petición, respectivamente. La notificación de auditoría por WebSocket sigue asociada al registro HTTP; los hechos transaccionales también se consultan por API/sondeo.

El saneamiento oculta credenciales de objetos y listas anidados, limita profundidad/tamaño retenido y retira las consultas de la ruta registrada. No registra tokens de invitación en los hechos. La pantalla ahora consume el array y los nombres de campos reales del backend, reconoce el campo `event` del transporte y distingue un prefijo comprobado de una cadena completa cuando se alcanza el límite de verificación.

## Esquema y verificación pendiente

El plan añade tres índices en `identity_invitations`: `invitation_id` único, `token_hash` único y `{organization_id,created_at}`. El marcador de esquema existente permanece en versión 2. No se aplicó este plan ni se conectó a Atlas durante esta fase.

Antes de publicar, revisar/aplicar el delta de colección/índices en Atlas de pruebas, ejecutar concurrencia real de aceptación/cambio de rol, inducir un fallo transaccional y comprobar la cadena tras releer desde otra sesión. Se deben validar también respaldo/restauración y el transporte disponible en staging. Los fixtures actuales no sustituyen esas pruebas.
