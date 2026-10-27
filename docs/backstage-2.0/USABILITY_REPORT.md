> Esta interfaz también quedó [publicada en el dominio original](https://backstage-web-seven.vercel.app) el 24/10/2026. Nueve comprobaciones anónimas adicionales en Chrome real aprobaron acceso y registro en móvil/escritorio; [evidencia](evidence/production-browser.json). El recorrido humano sin ayuda sigue pendiente. [Publicación y límites operativos](PRODUCTION_RELEASE.md).

# BACKSTAGE: interfaz que explica cómo empezar

Incremento del 24 de octubre de 2026, Bogotá. El objetivo del propietario es que una persona sin experiencia pueda orientarse y completar sus tareas sin una explicación oral. Se mejoran los recorridos cotidianos y la ayuda global conservando la identidad, la portada orbital, los módulos y los motores existentes.

## Cambios visibles

- Inicio con tres tareas: ver un lugar en el mapa, organizar un trabajo y comparar opciones. Las tarjetas abren las páginas existentes; no crean datos ni muestran progreso ficticio.
- Buscador de ubicación del inicio en una sección desplegable. Las tareas principales aparecen antes de indicadores y herramientas de análisis.
- Título, propósito, regreso al Inicio y ayuda en cada pantalla. La ayuda explica pasos concretos y los términos proyecto, activo y fuente; indica las limitaciones del rol de consulta.
- Lectura cómoda: texto principal ampliado, controles legibles y preferencia conservada en el navegador. Si no se puede guardar esa preferencia, la interfaz sigue funcionando.
- Menú móvil con texto visible, foco de teclado, cierre con Escape y retorno al botón de apertura.
- Formularios con ejemplos, requisitos de contraseña y opción de mostrar/ocultar contraseña. Cambiar entre acceso y registro vuelve a ocultarla.
- Registro de activos con nombres de tipos en español, explicación de la ubicación opcional, cierre de formulario y retorno de foco. Se conservan la validación, el bloqueo durante guardado y la recuperación ante error.
- Prioridades y plazos del proyecto expresados en español; resultados que requieren recálculo identificados con una explicación. La selección activa puede quitarse sin eliminar registros.
- Pantalla de error en español con acción de recuperación; no muestra la excepción interna al usuario.

Los detalles de cálculo y las acciones especializadas siguen disponibles. Esta mejora no reemplaza conocimiento profesional sobre GIS, finanzas, estadística u operación sanitaria ni certifica automáticamente sus datos. Sin proveedor GPS, la planificación conserva su identificación con datos aportados.

## Comprobaciones

Verificación local: `npm test --prefix frontend`, `npm run build --prefix frontend` y `node frontend/scripts/soi-browser-smoke.mjs --usability`.

Pasaron 26 pruebas frontend y la compilación de 142 módulos. En Chrome local pasaron 76 comprobaciones de navegación, ayuda, lectura, formularios, comparación, proyectos, roles e invitaciones; 42 casos de tamaño de pantalla y cero errores de ejecución. La nueva vista de inicio se comprobó desde 320 hasta 1920 px, con lectura ampliada y sin desbordamiento horizontal de página. Los controles principales medidos mantienen al menos 44 px de alto.

Se comprobaron ayuda por teclado y retorno de foco, persistencia de lectura al recargar, rutas de las tres tareas, mostrar/ocultar contraseñas sin perder su valor, validación requerida, guardado ocupado sin duplicados, fallo recuperable con inventario conservado, diálogos y navegación móvil. Las capturas de inicio móvil/escritorio y ayuda móvil se revisaron visualmente. La prueba usa APIs declaradas como simuladas y bloquea proveedores externos; no acredita por sí sola persistencia real, cartografía o GPS físico.

[Evidencia del navegador](evidence/usability-browser.json), [pruebas](evidence/usability-frontend-test.txt), [compilación](evidence/usability-frontend-build.txt), [revisión de fuentes](evidence/usability-source-review.json).

Capturas: [Inicio móvil](evidence/usability-ui/guided-start-390.png), [Inicio de escritorio](evidence/usability-ui/guided-start-1440.png), [Ayuda móvil](evidence/usability-ui/plain-language-help-390.png).

## Integración y publicación

Nuevo Preview web preparado: `dpl_96mKM6xEKxmouQc5KYjRnZc1UqJe`, con 154 archivos comprobados, conectado a la API de staging `dpl_3BG4YRnq1uhMjBuYBKMMK1EQh8Yq`. El primer intento fue rechazado por autorización de Vercel; se renovó la sesión existente y se verificó acceso al proyecto antes del reintento correcto. No fue un rechazo de la revisión automática.

La aceptación real de la pareja final pasó: 20 grupos, 186 respuestas API observadas, cero errores del navegador, 69 eventos de auditoría verificados y datos temporales retirados. [Evidencia real](evidence/readiness-live.json). El enlace [staging](https://backstage-staging-web.vercel.app) ya apunta a esta versión protegida. Pasaron carga acotada y reversión/restablecimiento de staging; producción original se comprobó intacta.

La prueba de carga encontró que JSON inválido se presentaba como indisponibilidad del backend (502). El proxy ahora lo rechaza como dato inválido (400), sin enviarlo al backend ni mostrar el cuerpo o error interno. Conserva cuerpos válidos y cabeceras de reintento. Cuatro pruebas de transporte y la regresión completa de 327 pruebas backend aprobadas (una externa omitida) verifican la corrección; se repitieron carga e integración real sobre la pareja final. [Carga y seguridad](evidence/readiness-load-security.json), [regresión](evidence/readiness-backend-tests.txt).

La publicación en producción requiere los cierres de [preparación operativa](READINESS_REPORT.md) y la aceptación del propietario.

## Prueba de comprensión pendiente con una persona

La automatización verifica funcionamiento y navegación; no demuestra que una persona entienda el producto. Con datos de ensayo, pedir a alguien que nunca haya usado BACKSTAGE que complete lo siguiente sin instrucciones sobre los botones:

1. Entrar e identificar dónde empezar.
2. Buscar un lugar y reconocer cuál quedó seleccionado.
3. Registrar un recurso y comprobar que quedó guardado; corregir un campo requerido si falta.
4. Abrir un proyecto guardado y encontrar la ayuda sin asistencia.
5. Distinguir un resultado, su fuente y el siguiente paso disponible.

Registrar dónde duda, qué entiende de cada término y qué intenta cuando aparece un error. Corregir los obstáculos observados antes de considerar aprobada la comprensión. No se afirma que esa prueba humana ya haya ocurrido ni una certificación completa de accesibilidad.

## Preservación y reversión

Snapshot previo de 105 archivos frontend: `.vercel/backstage-usability-20261024T154150Z/source.zip`, SHA-256 `36d05a22c6d32f773e32c2cda0123931dd92116feb86d875dda9806cd0aa3d34`, relectura verificada. No incluye Atlas. La portada/globo, tokens de marca, autenticación cliente y comparador mantienen sus fuentes previas; cambios intencionales de interfaz se identifican en la revisión.

Para revertir, conservar el estado posterior y revisar selectivamente los archivos de este incremento. No restablecer todo el árbol con cambios anteriores ni tocar motores, IDs o datos. El harness local conserva sus comprobaciones y añade el caso `--usability`; sus salidas usan un prefijo independiente. La aceptación remota abre explícitamente el buscador desplegable del inicio antes de probar la ubicación emulada.
