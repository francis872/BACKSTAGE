# BACKSTAGE · permisos de fase 2

25 de octubre de 2026. Se mantienen exclusivamente `admin`, `analyst` y `viewer`. El propietario de un registro es un atributo, no un nuevo rol. Todos los accesos requieren sesión y membresía vigente; un ID o una organización en el cuerpo no concede acceso.

| Recurso/acción | admin | analyst | viewer | Condiciones adicionales |
| --- | --- | --- | --- | --- |
| Catálogo, OpenAPI y metadatos de fuentes | Sí | Sí | Sí | Organización vigente; sin credenciales |
| Crear flujo | Sí | Sí | No | Contrato, cuota y proyecto propio si se vincula |
| Consultar flujo normal | Sí | Sí | Sí | Misma organización, no vencido ni archivado |
| Consultar posiciones | Sí | Solo autor | Solo si fuera autor | Misma organización; consentimiento y retención |
| Editar/encolar | Sí | Solo autor | No | PENDING y revisión actual |
| Cancelar | Sí | Solo autor | No | PENDING/QUEUED/RUNNING y revisión actual |
| Archivar | Sí | Solo autor | No | Estado terminal; conserva auditoría |
| Reintentar | Sí | Solo autor | No | Fallido/cancelado/vencimiento de ejecución; crea registro nuevo |
| Repetir | Sí | Solo autor | No | Estado terminal; crea registro nuevo |
| Aprobar defensa | Otro administrador | No | No | No autor, terminado, una evaluación defensiva, hash y revisión exactos |
| Ejecutar tareas en worker | En nombre del solicitante | En nombre del solicitante | No | Cuenta/organización activas, permiso escritor actual, lease y catálogo vigente |
| Crear/editar/archivar fuente | Sí | No | No | Organización propia, configuración sin secretos; edición/archivo con revisión |
| Ingresar evento de integración | Sí | No | No | Fuente activa propia; ID externo con contenido consistente |
| Consultar/procesar eventos de integración | Sí | Sí | No | Evento y fuente de la misma organización; transición permitida |

Una cuenta que perdió su rol escritor puede conservar lectura de evidencias normales, pero no continuar escribiendo. Los workers cancelan cálculo ante pérdida de autorización y no guardan resultados finales con permisos revocados. Los flujos privados de posiciones mantienen su restricción incluso al consultar directamente otras API: la analítica heredada excluye todo registro BCO.

`available_actions` ayuda al consumidor a presentar acciones coherentes. Ocultar botones no autoriza: el servidor repite la política, consulta estado y exige revisión. Denegación por defecto para acciones/roles desconocidos. Los proyectos, activos, SOI, Feed y demás dominios conservan sus controles originales; esta matriz no crea permisos nuevos sobre ellos.

La auditoría diferencia al administrador que actúa del autor original. Las transiciones de worker se identifican como trabajo en nombre del creador. Se guardan correlación, revisión y hashes, sin copiar parámetros, trayectorias, configuración privada o credenciales.
