> Publicación vigente: la pareja original se sustituyó con autorización el 24/10/2026 y quedó verificada. [IDs actuales/anteriores y procedimiento de reversión productiva](PRODUCTION_RELEASE.md#reversión-conservada). Las herramientas de rollback de staging mantienen alcance exclusivo de staging. Las notas inferiores son históricas.

# Recuperación y reversión

La fuente anterior a Fase 1 está en el snapshot verificado `backstage-recovery-20261022T004525Z`, identificado por `.vercel/backstage-recovery-latest.json`. SHA-256 del archivo: `9a075d16b6e4adf02f4ee06debdccae7e43f596982f694ffd559c93de02c5aee`. Se probó extracción y comparación de sus 451 archivos. Es código/configuración no secreta; no contiene backup Atlas.

El árbol ya tenía cambios y archivos sin seguimiento antes de esta recuperación. HEAD no es por sí solo una copia íntegra del producto previo. No usar `git reset --hard`, `git clean` ni sobrescribir toda la carpeta para revertir este incremento.

Para una reversión futura, conservar primero el estado posterior, extraer el snapshot en otro directorio y comparar únicamente los archivos del [informe de revisión](evidence/phase-1-source-review.json). Aplicar selectivamente los cambios aprobados y verificar suites/build antes de considerar una publicación. Los archivos nuevos del incremento se revisan junto con sus consumidores; no se borran archivos anteriores por no estar en un commit.

Fase 1 no cambia colecciones, IDs o versión de esquema y no escribió en Atlas. Por ello no exige una migración inversa de datos. Una publicación futura y sus nuevas altas sí pueden crear documentos; restaurar código no los revierte. Backup y restauración aislada de Atlas siguen sin certificar y son un gate independiente antes de cambios de datos.

Revertir `wsServer` o la autorización fresca reintroduciría los riesgos SEC-01/SEC-02. No publicar esa reversión sin mantener una mitigación equivalente. No se ha ejecutado rollback remoto ni se ha alterado ningún despliegue durante esta fase.


## Fase 3 — reversión local selectiva

La entrada de fase está en `.vercel/backstage-phase-3-20261022T220444Z/sources-before.zip`, con 362 archivos y hashes verificados tras extracción. El puntero está en `.vercel/backstage-phase-3-latest.json`; [revisión](evidence/phase-3-source-review.json) identifica cambios, archivos nuevos y fuentes preservadas.

Antes de revertir, archivar de nuevo el estado actual. Comparar cada archivo modificado con `restore-validation`, revisar cambios posteriores del propietario y restaurar solo los fragmentos de Fase 3. Los archivos nuevos de esta fase se retiran solo tras comprobar que no contienen trabajo posterior. No usar `git reset --hard`, `git clean` ni copiar todo el snapshot encima de la carpeta de trabajo. No se ha ejecutado una reversión ni un borrado de archivos.

Este snapshot no contiene secretos ni datos de Atlas. Como no se publicaron paquetes ni se escribieron datos remotos, no hay despliegue ni operación de base de datos que revertir para esta fase. Una futura publicación requerirá un plan propio de rollback y verificación de backup.


## Fase 4 — reversión local selectiva

La copia previa está en `.vercel/backstage-phase-4-20261022T222845Z/sources-before.zip`: 390 archivos con restauración/hashes verificados, sin secretos ni datos. El puntero es `.vercel/backstage-phase-4-latest.json` y la [revisión de fuentes](evidence/phase-4-source-review.json) enumera cambios y archivos nuevos.

Archivar primero el estado actual y comparar cada cambio con `restore-validation`. Restaurar solo la Fase 4 y preservar trabajo posterior; no usar reset/clean global ni copiar todo el snapshot encima. No se ejecutó una reversión. La colección/índices de invitaciones no se aplicaron y no hay datos/despliegues remotos que revertir en esta fase. Si se autorizan escrituras futuras, su plan de respaldo y reversión debe cubrirlas expresamente.


## Staging del 22 de octubre

La versión verificada está en los proyectos aislados `prj_b8QR9h6618xv5xhAdAWLGheZhJsO` (API) y `prj_Adl43dUBZ79gEmihyrCVCyYC80eA` (web). Sus aliases son `backstage-staging-api.vercel.app` y `backstage-staging-web.vercel.app`; nunca usar los dominios originales para una retirada de staging. [IDs, manifiestos y destino Preview](evidence/staging-deployment.json).

Antes de sustituir staging: conservar el estado privado y los manifiestos, preparar/verificar otro Preview en esos mismos proyectos y mover solo sus aliases al despliegue verificado. Antes de retirarlo: comprobar los IDs exactos, retirar únicamente sus aliases y despliegues, y revocar solo sus credenciales de automatización. No se ejecutó una retirada porque staging debe quedar disponible. Los primeros despliegues automáticos de los proyectos nuevos no tienen variables de producción y no son un rollback funcional.

Las dos modificaciones de transporte se comparan con los paquetes de Fase 4 en [revisión](evidence/staging-source-review.json). Conservar los guards, HMAC y alcance de organización al sustituirlas. Producción original permaneció intacta; no necesita revertirse para retirar este staging. Los BSON privados contienen únicamente los documentos del ensayo, no el respaldo completo pendiente. Las trazas globales de seguridad se conservan; no borrar segmentos de la cadena compartida al limpiar un tenant.


## Intelligence Core: incremento de Fase 5

Snapshot previo privado `.vercel/backstage-phase-5-latest.json`: 458 archivos, archivo ZIP y hashes releídos. Preserva el código/configuración no secreta anterior; no sustituye un respaldo Atlas. [Revisión de fuentes](evidence/phase-5-source-review.json).

Los despliegues finales de Fase 5 y aliases están en [su evidencia](evidence/phase-5-deployment.json). La versión de staging anterior conocida es API `dpl_2ShVnBmz4kbDzJLDBcnVpvmBWzDJ` y web `dpl_E6pWkSunwf4wgiskxt3PnimRmgdV`; sus fuentes y pruebas históricas permanecen documentadas. No se practicó una reversión de aliases porque debe conservarse disponible el incremento validado. Los despliegues intermedios de compilación no son referencias de rollback.

Para revisar una reversión, conservar el estado actual, comparar solo los archivos de Fase 5 y mantener el lector v1/v2 y las autorizaciones. No eliminar los campos `analysis`, las versiones del motor ni los proyectos creados; un rollback de interfaz no debe recalcular registros v2 con v1. Si se retira temporalmente una función de reproducción, indicar que no está disponible y conservar el snapshot. Nunca usar reset/clean global sobre el árbol con cambios anteriores.

Este incremento no aplica cambios de esquema/índices. Los datos del ensayo se retiraron y permanecen sus trazas globales de acceso. El respaldo completo y su restauración independiente siguen pendientes antes de una publicación en los proyectos originales.


## Fase 5: extensión financiera y probabilística

La fuente previa está en `.vercel/backstage-financial-probability-20261024T023907Z/source.zip` (903 archivos comprobados). El puntero privado y [revisión de fuentes](evidence/phase-5-engines-source-review.json) conservan hashes anteriores/posteriores. Los Preview funcionales anteriores de staging son API `dpl_EXcJoTYMZMvGXHQMTCvH3niPkYbv` y web `dpl_H32TCaeVvcTepGsqEsSjFfzssFra`; no son los proyectos originales de producción. Una reversión debe revisar conjuntamente API/web, preservar las lecturas de registros y no eliminar las ejecuciones de versiones posteriores. No se ejecutó rollback.

El respaldo BSON de la integración solo cubre registros temporales de tenants nuevos; no es un backup completo de Atlas ni PITR. No se modificaron IDs, índices o esquema. Conservar contadores y auditoría global. [Estado y límites](PHASE_5_ENGINES_REPORT.md).


## Fase 5: reglas, GIS y rutas

Fuente previa `.vercel/backstage-spatial-rules-20261024T030337Z/source.zip`, 985 archivos comprobados. [Revisión de fuentes](evidence/phase-5-spatial-source-review.json) conserva antes/después y motores/identidad sin cambios. Preview anteriores funcionales: API `dpl_DXs7G6SUpsq7HXJJAeXGwwD4L4ki` y web `dpl_FgZ9NBxRZAsfRiotLkjDCjW6mdzU`. La reversión debe revisar conjuntamente API/web y conservar lectura de nuevos campos/versiones; el código anterior no aplica los nuevos controles de aprobación/configuración. No se ejecutó rollback ni promoción.

Los respaldos BSON son solo de datos temporales de integración, no copias completas de Atlas. No eliminar contadores ni auditoría global. No usar reset/clean o restauración global sobre el árbol de trabajo con cambios previos. [Resultado y límites](PHASE_5_SPATIAL_REPORT.md).


## Preparación comercial y operativa del 24 de octubre

La fuente previa está en `.vercel/backstage-readiness-20261024T035634Z/source.zip`, con 1011 archivos y relectura de hashes; SHA-256 `bb603b73e9cdcf65b518eb5096a784bead1c94eb8c6bc797b34dc75630b9cc24`. El respaldo lógico completo y su restauración aislada se describen en [el informe vigente](READINESS_REPORT.md); no restaurar esa copia encima del origen para revertir una interfaz.

La pareja conocida anterior de staging es API `dpl_CaecTh5V5RJLoAnYvmcxkcpxLXV9` y web `dpl_H6WVviGNj6QXG87kaKmnHvjFpBd7`. Los nuevos Preview son API `dpl_3BG4YRnq1uhMjBuYBKMMK1EQh8Yq` y web `dpl_96mKM6xEKxmouQc5KYjRnZc1UqJe`; la pareja final pasó aceptación integrada y ya tiene los aliases estables. La pareja anterior está registrada en `.vercel/readiness-rollback-baseline.json`.

`node scripts/verify-staging-rollback.js` muestra el plan sin conectar. Con `--apply`, se ejecuta después de la aceptación previa y exige ambos aliases asignados a la pareja nueva, valida IDs/proyectos/Preview y protección, asigna la pareja anterior y comprueba salud MongoDB y activos web. El bloque final intenta restablecer y comprobar la pareja aceptada incluso ante fallo. Rechaza proyectos de producción y nombres de alias ajenos. Las guardas locales y el ensayo remoto se comprobaron. El primer ensayo falló una comprobación inmediata; la pareja nueva se verificó saludable después. El ensayo final pasó con comprobación acotada de propagación y terminó con la pareja nueva restablecida. [Evidencia](evidence/readiness-rollback.json). El bloqueo inicial por créditos quedó superado.

Los parámetros y revisiones nuevos deben conservarse al retirar un Preview. Un código anterior puede ignorarlos y pierde el límite distribuido de acceso; no tratarlo como reversión de seguridad válida para producción. No se hicieron operaciones sobre los aliases de producción. Su comprobación remota final confirmó los proyectos, dominios y destinos originales sin cambios.


## UI/UX del 24 de octubre

La fuente previa de UI está en `.vercel/backstage-usability-20261024T154150Z/source.zip`: 105 archivos con relectura verificada. [Revisión](evidence/usability-source-review.json). Para retirar este incremento, comparar únicamente los archivos identificados y conservar el trabajo anterior. El proxy incluye además la corrección de JSON mal formado; conservar su rechazo 400 y las cabeceras de reintento al revisar una reversión. El respaldo completo actualizado y restaurado está documentado en [el informe vigente](READINESS_REPORT.md). No se restauraron datos sobre el origen durante el ensayo de aliases.
