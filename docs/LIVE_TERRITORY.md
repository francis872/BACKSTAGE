# Operación territorial actual

Actualizado: 12 de octubre de 2026. Uso confirmado por el usuario: desarrollo o personal.

## Comportamiento disponible

- La barra de territorio funciona en todas las vistas autenticadas. Las búsquedas explícitas abarcan cualquier país y no se restringen por la posición del dispositivo.
- “Usar mi ubicación” solicita permiso al navegador y sigue los cambios de posición. No se solicita el permiso al entrar. Se actualiza cuando hay desplazamientos de al menos 50 m y con una separación mínima de 15 segundos. Elegir otro lugar detiene el seguimiento; “Detener ubicación” también lo detiene.
- Al cambiar de territorio se eliminan referencias incompatibles del proyecto anterior. Se mantienen las coordenadas válidas, incluido 0, y la organización activa.
- Las sugerencias del centro de operaciones ejecutan una búsqueda. El comparador admite de 2 a 6 candidatos. El motor analítico necesita evidencia verificada: resolver un lugar no equivale a calcular su riesgo ni su rentabilidad.
- Actividad, proyectos, portafolio y capas propias se consultan automáticamente cada 30 segundos mientras la página está visible. Se vuelve a consultar al recuperar el foco o después de una operación exitosa.
- Clima y cartografía cercana se consultan cada 5 minutos. El backend conserva meteorología durante 5 minutos y cartografía durante 15 minutos, mostrando la fecha de la fuente y la fecha de consulta. Los fallos tienen una pausa de 60 segundos para no insistir sobre proveedores caídos.
- Open-Meteo aporta condiciones estimadas por modelos y pronóstico de 3 días. La elevación puntual de su celda no se presenta como DEM verificado ni como una medición local.
- OpenStreetMap aporta una muestra de salud, educación, transporte y parques en un radio de 1,2 km, limitada a 250 elementos. Se consulta Overpass y, si sus fuentes no responden, se utiliza la cartografía vectorial de OpenFreeMap/OpenMapTiles que ya usa el mapa. Este respaldo consulta hasta nueve teselas, elimina duplicados y recorta los puntos al radio seleccionado. No representa tráfico en vivo ni un inventario completo.
- Explorer devuelve borradores de activos y proyectos al seleccionar un punto. La importación de un lugar conserva geometría y procedencia. Editar manualmente las coordenadas sustituye la geometría anterior y evita atribuirla a otro territorio.
- Salud técnica, integridad de auditoría e historial de comandos están en un diagnóstico interno plegado, disponible para administradores. La vista normal muestra eventos de proyectos.

## Fuentes y límites comprobados

Open-Meteo respondió desde Vercel con condiciones actuales. Overpass no respondió en la comprobación anterior del despliegue. El respaldo vectorial OpenFreeMap respondió en la validación local y desde la construcción de Vercel con una muestra de 250 lugares del punto público consultado en Medellín y versión 20261004_113936_pt. Se muestra la versión publicada de la cartografía; no se presenta como una medición instantánea ni se inventa la fecha de actualización de la base OSM. La disponibilidad de cada proveedor se informa explícitamente.

Población, riesgos, avalúos, oportunidades y DEM requieren fuentes o registros verificables. No se generan indicadores inventados para rellenar tarjetas vacías. Los proyectos asociados se buscan entre los últimos 50 registros devueltos por la API.

La plataforma actual utiliza consultas periódicas compatibles con Vercel Functions. No se anuncia una conexión WebSocket persistente en este despliegue.

## Configuración

Variables opcionales del backend:

- OPEN_METEO_API_KEY: suscripción comercial; cambia la llamada al host customer-api.open-meteo.com. Vacía para el desarrollo o uso personal confirmado.
- OVERPASS_URL: endpoint alternativo propio o contratado. Vacía para usar Private.coffee y VK Maps como alternativas documentadas por OpenStreetMap.
- NOMINATIM_BASE_URL y NOMINATIM_USER_AGENT: permiten sustituir el geocodificador. Las búsquedas se realizan solo al pulsar un control explícito. El proveedor público exige atribución y un máximo de una petición por segundo para toda la aplicación; con MongoDB Atlas configurado se coordina un bloqueo compartido entre instancias Vercel.

Verificación de fuentes sin escritura: npm run verify:live-sources --prefix backend. Esta prueba consulta un punto público de Medellín y solo imprime estados y fechas de fuentes. Se ejecuta también durante la construcción del backend en Vercel.

## Validación

- Versión principal: 172 pruebas backend aprobadas con el respaldo vectorial.
- Carpeta del IDE: 137 pruebas backend aprobadas con el respaldo vectorial.
- 5 pruebas de contexto verifican cambio de territorio, aislamiento entre organizaciones, borradores y coordenadas.
- 31 comprobaciones de navegador de los flujos territoriales en ambas carpetas, con APIs y geolocalización simuladas.
- 10 comprobaciones de actualización automática, pausa al ocultar y permisos de consulta.
- 2 comprobaciones de guardado simulado de coordenadas editadas, sin conservar un polígono anterior.
- No se crearon usuarios ni activos de prueba en producción. La validación pública comprueba salud, carga de interfaz y rechazo del acceso anónimo a las nuevas rutas.

