# Clean Com — versión 0.1

Capacidad de Backstage para estudiar sistemas de recolección de residuos. Empresas Varias 2025 es un caso configurado, no una regla incorporada al motor.

Resultados del primer caso y límites: [auditoría completa documentada](../docs/CLEAN_COM_AUDIT.md). En la carpeta IDE se incluyen los artefactos procesados; la geodatabase original permanece en la carpeta principal. Para regenerar desde la carpeta IDE, indicar su ruta absoluta con `--source`.

## Integración encontrada

Antes de esta versión existía `frontend/cleancom/Proyecto_grado.gdb`, sin página, rutas, servicios, controlador ni modelo Clean Com. Backstage usa React/Vite con navegación en `frontend/src/App.jsx`, APIs internas por `apiRequest`, proxy `/api`, Express, JWT, roles y contexto de organización. Sus datos espaciales utilizan `SpatialIngestionPipeline`, almacén por organización y MapLibre/OpenFreeMap. El motor probabilístico existente permanece sin modificaciones.

La integración añade solamente el enlace de navegación y el montaje `/clean-com`. Reutiliza `authenticate`, `authorizeRoles`, `requireOrganizationContext`, `asyncHandler`, `ApiError`, el cliente/proxy autenticado, componentes y estilos de Backstage, MapLibre, el mapa base, validación GeoJSON, cálculo de límites y contexto de navegación hacia el Explorador. No sustituye la ingesta, el enrutamiento, el terreno ni los modelos de otros módulos.

## Componentes y responsabilidades

| Componente | Responsabilidad |
| --- | --- |
| `processor/reader.py` | Adaptador FileGDB mediante GDAL/Pyogrio, lectura por bloques y huella binaria de la fuente. |
| `processor/audit.py` | Calidad de campos, geometrías, periodos y descripciones operativas; sin conclusiones de eficiencia. |
| `process.py` | Worker reproducible, exportación de vistas con hash de contenido y publicación atómica del manifiesto. |
| `cases/*.json` | Contrato del caso: capas, campos, año declarado, alcance de acceso, propietario cuando sea privado y unidades verificadas. |
| `backend/cleancom/repository.js` | Adaptador de artefactos, acceso compartido autenticado o por ID de organización, integridad y caché limitada. |
| `backend/cleancom/service.js` | Servicio especializado para casos, auditorías y geometrías paginadas; dependencias inyectables. |
| Controlador y rutas `cleanCom` | APIs internas con los permisos existentes. |
| `CleanCom.jsx`, `CleanComMap.jsx` | Mapa real, calidad, periodos, descripciones y disponibilidad de análisis. |

Modelos v1: `StudyCase`, `SourceFingerprint`, `LayerAudit`, `FieldAudit`, `CoordinateTransformation`, `GeographicPreview`, `OperationalSummary` y `AnalysisCapability`. Se representan mediante contratos JSON y artefactos inmutables; no hacen falta nuevas tablas SQL para esta primera versión. El repositorio puede sustituirse por almacenamiento de objetos sin cambiar el servicio ni las rutas.

## Procesamiento

Requiere Python 3.11 o superior y las dependencias de `requirements.txt`. El trabajo completo se ejecuta fuera de Vercel; la API Node entrega evidencia ya procesada. No se lanza un proceso GDAL largo desde una petición del navegador ni se simula una cola de trabajos.

```powershell
python -m pip install -r cleancom/requirements.txt
python cleancom/process.py --source frontend/cleancom/Proyecto_grado.gdb --spec cleancom/cases/empresas-varias-2025.json --output backend/cleancom/data/empresas-varias-2025 --preview-limit 1000
```

La geodatabase se abre solo para lectura. Se comparan sus hashes antes y después de la auditoría. Se auditan todos los registros; el mapa utiliza hasta 1.000 geometrías por capa, seleccionadas sistemáticamente por posición del registro. Esta vista no es una muestra estadística y no sirve para estimar densidades ni extrapolar indicadores. No se reparan geometrías automáticamente ni se inventan ubicaciones para los tickets. Las direcciones, matrículas catastrales, comentarios y placas no se exportan a la vista geográfica.

Los artefactos generados quedan fuera de Git. Son necesarios para desplegar el primer caso y se incluyen únicamente dentro de la función de la API. La geodatabase cruda se excluye del despliegue del frontend. Nada de estos datos se incorpora a archivos públicos del navegador.

