# BACKSTAGE · base territorial de Propiedad Horizontal

25 de octubre de 2026, Bogotá. Incremento inicial autorizado, implementado y probado con Atlas de pruebas. **No se ha desplegado este incremento en Vercel ni publicado en producción.** [Auditoría anterior al código](BACKSTAGE_UNIFIED_AUDIT.md), [plan y visión completa](BACKSTAGE_UNIFIED_INCREMENTAL_PLAN.md).

| Clasificación | Alcance |
| --- | --- |
| Implementado | Capa y panel del Explorador; trece tipos territoriales, jerarquía, geometría propia opcional, vínculo al ancestro, coeficientes declarados, creación/consulta/edición/archivo e idempotencia. |
| Probado | Reglas, HTTP/proxy, permisos vigentes, aislamiento, concurrencia real Atlas, recorrido de navegador con API PH real, recarga y tres anchos de pantalla. |
| Pendiente | Aceptación humana, renderizado WebGL cartográfico real y despliegue de este incremento en staging Vercel. |
| En espera de especificación | Personas/residentes, cartera/pagos, PQRS, portería, reservas, asambleas, mantenimiento operativo; motores y capas complementarias de la visión. |
| Bloqueado para producción | Administración Atlas, privilegios mínimos, respaldo programado/custodia y monitor externo con alerta recibida, según el NO_GO existente. |

## Uso

En **Explorador Territorial → Capas del mapa → Propiedad Horizontal → Gestionar copropiedades** se abre un panel al lado del mapa. Se conservan los cuatro destinos principales y la identidad visual. No hay página principal ni aplicación PH separada.

Registra una copropiedad con nombre y fuente; abre su ficha y utiliza «Agregar elemento aquí». El selector muestra únicamente los tipos permitidos en ese contenedor. Puedes recorrer los ancestros, editar nombre/fuente/geometría/coeficiente y archivar hojas. Los formularios no solicitan personas, cuentas bancarias ni pagos.

La ubicación es opcional. Usar la geometría del lugar seleccionado requiere marcar explícitamente la casilla. Una unidad sin geometría conserva su vínculo jerárquico: «Ver ubicación del contenedor» lleva al ancestro ubicado, sin convertir sus coordenadas en coordenadas propias de la unidad. Un objeto sin ancestro ubicado sigue disponible en el panel, sin aparecer como punto inventado.

La capa dibuja exclusivamente geometrías propias aportadas y conserva EPSG:4326 con orden longitud/latitud explícito. Acepta puntos, líneas y polígonos validados por el motor existente. La vista está limitada a las primeras 500 geometrías y comunica el truncamiento; los listados del panel tienen paginación de cincuenta registros. Búsqueda por extensión espacial y grandes carteras no están implementadas en esta fase.

## Modelo y reglas

Se reutiliza **locations**, su location_id y el identificador de activo `platform:<id>`. Los atributos de capa se guardan en `metadata.horizontal_property` versión 1, sin colecciones de activos, usuarios o auditoría paralelas. Tres índices aditivos cubren clave de creación única por organización, contenedor y copropiedad raíz.

Los índices están registrados en el inicializador compartido y se aplicaron al namespace de aceptación. No se ejecutó inicialización ni migración sobre las bases originales; deben incluirse explícitamente en la preparación del próximo staging.

Los tipos son: copropiedad, conjunto residencial, edificio, torre, bloque, unidad privada, zona común, parqueadero, infraestructura técnica, equipamiento, punto de recolección de residuos, acceso y área de mantenimiento. La raíz es copropiedad. El contrato del catálogo determina los padres permitidos. Tipo y jerarquía son inmutables después de crear; trasladar subárboles requiere una operación posterior especificada y validada.

Solo las unidades privadas reciben el coeficiente inicial opcional. Se admite de 0 a 100%, hasta cuatro decimales, y se almacena como entero en diezmilésimas de punto porcentual. La suma total usa esos enteros, no acumulaciones de punto flotante. Toda asignación, edición y archivo bloquea transaccionalmente la raíz compartida, evitando que dos escrituras concurrentes superen juntas el 100%. Las unidades sin coeficiente se contabilizan expresamente; no se presentan como reparto completo. Estos datos son declarados: no validan reglamentos, votos, cobros ni derechos.

Crear exige `Idempotency-Key`; repetir el mismo contenido devuelve el mismo activo y conserva un único evento de creación. Reutilizar la clave con otro contenido produce 409. Edición y archivo exigen revisión vigente; una revisión anterior produce 409. No se permiten cambios de organización ni referencias a entidades ajenas. Los endpoints genéricos de activos/ubicaciones rechazan metadatos PH fabricados y la edición/borrado que eluda estas reglas.

