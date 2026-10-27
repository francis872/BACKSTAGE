# Backstage · preparación para usuarios reales

26 de octubre de 2026, Bogotá. El propietario confirmó **operación real con datos de usuarios**, completará la conexión administrativa de MongoDB Atlas y comunicó que no tiene proveedor de correo. Esta autorización permite preparar producción; no convierte la conexión Atlas de pruebas en un entorno productivo acreditado.

## Cambios realizados

- Inspección real de los proyectos `backstage-api` y `backstage-web`, sus variables por nombre, dominios y despliegues. No se publicaron valores secretos ni se consultaron documentos de usuarios.
- Preparación de tres variables exclusivamente para futuros despliegues productivos: `HEBRA_ACTIVE_KEY_ID`, `HEBRA_ENCRYPTION_KEYS` y `AUTH_PUBLIC_APP_URL`. Las claves son nuevas, aleatorias y exclusivas de producción; no se reemplazaron claves históricas ni las credenciales JWT o MongoDB existentes. Se verificó localmente un ciclo sintético de cifrado/descifrado. Esto no certifica custodia externa, rotación, restauración ni cifrado de documentos productivos reales.
- Instantáneas sin archivos privados: **317 archivos API y 188 web**, cotejados con el código aceptado. No se exige Docker ni una instalación local adicional.
- Comprobación de solo lectura de la versión pública anterior: web, proxy y API devuelven 200; el acceso a sesión sin credenciales devuelve 401. Las aplicaciones productivas no se redeplegaron y los alias no se reasignaron.

La versión pública anterior está en [Backstage](https://backstage-web-seven.vercel.app). La versión nueva con Community permanece en [Preview protegido](https://backstage-staging-web.vercel.app). Los enlaces corresponden a versiones y condiciones de operación diferentes.

## Dependencias comprobadas

| Pendiente | Evidencia y siguiente acción |
| --- | --- |
| Administración Atlas | Se encontró la integración MongoDB Atlas disponible pero sin instalar/conectar; la conexión indicada por el propietario continúa pendiente. Completarla antes de crear/verificar proyecto y clúster productivos, credenciales mínimas y restricciones de red. No se vuelven a pedir claves por el chat. |
| Separación de datos | Falta verificar el destino productivo administrativo y su separación de pruebas. No se copian datos sintéticos ni se rebautiza la base de pruebas como producción. |
| Respaldo/restauración | Configurar calendario, retención, custodia de claves y destino fuera del PC; restaurar en un destino aislado. Las restauraciones históricas de ensayo no acreditan este control productivo. |
| Correo de cuentas | El propietario no tiene proveedor. El adaptador existente soporta Resend; no están configurados `RESEND_API_KEY` ni `AUTH_EMAIL_FROM`. `AUTH_PUBLIC_APP_URL` ya quedó preparada. Faltan cuenta, remitente autorizado y entrega real comprobada. |
| Monitor independiente | Faltan servicio externo y destino concreto del administrador. El correo de recuperación no configura por sí solo las alertas del monitor existente, que utiliza un canal autorizado. No se enviaron mensajes. |
| Worker/capacidad/reversión | Validar la ejecución alojada con el destino productivo, objetivos de carga, aceptación del propietario y reversión de la pareja exacta que se publique. Las pruebas previas no certifican automáticamente un nuevo clúster ni otro despliegue. |

## Correo sin credenciales ficticias

Resend requiere un dominio que el titular controle y pueda verificar mediante DNS; el dominio compartido de una plataforma no sustituye esa verificación. La aplicación puede conservar su dirección actual `vercel.app`; la identidad de envío de correo requiere su propia autorización. El plan gratuito publicado limita los envíos a cien por día; debe revisarse su suficiencia antes de operar. No se contrató un plan, registró un dominio ni creó una cuenta externa en nombre del propietario.

Configuración pendiente en el almacén de secretos de **`backstage-api` → Production**:

| Variable | Valor que debe aportar la cuenta autorizada |
| --- | --- |
| `RESEND_API_KEY` | Clave de envío restringida al dominio autorizado; nunca en frontend ni en el chat. |
| `AUTH_EMAIL_FROM` | Remitente del dominio verificado. |
| `AUTH_PUBLIC_APP_URL` | Ya preparada con `https://backstage-web-seven.vercel.app`. |

Fuentes oficiales consultadas: [dominios verificados](https://resend.com/docs/dashboard/domains/introduction), [gestión de claves](https://resend.com/docs/dashboard/api-keys/introduction), [límites y precios](https://resend.com/pricing). La recuperación y verificación por correo permanecen desactivadas mientras el servicio no esté configurado; no se presenta una respuesta simulada como entrega.

## Activación pendiente

1. Completar la conexión administrativa Atlas ya pendiente y verificar los recursos productivos reales.
2. Aprovisionar credenciales mínimas, red, respaldos y restauración aislada; registrar la evidencia.
3. Configurar el proveedor/remitente de correo y el servicio/destino de alertas; comprobar recepción real.
4. Validar trabajador alojado, capacidad y recorridos funcionales en ese destino, sin datos sensibles de usuarios hasta contar con autorización para cada ensayo.
5. Construir la pareja API/web con secretos productivos y destino registrado, verificarla antes de asignar los alias públicos y comprobar la reversión compatible.

**No se ha activado la nueva versión para datos reales. NO_GO productivo continúa vigente.** Se conservó la autorización de operación real y no se pedirá nuevamente una aprobación genérica; faltan conexiones/configuración y comprobaciones concretas. [Preparación registrada](evidence/user-operations-preparation.json), [acceso público actual](evidence/user-operations-current-public-access.json), [comprobación final](evidence/user-operations-postflight.json), [publicación Preview](BACKSTAGE_COMMUNITY_PREVIEW.md).
