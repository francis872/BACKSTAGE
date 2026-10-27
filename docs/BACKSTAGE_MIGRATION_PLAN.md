# BACKSTAGE · adopción y reversión de Origin

## Cambios compatibles

No se ejecutan migraciones de colección, cambio de base de datos, borrado de datos operativos, rotación de secretos de sesión ni reemplazo de motores. MongoDB Atlas continúa como única persistencia. Los nuevos campos son aditivos: contacto opcional, contexto de candidatos, preferencias de visualización y publicaciones explícitas en la colección de eventos existente.

Las URLs heredadas se conservan. Los proyectos anteriores sin metadatos nuevos se abren mediante el adaptador `contextFromProject`; no se exige una conversión masiva. El almacenamiento de navegador está acotado al usuario/organización; si falla se usa memoria local de esa pestaña. Los resultados durables se recuperan del backend.

## Secuencia verificable

1. Conservar copia previa del código y referencia de la publicación original.
2. Ejecutar regresiones y compilación, luego pruebas de navegador con proveedores controlados y WebGL deshabilitado.
3. Publicar únicamente nuevos Preview protegidos de API y frontend.
4. Validar en Atlas confirmado como pruebas usando organizaciones nuevas identificables. Guardar evidencia, exportar sus registros y limpiar solo esos registros. Los contadores compartidos y trazas globales de seguridad permanecen.
5. Mover únicamente los alias de staging después de la aceptación técnica. Mantener la publicación original y verificar sus identificadores.
6. Para producción, preparar un nuevo expediente de publicación, respaldo y restauración adecuados al destino, configuración de proveedores, monitoreo y aceptación funcional. El script de la publicación anterior está fijado a aquella versión y no debe reutilizarse ciegamente para Origin.

La copia inicial de código de este incremento contiene 298 archivos, SHA-256 `5fbeecdb1338e4ea67f15a886f3d81de9a017cb0525e4fdf7defdaf2e5999757`; la referencia privada está en `.vercel/origin-before-latest.json`. Es código, no respaldo de Atlas. La referencia de staging anterior está en `.vercel/origin-staging-baseline-private.json`; contiene secretos y no debe publicarse.

## Reversión

Restituir los alias protegidos de staging a los despliegues anteriores registrados, sin borrar publicaciones o contacto de usuarios. No deshacer archivos ajenos ni restablecer globalmente un repositorio con cambios previos. La publicación original tiene su propio expediente de reversión. Los respaldos lógicos/restauraciones anteriores no equivalen a PITR administrado ni garantizan custodia fuera de este equipo.

## Límite de reversión tras revocación de sesiones · 25 de octubre de 2026

La pareja nueva de staging incorpora `session_version` y sesiones vigentes en HTTP/WebSocket. Después de revocar una cuenta, una reversión de interfaz debe conservar estos comprobadores en API. Volver a código que ignore la versión podría reactivar tokens revocados; no restablecer versiones a cero ni contraseñas anteriores. Antes de producción deben actualizarse todos los consumidores de la identidad compartida. El despliegue original permanece en su versión anterior. [Expediente actual y copia previa del código](BACKSTAGE_ACCOUNT_SECURITY.md).

## Reversión del backend de fase 2

La reversión debe mantener la exclusión de registros BCO en las API analíticas antiguas, la privacidad de posiciones, los comprobadores de sesión y la omisión de leases del outbox. El paquete del worker está preparado; su alojamiento continuo no se habilitó. Los tres índices aditivos no requieren borrar datos para retirar una interfaz. [Plan y límites actuales](BACKSTAGE_PHASE2_SECURITY.md), [aceptación](BACKSTAGE_PHASE2_TEST_REPORT.md).
