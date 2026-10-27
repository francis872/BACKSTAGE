# BACKSTAGE · acceso, recuperación y sesiones

Actualizado el 25 de octubre de 2026, Bogotá. Este incremento evoluciona la identidad existente en MongoDB Atlas. No introduce SQL, Supabase, nuevas cuentas obligatorias ni cambios en organizaciones, roles o identificadores. La publicación original y el Preview tienen aceptación independiente.

## Aceptación de staging · 25 de octubre de 2026

Pareja protegida activa: API `dpl_EmktPTU3HNWNyQm8Yi6dNsBhmcKu` y web `dpl_DkiDNfp1oc9zWXArMdnDfvDEBo6B`. [Abrir staging](https://backstage-staging-web.vercel.app). Los siete grupos de seguridad y los once de Origin pasaron con Atlas de pruebas y API real; los registros temporales se exportaron y retiraron con selectores de propiedad comprobados. Se mantienen los contadores compartidos y trazas globales.

[Postflight](evidence/unified-postflight.json): protección Vercel 302 para acceso anónimo, salud 200 con autorización y 401 sin sesión de aplicación; 222 archivos de ejecución de API y 120 de web coinciden con el paquete publicado. Los dominios originales de producción siguen en sus despliegues anteriores. El primer postflight interpretó `target:null` como fallo; Vercel lo devuelve para estos Preview. Se conservó el intento y se corrigió la interpretación, sin aceptar destinos de producción.

El correo real continúa **sin configurar**. Las pruebas de tokens usan transporte controlado, no entregabilidad. Esto no publica todos los módulos futuros del prompt maestro ni convierte Atlas de pruebas en una base productiva separada.

## Situación del correo

El propietario confirmó que **no hay proveedor configurado**. La interfaz informa este estado, deshabilita solicitar enlaces y conserva el acceso vigente. `/auth/capabilities` declara `password_recovery_email:false` y `email_verification:false`; la solicitud pública devuelve el mismo 503 para direcciones conocidas y desconocidas. No se enviaron correos reales ni se acredita entregabilidad.

Se preparó un adaptador HTTP de Resend, sin añadir dependencias. Es una opción disponible, no una cuenta contratada ni un proveedor elegido por el propietario. Para activarlo, el administrador debe configurar `RESEND_API_KEY`, `AUTH_EMAIL_FROM` y `AUTH_PUBLIC_APP_URL` en el servidor, autorizar/verificar el remitente y comprobar entrega, rebotes y cuotas con el servicio elegido. `AUTH_PUBLIC_APP_URL` acepta únicamente un origen HTTPS explícito; no se deriva del encabezado Host. Si se elige SMTP, todavía hace falta implementar su transporte. Las claves nunca se pegan en el chat ni se incorporan al frontend.

## Comportamiento implementado

- **Recuperación:** correo normalizado, respuesta pública uniforme, límite distribuido por IP/cuenta en Vercel y enfriamiento por cuenta. El transporte se ejecuta después de responder y se mantiene mediante `waitUntil`. Un fallo no cambia la contraseña ni deja utilizable el enlace que falló.
- **Enlaces:** 32 bytes aleatorios, SHA-256 almacenado, propósito independiente, vencimiento de 30 minutos y un solo consumo transaccional. El enlace usa fragmento; el formulario lo retira de la barra, no lo persiste y usa `no-referrer`. La verificación requiere confirmación explícita; abrir un enlace no cambia la cuenta.
- **Cambio desde Cuenta:** exige contraseña actual y confirmación de la nueva. Mantiene la política existente de 8 caracteres y el máximo de 72 bytes UTF-8 de bcrypt. Cambiar o restablecer incrementa `session_version`, vacía sesiones/acciones y exige volver a entrar.
- **Sesiones:** cada acceso nuevo registra un identificador aleatorio cuyo hash se almacena; se conservan hasta 20 sesiones no vencidas. El usuario puede cerrar una o todas; cerrar todas exige contraseña actual. No se inventan dispositivos, ubicaciones ni direcciones IP. Los tokens anteriores, sin identificador, funcionan con versión cero hasta revocarlos expresamente.
- **Autorización:** el servidor consulta usuario activo y versión/sesión vigente para Cuenta y para las rutas con contexto de organización. WebSocket vuelve a comprobarlas al autorizar, publicar y periódicamente. La revocación de una sesión no concede acceso a otra organización.
- **Auditoría:** las mutaciones de credenciales y su evento canónico se confirman en la misma transacción. Cuerpos de `/auth` omitidos de la auditoría HTTP; nunca se guardan enlaces en claro, contraseñas o claves del proveedor en la evidencia pública.
- **Interfaz:** recuperación y Cuenta explican el estado real del correo y las consecuencias de cerrar sesiones. El acceso conserva la composición existente con superficies grafito, texto neutro y formularios adaptables a móvil.

Implementación: `backend/services/accountSecurity.service.js`, `authMail.service.js`, `mongoIdentity.service.js`, `routes/accountSecurity.routes.js`, `middleware/organizationContext.js`, `realtime/wsServer.js`, `frontend/src/pages/AccountRecovery.jsx` y `components/AccountSecurityPanel.jsx`.

## Evaluación de Supabase Auth

No se activa en este incremento. Ya existen cuentas Atlas, hashes bcrypt y PBKDF2 heredados, roles, membresías y relaciones por ID numérico. No se encontraron proyecto Supabase ni configuración SMTP. Una migración añadiría otra identidad que necesitaría un mapeo estable, validación de hashes heredados, sincronización de revocación y una prueba real de correo. Supabase también requiere SMTP propio para correo productivo; no resuelve por sí mismo la ausencia actual de proveedor. Esta evaluación no autoriza incorporar una base SQL. Una futura propuesta de identidad externa deberá preservar Atlas y todas las relaciones actuales.

Referencias primarias: [recuperación de contraseña, OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp), [envío HTTP de Resend](https://resend.com/docs/api-reference/emails/send-email).

## Evidencia y límites

Pruebas locales: 355 de backend, 354 aprobadas y una integración externa omitida; 33 de frontend aprobadas. Los casos de servicio comprueban propósito/vencimiento/consumo, aislamiento, conservación de identidad, revocación, límite de sesiones y reversión ante fallo de auditoría. La integración HTTP/WebSocket confirma el rechazo del token revocado en rutas protegidas y el cierre del canal ya abierto.

[Navegador de seguridad](evidence/account-security-browser.json): 13 comprobaciones con API simulada, cero errores de ejecución y cuatro capturas. [Navegador Origin](evidence/origin-browser.json): conserva los 21 grupos existentes. Estas pruebas de interfaz no acreditan correo real ni escrituras Atlas. El ensayo optativo `backend/scripts/verify-account-security-staging.js --apply --test-environment` comprueba el Preview y Atlas con una cuenta nueva identificada; usa transporte de correo controlado solamente para obtener los enlaces de ensayo. [Ensayo real aprobado](evidence/account-security-live.json): siete grupos, cero errores del navegador, consumo único ante dos restablecimientos concurrentes y limpieza comprobada. Ejecución `atlas-core-20261025163259-9be27cdbd746`. El primer ensayo falló por un selector de navegación obsoleto del verificador, con limpieza aprobada; su [resultado se conserva](evidence/account-security-live-atlas-core-20261025162926-33f951a448f8.json). No se relajó ninguna comprobación de seguridad.

No se demuestra resistencia completa a ataques distribuidos, cobertura de correo ni conformidad con una norma de seguridad. Las notificaciones por correo después del cambio de contraseña y los controles de borde requieren una fase adicional con proveedor operativo.

## Compatibilidad y reversión

Los nuevos campos son aditivos en `identity_users`: `session_version`, `auth_sessions`, `auth_actions`, `email_verified_at`. No se eliminan cuentas ni se rota la clave JWT. La copia previa del código contiene 438 archivos, SHA-256 `414513c5d7452cbb867e70b8da9763b5d5d5686f8f4d9cda93626b6dda1313a7`; referencia privada `.vercel/unified-before-latest.json`. Es una copia de código y no un respaldo de Atlas. `.vercel/unified-before-staging-private.json` conserva la pareja anterior y contiene secretos; no se publica.

**Límite de reversión de seguridad:** después de cambiar credenciales o cerrar todas las sesiones, volver a una API que ignore `session_version` podría aceptar tokens revocados. La reversión debe conservar los comprobadores de versión/sesión, incluso si se retira la nueva interfaz. No restablecer versiones a cero, claves antiguas o hashes anteriores para deshacer un cambio de interfaz. Antes de producción deben actualizarse todos los consumidores de la misma identidad, pues la publicación original todavía usa su versión anterior. La aceptación de revocación aquí corresponde a la pareja nueva de staging.

## Alcance del nuevo prompt maestro

Este documento cierra la implementación y validación de acceso dentro de su alcance; no declara terminada toda la plataforma solicitada. La auditoría encontró y preservó BSIE (Moran, LISA, Gi*, KDE, vecindades, regresión y temporalidad), OR-Tools y los motores de comparación, finanzas y valoración. No encontró implementaciones de GWO, ACO, SSA o RBF en el código inspeccionado. Memory, Knowledge Graph, Cybernetic Engine, predicción general, Scenario Lab, BI y exportaciones documentales completas requieren desarrollo y aceptación propios. No se crean métricas, precios, pronósticos, sensores o GPS para rellenar estos pendientes.

La revisión también corrigió un fallo previo de Informes: la función de cierre estaba dentro del componente de dimensiones y el botón del informe no podía acceder a ella. Se trasladó al componente que conserva el proyecto y su estado; una regresión abre un proyecto existente con su acción de cierre. [Revisión de fuentes y hashes de motores conservados](evidence/unified-source-review.json).
