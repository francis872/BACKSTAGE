# BACKSTAGE: despliegue y validación de staging

22 de octubre de 2026. Alcance aprobado mediante «hazlo»: desplegar los paquetes validados en staging con Atlas de pruebas y comprobar navegador, proxy, permisos, recorrido de trabajo y transporte. La publicación en los proyectos originales de producción queda fuera de este incremento.

## A. Resultado y acceso

Staging desplegado y validado. Ambos proyectos usan despliegues **Preview**, protegidos mediante Vercel Authentication en todos sus dominios. Para abrir la web, inicia sesión en Vercel con acceso al equipo del proyecto y después inicia sesión en BACKSTAGE. No se comparte el secreto de automatización en enlaces ni en el navegador.

| Servicio | Enlace estable | Despliegue verificado |
| --- | --- | --- |
| Web | [backstage-staging-web.vercel.app](https://backstage-staging-web.vercel.app) | `dpl_E6pWkSunwf4wgiskxt3PnimRmgdV` |
| API | [backstage-staging-api.vercel.app](https://backstage-staging-api.vercel.app) | `dpl_2ShVnBmz4kbDzJLDBcnVpvmBWzDJ` |

Los aliases propios de staging apuntan a esas versiones. El postflight confirmó protección, resolución y salud MongoDB a través de los dos enlaces; la web sirve los mismos archivos compilados que su URL inmutable. [Configuración y referencias sin secretos](evidence/staging-deployment.json), [postflight](evidence/staging-postflight.json).

Los proyectos originales `backstage-api` y `backstage-web` conservan sus destinos de producción y dominios `backstage-api.vercel.app` y `backstage-web-seven.vercel.app`. No se promovió esta recuperación a esos proyectos ni se cambiaron sus variables. La comprobación de destinos y dominios se repitió al terminar.

## B. Implementación

Se crearon exclusivamente `backstage-staging-api` y `backstage-staging-web`, con variables en Preview. Atlas coincide por huella con la conexión de pruebas autorizada y validada anteriormente. Se generaron claves de JWT y RPC propias de staging; no se copiaron claves de sesión de producción ni se configuró otro motor de datos. El frontend recibe la URL de la API de staging mediante su proxy del servidor.

Vercel convirtió automáticamente el primer despliegue de cada proyecto nuevo en su destino de producción inicial, aunque la CLI solicitara Preview. Esos dos despliegues iniciales pertenecen **solo a los proyectos nuevos de staging**, sin variables de producción. Se desplegó de nuevo, se verificó mediante API que los destinos finales fueran Preview y se asignaron únicamente los aliases de staging a las versiones verificadas. No se tocaron los aliases originales.

Respecto a los paquetes de Fase 4, cambiaron dos archivos de aplicación:

- `frontend/api/index.js`: credencial de automatización del backend tomada de configuración del servidor; no reenvía una credencial entrante del cliente. Rechaza redirecciones del upstream y conserva autenticación, organización y request ID.
- `backend/services/scientificRpc.service.js`: envía la credencial automática del proyecto solamente cuando el RPC usa su propio despliegue (`self`). Conserva firma HMAC, límites y rechazo de redirecciones; no envía esa credencial a endpoints científicos externos.

Las fuentes visuales, navegación, contexto y módulos de Fase 4 no cambiaron. Se compararon por hash los 221 archivos anteriores del paquete API y los 138 del paquete web: únicamente difieren los dos archivos de transporte indicados. Los paquetes desplegados verificaron sus manifiestos y locks: API 223 archivos, web 138. [Revisión de fuentes](evidence/staging-source-review.json), [integridad](evidence/staging-packaging.json).

Las herramientas nuevas son `scripts/staging-vercel.js`, `backend/scripts/verify-staging.js` e `inspect-staging.js`. La validación de escritura exige `--test-environment --apply`; por defecto imprime un plan. Los estados privados, claves, perfiles de Chrome, registros de build y respaldos permanecen bajo `.vercel`, excluidos por Git y por los paquetes.

La protección automatizada sigue el mecanismo de cabecera y cookie documentado por [Vercel](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation). La cookie de prueba quedó limitada al host; no se añadieron cabeceras globales que pudieran enviar credenciales a proveedores cartográficos.

## C. Verificación real

La ejecución aprobada `atlas-core-20261022232710-8a04a08843c3` pasó nueve comprobaciones, con 73 respuestas de API observadas desde dos navegadores reales y cero excepciones de runtime. Las APIs del navegador **no fueron interceptadas ni sustituidas por fixtures**. [Evidencia completa](evidence/staging-live.json).

| Recorrido | Evidencia obtenida |
| --- | --- |
| Hosting, proxy y acceso | Acceso anónimo rechazado por la protección del despliegue; salud autenticada con MongoDB; request ID transmitido; recurso privado sin JWT devuelve 401. |
| Cuentas | Dos registros nuevos a través del proxy; usuarios y organizaciones releídos desde otro proceso conectado a Atlas. |
| Entrada e identidad | Portada orbital conservada; login enviado desde el formulario real y sesión comprobada por `/auth/me`. |
| Territorio → activo | Botón de ubicación del dispositivo con coordenadas deliberadamente emuladas `[0, 0]`; registro desde el formulario de activos; coordenadas y activo confirmados en Atlas. No acredita GPS físico. |
| Análisis → proyecto | Dos activos, criterio y valores manuales declarados como ensayo; guardado, creación, recuperación y recarga desde navegador; un único proyecto tras repetir la creación; dos activos y territorio conservados. |
| Invitación | Generación del enlace desde administración, login del destinatario y aceptación desde otro navegador; organización y rol de analista confirmados; el otro tenant no puede leer el proyecto. |
| Rol y revocación | Cambio a Consulta desde administración; perfil actualizado al recuperar foco; JWT anterior pierde escritura y auditoría. Revocación desde UI cierra la sesión activa; la organización original del destinatario sigue accesible. |
| Auditoría y transporte | Cadena completa e íntegra, 19 eventos en el momento de la comprobación; hechos de activo, análisis, proyecto, invitación, cambio de rol y revocación presentes; código de invitación ausente de auditoría. Petición periódica real de sondeo observada con HTTP 200. |
| Motor científico | Node → RPC Python protegido → validación BSIE válida por el proxy real; llamada Python sin firma HMAC rechazada con 401. |

Cuatro pruebas locales adicionales del transporte y autenticación pasaron, incluyendo rechazo de credenciales entrantes para bypass y ausencia de envío del secreto del proyecto a un RPC externo. [Salida de pruebas](evidence/staging-transport-tests.txt). La compilación se realizó en Vercel para ambos paquetes; las pruebas locales completas y numéricas de Fase 4 permanecen como referencia, sin afirmar una nueva ejecución de todas ellas.

Las comprobaciones de desbordamiento horizontal de proyectos y auditoría pasaron a 390 y 1440 píxeles. Se conservaron seis capturas en [staging-ui](evidence/staging-ui/), incluida la entrada orbital. Las capturas de proyectos muestran el contexto y la página; no equivalen a una nueva revisión completa de cada pantalla o tamaño.

El primer intento del ensayo terminó por un selector que buscaba texto visible dentro de detalles plegados. Se corrigió el selector del ensayo y se repitió el recorrido; no hizo falta modificar la interfaz. Sus datos también se retiraron y el postflight verifica ambas ejecuciones.

## D. Datos, límites y recuperación

Se retiraron las cuentas, organizaciones, membresías, invitaciones, activos, comparaciones, proyectos y auditoría de esas organizaciones temporales, conservando un BSON privado antes de la retirada. Un proceso nuevo confirmó cero documentos de ambos ensayos en las nueve colecciones afectadas y cero documentos de esas organizaciones en otras 58 colecciones registradas. Los contadores compartidos avanzaron y no se retrocedieron.

Se conservan las trazas globales de seguridad producidas por registro/login: tres de la primera ejecución y cuatro de la segunda, identificadas por sus correos de prueba en el momento del postflight. No se borró ni se reescribió la cadena global compartida. La limpieza de los tenants no significa que se haya eliminado la evidencia global de acceso. [Postflight y hashes de respaldos](evidence/staging-postflight.json).

Este hosting opera mediante HTTP y sondeo; no ejecuta el servidor nativo con WebSocket persistente. La validación de hosting no certifica workers durables, sensores físicos, proveedor GPS, failover, rendimiento bajo carga ni todos los cálculos científicos. El respaldo de este ensayo tampoco certifica una copia completa o recuperación a un instante de Atlas.

Para retirar o sustituir staging se revisan exclusivamente los dos proyectos `backstage-staging-*`, sus aliases indicados y sus despliegues Preview. Los despliegues iniciales sin configuración no deben usarse como versión de recuperación funcional. Un rollback del código no restaura documentos; el respaldo completo y una restauración aislada siguen siendo requisitos separados antes de producción. [Plan de reversión](ROLLBACK.md).

## E. Siguiente alcance

Staging queda disponible para revisión del propietario. Antes de publicar en los proyectos originales: comprobar respaldo completo/restauración, diferencias de configuración, observabilidad y reversión; después, autorización específica de publicación. La Fase 5 de Intelligence Core continúa pendiente de implementación conforme a la hoja de ruta; no se declaró completada por desplegar este incremento.
