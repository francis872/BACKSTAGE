# Backstage · publicación protegida en Vercel Preview

26 de octubre de 2026, Bogotá. Publicación autorizada mediante «desplegar», después de acordar Preview como destino. **Frontend y API actualizados únicamente en los proyectos dedicados de staging; producción conserva su versión y sus alias anteriores.**

Acceso: [Backstage Preview](https://backstage-staging-web.vercel.app). La protección de Vercel requiere una cuenta autorizada; después se utiliza la autenticación propia de Backstage. No se incluyen secretos de acceso en el enlace ni se dejan cuentas sintéticas de demostración.

## Versión publicada y configuración

| Componente | Proyecto dedicado | Despliegue verificado |
| --- | --- | --- |
| Frontend | `backstage-staging-web` | `dpl_6c168X4e52wSU4DdvmKCmSkjFt6K` |
| API | `backstage-staging-api` | `dpl_3UCZHLatCJz2cnQ3EsA6gv9VNmnv` |

Se empaquetaron los archivos exactos del incremento aceptado: 317 archivos en la instantánea API y 188 en la web. Las instantáneas excluyen archivos de entorno, credenciales y datos privados; cada archivo conserva su huella. El frontend apunta al backend inmutable de esta misma publicación. Se conservaron las credenciales de autenticación existentes y se configuraron claves de cifrado persistentes exclusivas de Preview para documentos y MFA, sin rotar claves históricas existentes. No se incorporaron secretos al frontend.

Atlas mantiene la conexión previamente autorizada como pruebas. Se aplicaron índices aditivos y el marcador del esquema; no se eliminaron registros operativos para inicializarlo. Las validaciones posteriores crearon organizaciones y cuentas sintéticas identificadas y retiraron únicamente sus registros, conservando contadores globales y trazas de seguridad.

Los proyectos mantienen protección en todos sus despliegues. Las peticiones del navegador usan una cookie protegida, limitada al host; no se distribuye un encabezado de acceso a proveedores cartográficos. Las conexiones antiguas de WebSocket retiradas quedan deshabilitadas en esta compilación, conservando la actualización HTTP existente.

## Validación real después del despliegue

Pasaron **nueve comprobaciones de Preview**, sin interceptar ni sustituir respuestas de la API:

1. Ambos despliegues inmutables protegidos, salud MongoDB correcta y rechazo sin sesión de aplicación.
2. Registro remoto de dos organizaciones sintéticas propias del ensayo.
3. Proxy, documento canónico cifrado, idempotencia, aislamiento y disponibilidad MFA.
4. Candidatos Unicode, revisión humana, historial y reproducción; adaptadores normativo y económico.
5. Aceptación documental entre organizaciones y revocación por el origen.
6. Persistencia cifrada corroborada desde una conexión independiente a Atlas.
7. Inicio de sesión real en navegador, apertura contextual del documento y reproducción del análisis; 32 respuestas API observadas y cero errores de ejecución.
8. Panel sin desbordamiento horizontal en 390 y 1440 píxeles.
9. Eliminación remota del contenido y verificación de las cadenas de auditoría de ambas organizaciones.

La limpieza final retiró exclusivamente los datos sintéticos de esas organizaciones; su copia de comprobación se conserva privada. Los dos primeros ensayos detectaron errores en los verificadores —un metadato consultado en la ruta incorrecta y un selector de interfaz antiguo—, que se corrigieron sin modificar el código de la aplicación. Ambos ensayos también verificaron su limpieza; sus informes permanecen archivados y no cuentan como aceptaciones satisfactorias.

Después de la aceptación se actualizaron los dos alias dedicados de staging y se guardaron sus destinos anteriores. La comprobación final verifica los alias, acceso anónimo bloqueado, salud autenticada, rechazo sin sesión Backstage, integridad de las instantáneas y conservación de todos los destinos/alias productivos capturados al comienzo.

[Registro del despliegue](evidence/community-preview-deployment.json), [aceptación remota](evidence/community-preview-live.json), [comprobación final](evidence/community-preview-postflight.json), [captura del navegador](evidence/community-preview-desktop.png), [aceptación local previa](evidence/community-postflight.json), [alcance y límites de Community](BACKSTAGE_COMMUNITY.md).

## Uso y reversión

Para Community: Explorador Territorial → Capas del mapa → Propiedad Horizontal → Gestionar copropiedades → seleccionar objeto → Operaciones e historial → Community. Los activos canónicos generales lo ofrecen en su inspector. No se añade un destino principal independiente.

Se conservaron los identificadores anteriores de los alias de pruebas y una copia privada del estado previo. Una reversión de Preview debe reasignar exclusivamente esos dos alias a la pareja anterior, después de verificar la propiedad de los proyectos; no debe eliminar datos ni reemplazar claves. Esto no certifica reversión ni restauración productivas.

La jurisdicción normativa sigue acotada a las condiciones implementadas; los candidatos documentales requieren revisión humana. No se certifica renderizado WebGL, capacidad productiva, entrega de correo, GPS o satélite. Colab, PDF/OCR y búsqueda semántica no se añaden con este despliegue. **NO_GO productivo permanece vigente**: Atlas productivo separado, privilegios mínimos, custodia de claves, respaldo/restauración programados, monitoreo externo, capacidad, aceptación y reversión siguen pendientes de su aceptación específica.