## Referencias de proveedores

- [Open-Meteo API](https://open-meteo.com/en/docs)
- [Términos de Open-Meteo](https://open-meteo.com/en/terms)
- [Política de Nominatim](https://operations.osmfoundation.org/policies/nominatim/)
- [Instancias Overpass y políticas de uso](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [Límites de Vercel Functions](https://vercel.com/docs/functions/limitations)

- [OpenFreeMap: mapas públicos y atribución](https://openfreemap.org/quick_start/)

## Estado del acceso de Atlas

La regla temporal anterior apareció como PENDING DELETION y Atlas dejó de conectar. Tras reactivar el acceso y la confirmación del usuario, la comprobación desde Vercel devuelve status=ok, mongodb=healthy. Se indicó desactivar el vencimiento temporal para este entorno de desarrollo; la vigencia de la nueva regla no se ha inspeccionado mediante una API administrativa. Meteorología y cartografía pública también respondieron.

## Publicación final

- Web: https://backstage-web-seven.vercel.app
- API: https://backstage-api.vercel.app
- Frontend activo: dpl_SW6eA6ieQU5mxctp5B6jz35Gssxj.
- Backend activo: dpl_CBUA8LkmxR5kn4TQr5V8TKqYEkwW.
- La verificación final confirma status=ok, MongoDB Atlas 17 saludable y MongoDB Atlas saludable. La web pública sirve exactamente los archivos verificados en el despliegue nuevo.


## Corrección de sesión y experiencia — 12 de octubre de 2026

Los registros reales de Vercel confirmaron rechazos jwt expired en búsquedas, terreno y otros módulos: el frontend conservaba una sesión vencida y continuaba enviando su token. Ahora los HTTP 401 de peticiones protegidas limpian esa sesión y regresan al login una sola vez. Una respuesta tardía no cierra una sesión nueva; los errores de credenciales, permisos y disponibilidad no se confunden con caducidad. El login, registro y cambio de organización comprueban el token mediante /auth/me antes de abrir el espacio de trabajo. La API conserva la verificación de firma HS256, emisor, audiencia y vencimiento, y devuelve códigos de error estables. El proxy transmite también X-Organization-Id.

Los buscadores tienen etiquetas visibles, fondo oscuro, texto claro y foco de teclado. La ubicación del dispositivo se resuelve a municipio, región y país, conservando el punto GPS exacto; también se nombra la ubicación guardada por versiones anteriores. El seguimiento requiere pulsar el botón y se detiene al elegir otro territorio. Las coordenadas y la procedencia meteorológica quedan en detalles desplegables. Los resultados priorizan el lugar y el mapa; los datos guardados y las rutas quedan como opciones. La ficha del lugar está debajo del mapa. El terreno permite reintentar una carga fallida y sus vistas indican cuando las alturas, pendientes y curvas son simuladas.

Validación: 173 pruebas backend y 10 frontend en la carpeta publicada; 138 pruebas backend en la copia del IDE y 11 comprobaciones finales de sesión/contexto con el proxy. Ambas versiones compilan. Pasaron 30 comprobaciones de navegador sobre las dos compilaciones: login y JWT reales locales, análisis, búsqueda, nombre de ubicación guardada y GPS, modos del terreno, recuperación tras caducidad, nueva sesión y pantallas de 320, 390 y 1440 px. Solo geocodificación y meteorología externa se sustituyen por fixtures en esa prueba. En la web publicada se comprobó recuperación de una sesión guardada inválida a 390 y 1440 px, rutas protegidas, archivos publicados y MongoDB Atlas/Atlas saludables. No se crearon cuentas ni proyectos de prueba en producción; un login con una cuenta existente de producción todavía no se ejecutó desde este entorno.

Frontend activo: dpl_SW6eA6ieQU5mxctp5B6jz35Gssxj. Backend activo: dpl_CBUA8LkmxR5kn4TQr5V8TKqYEkwW. Web: https://backstage-web-seven.vercel.app. Informes locales: .vercel/auth-browser-report.json, .vercel/auth-public-report.json y .vercel/final-release-report.json.


### Registro real confirmado

Tras la confirmación del usuario de haber creado su cuenta, los registros de producción del 12 de octubre de 2026 muestran POST /auth/register con HTTP 201 y dos comprobaciones GET /auth/me con HTTP 200 posteriores. La sesión emitida al registrarse quedó validada en producción. MongoDB Atlas y Atlas siguen saludables. No se usaron ni solicitaron contraseñas para esta comprobación. No se ha observado todavía una búsqueda territorial autenticada posterior al registro.
