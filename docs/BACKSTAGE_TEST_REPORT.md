# BACKSTAGE · validación Origin

## Incremento de acceso e Informes · 25 de octubre de 2026

- Backend: 355 pruebas, 354 aprobadas y una integración externa omitida; [registro](evidence/unified-backend-tests.txt).
- Frontend: 33 aprobadas; [registro](evidence/unified-frontend-tests.txt). [Compilación aprobada](evidence/unified-frontend-build.txt), con advertencia existente de tamaño de MapLibre.
- Navegador aislado: [13 comprobaciones de acceso](evidence/account-security-browser.json) y [21 de Origin](evidence/origin-browser.json), sin errores de ejecución. Datos y API simulados, sin envío real de correo.
- Atlas y Preview reales: [siete grupos de seguridad](evidence/account-security-live.json) y [once de Origin/Mapbox/GIS](evidence/origin-live.json), sin interceptar API y con limpieza aprobada. La prueba concurrente del mismo enlace obtiene exactamente un 200 y un 410.
- [Postflight desde nueva conexión](evidence/unified-postflight.json): alias y protección correctos, limpieza confirmada, código publicado coincidente y producción original conservada.
- [Hashes de motores conservados](evidence/unified-source-review.json): 24 archivos científicos/compartidos sin cambios; sin reemplazar matemáticas.

El envío de correo y la aceptación humana de facilidad de uso siguen pendientes. [Diseño y límites de seguridad/reversión](BACKSTAGE_ACCOUNT_SECURITY.md). Los resultados Origin posteriores conservan su fecha histórica.

24 de octubre de 2026, Bogotá. Resultado final del incremento en staging protegido: **aprobado en el alcance siguiente**. La publicación original mantiene sus despliegues. Mapbox tiene conexión real y sugerencias verificadas. No se certifican parcela municipal, GPS de flotas, fuentes orbitales o una nueva integración de modelos.

## Comprobaciones

| Comprobación | Resultado | Alcance |
| --- | --- | --- |
| Backend: `npm test` | 345 pruebas: 344 aprobadas, una omitida, cero fallos | Regresión local aislada de Atlas y de credenciales Mapbox; la prueba omitida es una integración vial externa optativa |
| Frontend: `npm test` | 32 aprobadas, cero fallos | Contexto, almacenamiento, contratos, contraste y renderizado del comparador con fuente estructurada |
| Compilación Vite | Aprobada | Advertencia de tamaño del bundle cartográfico; no se oculta ni se presenta como medición de carga |
| Navegador con API controlada | 21 grupos aprobados, cero excepciones de ejecución | WebGL deshabilitado, fallo local del mapa, navegación, proyecto, comparación, rutas, Cuenta, Organización, Feed, lectura cómoda, proveedor caído y recarga; cinco anchos de 320 a 1920 px |
| Navegador real + Atlas de pruebas | 11 grupos aprobados, cero excepciones de ejecución | Sin interceptar API, proveedores reales, proyecto Quibdó 2040, GIS, comparación, exploración regional, ruta vial y mapa |
| Alias estables de staging | Aprobados | Salud 200 con acceso autorizado; SSO Vercel devuelve 302 sin acceso; la aplicación exige sesión con 401 |

La prueba del comparador reprodujo primero la excepción de React al renderizar un objeto `source`. La prueba del almacenamiento reprodujo las excepciones al bloquear lecturas/escrituras. Se corrigieron antes de consolidar los resultados. El renderizado de servidor del componente en la regresión puede advertir sobre `useLayoutEffect` del modal: la aplicación sigue siendo cliente, no se acredita hidratación SSR.

El vínculo de comparación a proyecto se amplió con `analysis_run_id` explícito. Se actualizó la regresión anterior para exigir rechazo atómico de un destino inexistente; se mantienen las comprobaciones de aislamiento, identidad de ambos activos y evidencia matemática intacta. No se cambió el motor para acomodar la prueba.

## Recorrido real final

Ensayo `atlas-core-20261025032443-c64faad01e45`, de 22:24 a 22:26 Bogotá, 24 de octubre. Tres organizaciones nuevas identificables, con cuentas de ensayo y permisos reales. Se comprobó perfil sin elevación de privilegios, Feed privado/compartido, comentarios y denegación de escritura al rol de consulta.

El geocodificador devolvió Quibdó en Colombia, Yutó como localidad de El Atrato e Istmina en Colombia. La consulta ampliada de Yutó evita confundir un parque homónimo con la localidad. Se conservan tipo y procedencia, sin afirmar que la geocodificación verifica un predio. La parcela de la Alcaldía no pudo acreditarse y no se inventó.

Desde el navegador se seleccionó una sugerencia real de Mapbox para Quibdó, sin pulsar Buscar, y se creó Quibdó 2040 reutilizando el territorio. Se comprobó la atribución visible y su conservación en Atlas con almacenamiento permanente. Las coordenadas de Mapbox y Nominatim representan coincidencias de sus respectivos proveedores; no identifican necesariamente el mismo punto del municipio. Una distancia esférica calculada a partir de coordenadas reales sirvió como criterio declarado de comparación; no es distancia vial. La evidencia GIS/comparación quedó vinculada al proyecto existente y pudo reproducirse. Se cambió entre herramientas y se recargó, recuperando la comparación vigente. Después se exploraron Yutó e Istmina manteniendo proyecto y sitio canónico.