## Organización y API

Por decisión del usuario, Empresas Varias 2025 es un **caso de referencia compartido para el desarrollo**, con alcance `shared_authenticated`. Está disponible para cualquier usuario con sesión, organización activa y rol de lectura de Backstage. No requiere una organización llamada harmony ni la ubicación del dispositivo. Su territorio proviene de la fuente geográfica. Esta configuración no equivale a una licencia abierta ni publica la geodatabase original.

Los nuevos casos pueden tener alcance `organization`: el paso `clean-com:bind` resuelve su propietario mediante PostgreSQL y guarda el ID numérico. Una asignación inexistente o ambigua deshabilita ese caso privado sin habilitarlo para terceros. `CLEAN_COM_BINDINGS_JSON` permite asignaciones explícitas en un servidor controlado. Las solicitudes del navegador no pueden cambiar el alcance ni el propietario.

Todas las rutas requieren JWT y organización activa. Admin, analyst y viewer pueden consultar los casos compartidos y los privados autorizados. Una organización ajena recibe 404 al pedir un caso privado, incluso si sus geometrías ya estaban en caché. No se permite elegir rutas de archivos.

| Método y ruta interna | Contrato |
| --- | --- |
| `GET /clean-com/cases` | Casos accesibles: `id`, título, proveedor, año declarado, versión/hash, estado y número de capas. |
| `GET /clean-com/cases/:caseId/audit` | `clean-com/audit-v1`: fuente, versiones, capas/campos, calidad, CRS, periodos, resumen y capacidades. |
| `GET /clean-com/cases/:caseId/layers/:layerId/features` | FeatureCollection WGS84 de la vista limitada, metadatos, fuente/versiones, paginación e integridad. |

Parámetros de geometrías: `limit` 1–500 (200 por defecto), `offset` 0–10000 y `bbox=west,south,east,north`. El área filtra solo la vista preprocesada, no todos los registros originales. Cada respuesta admite hasta 2 MiB de geometrías. La paginación indica `nextOffset`; la interfaz comprueba que el hash no cambie entre páginas. Las tablas sin geometría responden 422, la evidencia corrupta/no preparada 503 y los parámetros inválidos 400. El cliente usa el prefijo compartido `/api`.

## Análisis por versiones

| Área | Versión 0.1 y condición de evolución |
| --- | --- |
| Rutas | Códigos, fragmentos, calidad y geometría; distinguir circuito planeado de recorrido observado. Para análisis de red, reutilizar el grafo/enrutamiento existente cuando haya topología, dirección y red verificadas. |
| Tickets | Recuentos por fecha/año/mes, completitud, duplicados exactos y vínculos de códigos. No contar tickets como viajes sin comprobar la relación con el servicio. |
| Vehículos | Identificadores distintos con registros. Para utilización: capacidad, disponibilidad, horas operativas y vínculo viaje–vehículo. |
| Territorio | Recuentos por comuna reportada y vínculos de ruta. Sin coordenadas de tickets no se afirma una localización observada del evento. Validar CRS y vigencia antes de uniones espaciales. |
| Geoestadística | V0.2: variable y unidad verificadas, soporte espacial y temporal, vecindad/distancias justificadas, duplicados y cobertura. Solo entonces evaluar autocorrelación, semivariogramas o interpolación, con validación y límites explícitos. Nunca utilizar la vista limitada para estos cálculos. |
| Eficiencia | V0.3: kg o toneladas por km **realmente recorrido**, carga/capacidad y producción por hora **observada**, con mismo periodo y vínculos completos. Las fórmulas permanecen bloqueadas hasta disponer de esas entradas; no se construye una puntuación de eficiencia. |

Para un nuevo operador se añade un contrato y un paquete de datos con su alcance de acceso, campos, periodos y diccionario. No se cambian el motor ni la página para Empresas Varias.

## Referencias técnicas

- [Pyogrio: API de lectura y metadatos](https://pyogrio.readthedocs.io/en/latest/api.html).
- [GDAL: OpenFileGDB](https://gdal.org/en/stable/drivers/vector/openfilegdb.html).
- [Shapely: transformación de geometrías](https://shapely.readthedocs.io/en/latest/reference/shapely.transform.html).
- [Vercel: inclusión de archivos en funciones](https://vercel.com/docs/project-configuration/vercel-json).
