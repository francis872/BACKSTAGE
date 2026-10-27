# Recorrido global implementado

El incremento aprobado de Fase 3 reutiliza Centro de operaciones, Explorador territorial, Activos, Comparador y Proyectos. No crea otro shell, motor de puntuación ni repositorio de proyectos. BACKSTAGE conserva su identidad; SOI y Clean Com mantienen sus accesos propios.

## Uso

1. Seleccionar un territorio en el explorador o abrir un activo en el mapa.
2. En **Activos → Analizar activo**, comenzar una comparación configurable con ese activo. Si ya hay territorio seleccionado, conservarlo; en caso contrario, usar el punto real del activo. Las mediciones anteriores no se reutilizan como evidencia de un análisis nuevo.
3. Añadir alternativas, criterios, unidades, fuentes y observaciones. Las coordenadas no generan puntuaciones. Guardar el resultado crea un snapshot de la organización.
4. Pulsar **Crear proyecto desde este análisis**. El servidor vincula una vez ese snapshot a un proyecto del repositorio existente.
5. En **Proyectos → Recuperar análisis**, recuperar candidatos, territorio y evidencia. Recargar, volver atrás/adelante o abrir el enlace con `project` y `comparison` conserva o recupera las referencias.

Los activos sin un punto utilizable conservan su acceso cartográfico cuando tienen geometría, pero este incremento no convierte líneas/polígonos en observaciones puntuales para analizarlos.

## Persistencia y autorización

MongoDB Atlas es la única persistencia de aplicación. La colección existente `soi_comparisons` guarda la entrada y el resultado calculado por el servidor. Su campo aditivo `project_analysis_run_id` referencia el proyecto existente en `analysis_runs`. No se copian activos ni se renumeran IDs.

La creación del proyecto y la actualización del enlace comparten una transacción y sesión MongoDB. Un reintento del mismo snapshot devuelve el proyecto vinculado; un enlace cuyo proyecto falta produce 409. El reintento sigue funcionando aunque un activo se haya retirado después. La garantía en Atlas depende del soporte transaccional existente y se debe comprobar en staging antes de publicar.

El proyecto guarda `metadata.territory`, `selected_assets`, `comparison_snapshot_id`, `comparison_candidates`, `analysis_context` y `map_context`. Los activos se resuelven nuevamente por organización y su identidad compuesta; solo se guarda una descripción de la asociación, nunca una copia completa del inventario. `location_id` corresponde exclusivamente al inventario general. Las observaciones permanecen en el snapshot original.

El proyecto comienza `pending`. Este enlace no acredita probabilidad, riesgo, recomendación ni ejecución operativa; tampoco transforma una suma ponderada en resultados del motor territorial histórico. Crear el proyecto por este nuevo enlace no emite todavía el evento histórico `project.created`: el listado lo descubre al consultarlo. Su incorporación a auditoría/eventos durables queda para los núcleos correspondientes.

Las lecturas y escrituras consultan membresías vigentes. Solo admin/analyst crean snapshots y proyectos. IDs, tenant, autor y puntuaciones enviados por el cliente no sustituyen las decisiones del servidor.

## Contexto del navegador

El almacenamiento se separa por usuario y organización: `backstage_operational_context:<user_id>:<organization_id>`. Conserva IDs compuestos, coordenadas cero válidas y referencias al snapshot/proyecto. El contexto histórico sin propietario identificable no se restaura automáticamente; su registro permanece intacto hasta limpiar la sesión/contexto correspondiente. Los borradores configurables conservan su clave histórica de sesión, ya separada por usuario/organización.

Cada entrada de navegación registra su contexto y propietario. La URL contiene solamente referencias, no evidencia ni credenciales. El servidor recupera el proyecto y el snapshot con autorización. Un error temporal de proyecto conserva la referencia y ofrece reintentar; un 401/403/404 retira el contexto local. Cambiar de territorio invalida las referencias anteriores que no pertenecen al nuevo contexto.

Editar candidatos, criterios u observaciones invalida la acción de crear desde el resultado guardado. Guardar después crea una nueva versión y retira del contexto la referencia al proyecto de la versión anterior. El proyecto anterior sigue vinculado a su snapshot original.

## Verificación

`npm test --prefix backend`, `npm test --prefix frontend`, `npm run build --prefix frontend` y `npm run test:workspace-ui --prefix frontend`. La prueba de navegador usa API aislada y bloquea proveedores externos; la integración HTTP ejecuta rutas, servicios y repositorios reales contra un fixture MongoDB transaccional. Ninguna de ambas acredita persistencia en Atlas o datos reales de proveedores.