Se calculó una ruta vial real Quibdó–Yutó, se guardó en Atlas con fuente y hash, y se comprobó el vínculo al proyecto y la denegación desde otra organización. El mismo canvas cambió entre 3D, Globo y 2D; se comprobó representación cartográfica real y ausencia de desbordamiento a 390 px. Globo usa la proyección del motor en la extensión actual, no implica mostrar siempre el planeta completo. Chrome utilizó renderizado WebGL por software para el ensayo; no equivale a una medición de GPU en dispositivos físicos.

El ensayo final pasó los once grupos, incluido Mapbox. La primera comprobación de persistencia de Mapbox esperaba una fuente plana; el proyecto existente conservaba el objeto de fuente completo. Se ajustó la prueba a los dos formatos originales admitidos y se verificaron atribución y almacenamiento sin migrar las entidades. Los intentos y su limpieza se conservaron. El ensayo Origin previo sin Mapbox, `atlas-core-20261025030706-baf3687c767a`, también permanece archivado. Un intento ampliado anterior recibió indisponibilidad del proveedor al buscar Istmina; se conservó el proyecto y se limpió el ensayo. La UI ahora distingue ese fallo e invita a reintentar, sin datos de reemplazo. Otra ejecución previa reveló la recuperación tardía que sobrescribía el comparador y fue corregida con una regresión específica. Los informes de intentos anteriores se conservan con su identificador; no se descartan para presentar solo resultados favorables.

## Evidencia y limpieza

[Sugerencias reales de Mapbox mientras se escribe](evidence/origin-live-ui/atlas-core-20261025032443-c64faad01e45/mapbox-autocomplete.png). El resultado se eligió y su fuente, atribución y almacenamiento permanente se verificaron en el proyecto de Atlas.

- [Prueba real final](evidence/origin-live.json), [prueba de interfaz controlada](evidence/origin-browser.json) y [postflight de staging](evidence/origin-postflight.json).
- [Comparación real](evidence/origin-live-ui/atlas-core-20261025032443-c64faad01e45/comparison-real-evidence.png), [mapa 2D](evidence/origin-live-ui/atlas-core-20261025032443-c64faad01e45/map-2d.png), [mapa 3D](evidence/origin-live-ui/atlas-core-20261025032443-c64faad01e45/map-3d.png), [Globo](evidence/origin-live-ui/atlas-core-20261025032443-c64faad01e45/map-globo.png) y [móvil](evidence/origin-live-ui/atlas-core-20261025032443-c64faad01e45/map-mobile.png).
- [Despliegue Origin](backstage-2.0/evidence/origin-deployment.json) y [manifiesto de cambios respecto de la copia inicial](evidence/origin-change-manifest.json).

La limpieza final pasó con selectores de propiedad exactos y transacción. Se exportaron primero los registros propios a BSON privado: SHA-256 `f5d702ddf100cb4b4166775ddffc8445566223043752b65176e3ebe77d1bcd28`. Se retiraron únicamente esos registros; contadores compartidos y trazas globales de seguridad permanecieron. El BSON de ensayo no es un respaldo completo de Atlas. La conexión se confirmó como pruebas y sigue compartida con la publicación anterior; no se presenta como una base productiva aislada.

Los diez contratos compartidos incluidos en la copia inicial conservan sus bytes. La comparación de 243 archivos de código/contratos contra los manifiestos de los Preview confirmó coincidencia. No hubo migración de esquema. Las pruebas anteriores de carga y restauración de la publicación original mantienen su alcance histórico; este informe no las atribuye a una nueva campaña de carga de Origin.

## Activación Mapbox y límites pendientes

Mapbox tiene cuatro pruebas de adaptador con proveedor controlado: configuración incompleta, respuesta normalizada permanente, fallos sin secretos y validación de entrada. Después de recibir el token del usuario se configuró el backend local y el API de staging: variable sensible para el token, destino Preview, sin modificar producción. Una consulta real con `permanent=true` devolvió HTTP 200 y Quibdó, Colombia; el navegador obtuvo y seleccionó sugerencias sin pulsar Buscar y mostró atribución. [Evidencia de activación](evidence/mapbox-activation.json). Una regresión adicional comprueba que la atribución y permiso declarado de almacenamiento se conservan sin aceptar claves o afirmaciones de verificación del predio. El token está ausente de los 18 archivos de texto del frontend compilado inspeccionados.

También quedan aceptación humana, accesibilidad integral, transferencia formal de titularidad, sesiones avanzadas, proveedores comerciales/espaciales/IA y preparación de un nuevo expediente de producción. El [estado de implementación](BACKSTAGE_IMPLEMENTATION_STATUS.md) delimita esas capacidades.
