# Publicación de BACKSTAGE — 24 de octubre de 2026

Publicación autorizada mediante «despliega el programa», completada el 24 de octubre a las 13:33 de Bogotá (18:33 UTC). [Abrir BACKSTAGE](https://backstage-web-seven.vercel.app). [Salud de la API](https://backstage-api.vercel.app/health).

## Resultado comprobado

Se publicaron los motores y la interfaz previamente aceptados en staging dentro de los dos proyectos originales de Vercel. Se conservaron dominios, protección existente, credenciales, conexión MongoDB Atlas, colecciones, IDs y esquema 2. No se ejecutaron migraciones, creación de cuentas, envíos de formularios ni escrituras operativas durante la aceptación de publicación. El runtime utiliza MongoDB Atlas.

**La conexión existente de estos proyectos coincide con el Atlas que el usuario identificó como entorno de pruebas. Staging y la publicación comparten esa conexión. No se creó ni se certificó una base de producción separada.** Publicar el código no resuelve esa separación operativa.

| Componente | Proyecto original | Despliegue publicado |
| --- | --- | --- |
| API | `backstage-api` | `dpl_FfGqHQQk5CEXGjcsje9yqaUSC1VE` |
| Web | `backstage-web` | `dpl_BCE7C3mvdoR4ftrRAahTiE78XHpo` |

La web apunta a la URL inmutable de esa API. Las variables persistentes de los proyectos no se sobrescribieron. El despliegue web lleva un override de `BACKEND_URL`; los dos valores de compilación WebSocket antiguos se vaciaron para evitar dirigir sesiones al servidor retirado de Render. Se conserva la alternativa existente de consultas HTTP al mismo origen. Las reconstrucciones futuras deben utilizar el procedimiento de publicación que conserva esas opciones.

Los archivos de ejecución coinciden con los paquetes de staging aceptados. Los cambios adicionales son herramientas de verificación, un preflight de compilación de solo lectura y sus entradas en los scripts del paquete preparado. El preflight comprobó Atlas, esquema 2, 75 colecciones y presencia de secretos válidos sin mostrar sus valores. La primera preparación se detuvo al detectar herramientas de verificación actualizadas; se distinguieron explícitamente de los archivos de ejecución antes de construir. No hubo cambio de dominios durante ese intento.

## Respaldo y aceptación

Antes de reasignar dominios se creó `atlas-full-20261024182953-8eb7e9315a77`: una base accesible, 75 colecciones, 149 documentos y 238 índices, con lecturas de un mismo snapshot y sin escrituras en origen. Copia AES-256-GCM releída y descifrada; rechazo de alteración comprobado. SHA-256 cifrado: `03a644f59eb04abc63ce862f934e6e06e35c36d14018e53f8911ebc73457c849`.

El archivo y su clave separada permanecen en directorios privados ignorados por los paquetes. Este respaldo nuevo no volvió a restaurarse; la restauración aislada completa del respaldo anterior ya había aprobado ese mismo día. No acredita respaldo administrado, PITR, retención programada o custodia fuera del equipo.

- Catorce comprobaciones previas y catorce posteriores a la promoción: IDs/proyectos/dominios correctos, salud de API y proxy, MongoDB saludable, correlación de solicitudes, rechazo anónimo, activos SPA, ausencia del destino antiguo de Render, firma obligatoria del runtime Python y cálculos sintéticos de validación geográfica, regresión y rutas con validación independiente.
- Nueve comprobaciones en Chrome real desde el dominio público, sin interceptar API ni enviar formularios: identidad orbital, entrada al acceso, etiquetas claras, mostrar/ocultar contraseña, registro y ausencia de desbordamiento horizontal en 320/390/768/1440 px. Cero excepciones del navegador y cero respuestas fallidas del sitio. Seis capturas.
- La aceptación autenticada y las pruebas de negocio completas siguen respaldadas por los veinte grupos de integración real de staging. La comprobación pública de esta publicación fue anónima y de solo lectura; no se afirma una nueva aceptación humana de los flujos.

[Publicación e IDs](evidence/production-release.json), [prepromoción](evidence/production-prepromotion.json), [postflight público](evidence/production-postflight.json), [navegador real](evidence/production-browser.json), [respaldo actualizado](evidence/production-atlas-backup.json), [restauración anterior](evidence/readiness-atlas-backup.json).

## Reversión conservada

Pareja anterior: API `dpl_93uunWbhwbeQdh3WtqkLxwmrdEjF`, web `dpl_5sviMLHKHcFxekswJNmqtWZecp9E`. No se eliminaron esos despliegues. `scripts/release-production.js` conserva ambos destinos y permite `rollback --apply --cli <ruta-del-cli>`, promoviendo primero la web anterior y después la API anterior, seguido de comprobación de dominios y salud.

La promoción incorpora ese procedimiento como recuperación ante fallos de aceptación. No fue necesario activarlo. La reversión de producción no se ensayó interrumpiendo esta publicación; el ensayo remoto previo fue exclusivamente de staging. Volver al código anterior no revierte datos ni ofrece necesariamente los nuevos controles de seguridad y reglas. No usar el helper de staging para modificar producción.

## Trabajo operativo pendiente

1. Separar Atlas de producción del entorno de pruebas y aplicar credenciales con privilegios mínimos. La publicación mantiene la conexión anterior; no cargar información operativa sensible hasta acordar y comprobar el destino definitivo.
2. Validar con el propietario los flujos cotidianos y observar a una persona nueva usarlos sin instrucciones. Las pruebas automatizadas no demuestran esa comprensión.
3. Proveer monitoreo continuo independiente del equipo Windows y entregar sus alertas al administrador. La tarea y el panel existentes supervisan staging y no acreditan cobertura productiva 24/7.
4. Programar respaldos, retención, custodia de copia/clave fuera del equipo y recuperación administrada según el servicio contratado.
5. Completar dimensionamiento, controles de abuso de borde y aplicación de vigencia en todos los puntos de aprobación que corresponda. Sin proveedor GPS, las rutas siguen identificadas como planificación con datos aportados o simulados.

El [informe de preparación](READINESS_REPORT.md) conserva la evidencia histórica y distingue estos pendientes de la publicación del código ya realizada.