| Rol existente | Consultar | Registrar/editar | Archivar |
| --- | --- | --- | --- |
| admin | Sí | Sí | Sí, sin hijos activos |
| analyst | Sí | Sí | No |
| viewer | Sí | No | No |

Se revalidan usuario, organización, membresía y sesión. Las escrituras usan las transacciones y cadena de auditoría existentes. El archivo oculta el activo de los listados activos y conserva el registro y los eventos. La revisión es un control de concurrencia: **no incorpora restauración de cualquier versión histórica ni firmas digitales**. Hebra y sus contratos completos esperan la especificación complementaria.

## API compartida

Implementación: [reglas y catálogo](../backend/domain/horizontalProperty.js), [servicio transaccional](../backend/services/horizontalProperty.service.js), [router de activos existente](../backend/routes/assets.routes.js), [panel](../frontend/src/components/HorizontalPropertyLayer.jsx) e [integración del mapa existente](../frontend/src/pages/NativeTerritorialExplorer.jsx). Las pruebas cubren [reglas](../backend/domain/horizontalProperty.test.js), [HTTP/proxy](../backend/domain/horizontalPropertyHttp.test.js) y [referencia espacial](../frontend/tests/horizontalProperty.test.mjs).

Base `/assets/layers/horizontal-property`, detrás del proxy existente `/api`. Contrato añadido al OpenAPI compartido `/operations/openapi`.

| Método y ruta relativa | Función |
| --- | --- |
| GET /catalog | Tipos, padres permitidos, CRS y precisión |
| GET / | Raíces; parent_id para hijos o root_id para la copropiedad; limit/offset |
| GET /geojson | Geometrías propias activas, total y señal de truncamiento |
| GET /:id | Ficha, ancestros, referencia espacial explícita y suma declarada |
| POST / | Crear con clave idempotente; 201 o 200 al repetir |
| PATCH /:id | Editar campos permitidos con revision |
| POST /:id/archive | Archivar hoja con revision, solo admin |

La procedencia registra fuente aportada, actor, hora de registro, CRS y estado no verificado. No inventa fecha de observación ni certificación de la fuente. El tipo se mantiene dentro de los activos originales; SOI conserva su función sanitaria.

## Verificación y límites

Regresión: **404 pruebas backend, 403 aprobadas, una integración externa optativa omitida; 35 frontend aprobadas; cero fallos**. El build Vite pasó con advertencias de tamaño de chunks existentes. El primer build dentro del sandbox falló por acceso a las rutas de esbuild; la compilación autorizada fuera de ese límite pasó, sin instalar dependencias.

La aceptación integrada usa un namespace Atlas nuevo con marcador de propiedad y solo datos sintéticos. Ejecuta ocho comprobaciones, incluyendo concurrencia transaccional, repetición idempotente, 404/403 entre organizaciones, bloqueo de edición/borrado genérico, revisión y auditoría. El navegador ejecuta nueve comprobaciones: alta, jerarquía/coeficiente, edición, recarga, anchos 320/390/1440, archivo y degradación a consulta. Después se retira exclusivamente la base temporal marcada y se comprueba que quedó vacía. [Resultado](evidence/horizontal-property-live.json).

La interfaz y sus llamadas PH fueron reales contra Atlas mediante API local. El resto de respuestas ambientales del portal se aisló; no se prueba aquí el login completo ni todos los módulos. WebGL se deshabilitó y las solicitudes cartográficas externas se bloquearon: la captura demuestra el panel y su recuperación sin aceleración, **no renderizado cartográfico real**. [Captura](evidence/horizontal-property-desktop.png).

[Backend](evidence/horizontal-property-backend-tests.txt), [frontend](evidence/horizontal-property-frontend-tests.txt), [build](evidence/horizontal-property-build.txt). Para repetir: `node scripts/verify-horizontal-property.js --apply`, usando exclusivamente la conexión de pruebas cuya huella ya está autorizada. Sin --apply muestra el plan; no crea recursos. La prueba utiliza Node, dependencias existentes y Chrome instalado, sin Docker ni instalaciones nuevas. No modifica el clúster productivo ni despliega la aplicación.

El [postflight](evidence/horizontal-property-postflight.json) vincula las fuentes y registros de esta aceptación con hashes y comprueba que veinticinco archivos científicos/compartidos del paquete anterior permanecen idénticos. Esta comprobación tiene ese alcance concreto; no sustituye la aceptación del resto de la visión.

No se implementan las otras capas por inferencia: el propietario pidió esperar el complemento. Se conserva [la visión completa y sus dependencias](BACKSTAGE_UNIFIED_INCREMENTAL_PLAN.md) y el [NO_GO productivo](BACKSTAGE_PRODUCTION_GO_NO_GO.md).
