# BACKSTAGE · motor geoespacial

## Motor y vistas

Se mantiene MapLibre GL JS. 2D y 3D usan Mercator; Globo usa la proyección `globe` del mismo mapa. Terreno, edificios donde la fuente los contiene, curvas y datos temáticos conservan los servicios actuales. Exageración vertical es un control de visualización; no modifica mediciones. No se incorpora Cesium ni se cambia el motor científico para conseguir una captura visual.

El control de capas explica fuente, leyenda y disponibilidad. Proyectos, activos, candidatos, lugares, geometrías importadas y rutas utilizan fuentes existentes. Las capas sin conexión real están deshabilitadas. Ocultar Activos aplica a puntos, halos, líneas y polígonos. La información pública no equivale a un levantamiento topográfico ni acredita propiedad de predios.

## Búsqueda y Mapbox autorizado

La búsqueda explícita existente sigue disponible. No se hacen consultas predictivas a Nominatim público. El autocompletado permite Mapbox Geocoding v6 con `autocomplete=true`, `permanent=true` y lenguaje español: los lugares elegidos se guardan en el contexto y pueden vincularse con proyectos de Atlas.

Configuración **exclusiva del backend**, mediante secretos del entorno:

```dotenv
MAPBOX_ACCESS_TOKEN=<configurar como secreto; no versionar>
MAPBOX_GEOCODING_PERMANENT=true
```

Activar la segunda variable exige que la cuenta tenga habilitado el almacenamiento permanente. Una selección de proveedor no acredita ese derecho ni crea una cuenta. El token nunca se envía al frontend ni se incluye en capacidades, errores o evidencia. `GET /geography/capabilities` informa proveedor/configuración; no certifica conectividad o facturación. Sin ambas variables, la UI mantiene Buscar lugar. Si ya se configura un Photon autorizado, el adaptador existente sigue siendo compatible.

`GET /geography/autocomplete` normaliza identificador, nombre, coordenadas WGS84 `[longitud, latitud]`, tipo, país/región, fuente, atribución, almacenamiento y fecha de consulta. El resultado sigue marcado como coincidencia de proveedor sin verificación del predio. No almacena respuestas temporales de Search Box, que requieren otro acuerdo para conservar posiciones. No añade POI de Search Box simulados. Una respuesta inválida o un proveedor caído produce un error explícito sin generar ubicaciones de reemplazo.

Mapbox quedó configurado en el backend local y en el API de staging después de recibir el token autorizado. Una consulta real a Geocoding v6 con `permanent=true` devolvió HTTP 200 y Quibdó, Colombia. El navegador recibió sugerencias reales mientras se escribía, con atribución visible. La evidencia de activación está en [mapbox-activation.json](evidence/mapbox-activation.json); la validación integrada y sus límites están en [BACKSTAGE_TEST_REPORT.md](BACKSTAGE_TEST_REPORT.md). La publicación original conserva su versión anterior.

Al seleccionar un resultado se cancelan las consultas pendientes y se limpian tanto las sugerencias como la búsqueda explícita. La atribución permanece consultable en Fuente de la ubicación. El contexto conserva los metadatos admitidos; los proyectos existentes pueden guardar la fuente como objeto estructurado o como etiqueta acompañada de `source_metadata`. Se admiten ambos formatos sin migrar las entidades anteriores ni conceder verificación del predio.

La clave no aparece en el frontend compilado ni en la evidencia pública. Las pruebas del backend fuerzan credenciales Mapbox vacías y almacenamiento permanente desactivado para que una configuración local real no habilite llamadas externas en las regresiones aisladas.

Para configurar la cuenta, abrir [Access Tokens en la consola](https://console.mapbox.com/account/access-tokens/) y crear un token dedicado al entorno con los permisos necesarios para Geocoding, sin permisos de administración innecesarios. Configurarlo en Vercel, proyecto **backstage-staging-api**, Settings → Environment Variables, destino **Preview**; no agregarlo al frontend ni al chat. Habilitar `MAPBOX_GEOCODING_PERMANENT=true` solo cuando la cuenta permita conservar resultados. Un despliegue nuevo debe recoger esas variables y pasar la comprobación real antes de actualizar staging. La cuenta de prueba de Mapbox puede limitar la creación de tokens y el almacenamiento permanente; el [manual oficial de tokens](https://docs.mapbox.com/accounts/guides/tokens/) y la documentación de Geocoding describen los requisitos vigentes.

## Evidencia, rutas y cálculos

Se conservan CRS, coordenadas y metadatos admitidos por el contrato territorial. La comparación guarda contexto de candidatos y su hash separado de la entrada matemática canónica. Los identificadores incompatibles del proveedor se adaptan de forma estable y conservan el identificador de origen. Cada evidencia puede vincularse al proyecto operacional existente en una transacción, sin duplicar ese proyecto o reescribir su objetivo.

GIS, DEM, ruta vial, optimización y simulaciones mantienen sus contratos de cálculo. Distancias esféricas no equivalen a distancias viales. OSRM estima duración sin tráfico vivo; cada perfil exige un servidor preparado para ese perfil. Los resultados del optimizador no deben anunciarse como óptimos globales salvo prueba de su solver. Sin proveedor de flotas, las rutas son planificación con datos aportados. La ubicación personal del navegador sigue siendo optativa y no representa seguimiento de vehículos.

Guardar una ruta desde el proyecto activo agrega `analysis_run_id`, contrato de adaptación `backstage-road-plan-v1`, SHA-256 del resultado y referencia `metadata.route_plan_ids` en el proyecto. La ruta se calcula en servidor; una respuesta suministrada por el cliente no sustituye el resultado del proveedor. Plan, vínculo y auditoría comparten la transacción. Se conserva la atribución y fecha del resultado; OSRM público no declara aquí la versión exacta de su conjunto vial. El contrato del adaptador no debe confundirse con esa versión desconocida.

## Fuentes técnicas consultadas

- [MapLibre: proyección globo](https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-a-vector-map/).
- [Política Nominatim](https://operations.osmfoundation.org/policies/nominatim/).
- [Mapbox Geocoding: almacenamiento y autocompletado](https://docs.mapbox.com/api/search/geocoding/).
- [Mapbox Search Box: restricciones de almacenamiento](https://docs.mapbox.com/api/search/search-box/#search-box-api-restrictions-and-limits).

La disponibilidad, los derechos comerciales y la exactitud local deben comprobarse con la cuenta y los datos reales. Quibdó identificado por geocodificación no acredita la parcela de la Alcaldía; Yuto puede devolver un parque y debe conservar ese tipo en la evidencia.
