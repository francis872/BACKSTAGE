# Backstage Spatial Intelligence Engine

## Auditoría y decisión de integración

Backstage conserva React 18/Vite, MapLibre, Express 4/Node 24 y sus módulos Python existentes. Se reutilizan autenticación JWT, membresías vigentes, contexto de organización, rutas SOI, cliente MongoDB, sesiones, auditoría y el mapa `CleanComMap`. Las utilidades Node existentes resolvían distancias, geometrías y terreno; el módulo `probability` resuelve riesgo/probabilidad. Ninguno proporcionaba matrices Queen/Rook ni inferencia espacial local completa. BSIE ocupa ese hueco; no reemplaza esos motores ni crea otra aplicación.

Localmente Express ejecuta Python acotado mediante stdin/stdout JSON, sin shell. En Vercel usa un RPC privado firmado hacia una función Python del mismo despliegue; no depende de instalar Python dentro de Node. La CPU científica queda fuera del event loop. Worker y consultas comparten contrato y MongoDB (`bsie_jobs`, `bsie_weights`). No se modificó la copia paralela anterior.

BSIE 1.1.0. Dependencias runtime: NumPy, SciPy, Shapely, PyProj, spreg/libpysal; `bsie/requirements.txt`. esda se requiere para las pruebas de referencia, en `requirements-test.txt`. No se incorporan Redis, Celery ni un servidor Python separado. El despliegue requiere un host Node que permita procesos Python y tenga dichas dependencias. Un runtime serverless sin Python devolverá indisponibilidad; compilar el frontend no instala ese runtime.

## Estado verificable por fases

| Fase | Implementado e integrado | Verificación / límite |
|---|---|---|
| 0. Auditoría | Puntos de integración, dependencias, límites y despliegue | Este documento y revisión del repositorio |
| 1. Fundamentos | Validación GeoJSON, CRS declarado, reparación optativa sin modificar la entrada, geometrías duplicadas, Queen/Rook, KNN, banda métrica, distancia inversa, CSR, islas/componentes y estandarización | Malla exacta 3×3: Rook 24 entradas, Queen 40; pruebas de distancias, k, filas, diagonales y degeneración |
| 2. Autocorrelación | Moran global, permutaciones reproducibles, Moran local condicional, HH/LL/HL/LH, BH, exportación | Estadísticos contrastados con PySAL; patrones positivos, negativos, sin evidencia, constantes, ausentes e islas |
| 3. Hotspots/densidad | Gi* con peso propio 1; kernels Gaussian, Quartic, Epanechnikov, Uniform y Triangular; ancho explícito, pesos, máscara, resolución y GeoJSON de celdas | Gi* contrastado con PySAL; integración radial de cada kernel = 1; masa KDE y unidades verificadas |
| 4. Tiempo | 2–12 períodos, ventanas móviles, Moran, transiciones/persistencia, diferencias KDE y tendencias Theil–Sen | Pruebas de unidades/ventanas y cambio pareado con hipótesis explícita; no es un modelo predictivo espacio-temporal general |
| 5. Regresión | OLS, LM clásico/robusto/SARMA, Spatial Lag y Spatial Error ML, selección diagnóstica y Moran residual | Referencias SciPy/spreg; ambigüedad conserva OLS; modelos espaciales limitados a 300 observaciones sin islas |
| Integración | API, UI, mapas analíticos, trabajos, cancelación/reintento, exportación, TTL y aislamiento | HTTP/JWT, Python, worker, persistencia real Atlas, caché, exportación y TTL verificados |

Los CSV operativos ya se importan mediante SOI; BSIE acepta FeatureCollection directamente y activos/incidencias de MongoDB. No hay lector GeoParquet, Shapefile o raster de entrada. KDE exporta una malla y polígonos GeoJSON, sin afirmar que sean un GeoTIFF. Las recomendaciones explican el criterio geométrico, tamaño y variación de la variable; nunca ejecutan todos los métodos automáticamente.

## Contrato

Prefijo autenticado: `/soi/bsie`. Cada petición consulta membresías actuales. Un viewer consulta métodos y trabajos de su organización; admin/analyst ejecutan, cancelan y reintentan. Los IDs de organización/usuario aportados en el cuerpo no seleccionan el tenant.

- `GET /methods`: métodos y límites.
- `POST /validate`, `/weights`, `/recommend`, `/moran`, `/local-moran`, `/gi-star`, `/kde`, `/regression`, `/temporal`: ejecución acotada.
- `POST /jobs`: recibe el mismo cuerpo y `operation`; devuelve 202 y trabajo persistido/idempotente.
- `GET /jobs`, `/jobs/:id`: estados y resultado; el listado excluye el resultado pesado y el input.
- `POST /jobs/:id/cancel`, `/jobs/:id/retry`: cancelación y hasta tres intentos.
- `GET /jobs/:id/export`: capa GeoJSON disponible de un trabajo completado.

Ejemplo de cuerpo; `features` representa datos aportados por el usuario, nunca se genera inventario operativo de ejemplo:

```json
{
  "operation": "moran",
  "data": { "type": "FeatureCollection", "features": [] },
  "source": { "name": "Fuente declarada", "version": "2026-10" },
  "variable": "value",
  "weights": { "method": "knn", "k": 4, "symmetry": "union", "transform": "row" },
  "permutations": 199,
  "seed": 42,
  "alpha": 0.05,
  "alternative": "two_sided",
  "correction": "bh"
}
```

El array vacío del ejemplo debe sustituirse por 4–1000 observaciones para Moran. Para datos internos, sustituir `data` por `dataset: {kind: "assets"}` o `incidents`. Las variables internas son `capacity` y claves numéricas de `metadata.metrics`; no se inventan atributos faltantes. Temporal acepta `method` y `periods: [{label, data}, ...]`, en el orden declarado. Los métodos sobre unidades territoriales exigen los mismos IDs, orden y geometrías. KDE permite eventos distintos y crea una malla común. Las etiquetas temporales son declaradas; no se ordenan ni se deducen automáticamente de fechas.

Cada ejecución incluye versión, hash del dataset, procedencia declarada, parámetros, validación, duración, identificador y fecha. En la cola también se conserva el input original, creador, estado y número de intentos. Declarar una fuente no acredita su verificación externa. Las estadísticas locales exportan solo IDs y resultados, sin copiar las propiedades arbitrarias del cliente; `suppress_locations: true` omite capas. La auditoría omite cuerpos georreferenciados BSIE, GPS e importaciones para no duplicarlos fuera de su retención.

## Convenciones matemáticas

Distancias entre centroides en proyección azimutal equidistante regional, en metros. Se admite CRS fuente declarado y se transforma a WGS84. Extensión máxima 10° en cada eje y centro dentro de ±85°. No son distancias viales ni distancias geodésicas exactas entre cualquier par. Queen/Rook evalúan topología antes de proyectar; no se corrigen silenciosamente huecos o solapamientos de una cobertura. Se rechazan polígonos superpuestos para contigüidad. KNN resuelve empates por distancia y orden de observación, con unión simétrica por defecto. Pesos nulos en diagonal, estandarización opcional por fila, IDs ordenados y componentes reportados. Centroides coincidentes requieren exclusión explícita.

Moran global: `I = n/S0 · (z'Wz)/(z'z)`, esperanza `-1/(n-1)`. La varianza es **Monte Carlo**, no la varianza analítica normal: se informa su método y z respecto de la esperanza. Los p de permutación usan corrección +1, incluyendo empates. La prueba bilateral compara desviación absoluta respecto de la esperanza nula. No se recorta I a [-1,1].

Moran local usa `(n-1) zi (Wz)i / (z'z)`, como esda. La aleatorización condicional mantiene el valor focal y permuta los restantes; se centra en su esperanza condicional. Gi* usa el estadístico Z analítico con peso propio 1 y pruebas de etiquetas aleatorias incondicionales. No son el mismo modelo nulo. El p bilateral de BSIE no pretende coincidir con el `p_sim` unilateral de otras bibliotecas: se contrastan los estadísticos, y se prueban por separado la regla de p y reproducibilidad. BH se aplica por análisis local, excluyendo islas/estadísticos indefinidos. Islas y vecindades completas con denominador cero se informan sin significancia ficticia.

KDE utiliza kernels radiales normalizados en dos dimensiones y suma pesos observados; el resultado es densidad por m², convertido a km² en las celdas cartográficas. El ancho de banda es una elección explícita. No hay selección automática óptima, corrección de borde ni renormalización por máscara. La integral de malla es aproximada. No representa riesgo ni probabilidad predictiva futura.

Las interpretaciones son reglas deterministas. Ausencia de significancia no prueba aleatoriedad; un cluster depende de escala, matriz, muestra y corrección. OLS es asociación, exige revisar supuestos y residuos, y no acredita causalidad. Las transiciones temporales son descriptivas; múltiples análisis significativos en fechas distintas no demuestran un cambio significativo entre fechas.

Referencias primarias: [libpysal Rook](https://pysal.org/libpysal/stable/generated/libpysal.weights.Rook.html), [KNN](https://pysal.org/libpysal/stable/generated/libpysal.weights.KNN.html), [esda Moran Local](https://pysal.org/esda/generated/esda.Moran_Local.html), [esda Gi local](https://pysal.org/esda/generated/esda.G_Local.html), [SciPy BH](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.false_discovery_control.html).

## Límites y operación

2–1000 features (Moran/local mínimo 4), entrada ≤4 MB, ≤10.000 vértices por observación y ≤50.000 por análisis, CSR ≤200.000 pesos, 19–9999 permutaciones y n×permutaciones ≤1.000.000. KDE: ancho 1–100.000 m, resolución 4–64, n×celdas ≤2.000.000, malla dentro de 2.000 km del origen regional. Temporal: 2–12 períodos. Python tiene timeout de 30 s, salida ≤16 MB y resultados persistidos ≤8 MB. Estos son límites de admisión y proceso; no hay una cuota dura del sistema operativo para memoria.

Hasta dos procesos científicos simultáneos y uno por organización en cada proceso Node. La cola tiene hasta tres pendientes por organización, lease de 60 s y recuperación hasta tres intentos. La cancelación se comprueba cada segundo durante la ejecución; un worker que perdió su lease no puede sobrescribir otro resultado. TTL elimina trabajos/input/resultados a 30 días y cachés a siete días; las lecturas excluyen vencidos antes del barrido TTL. La cancelación no borra inmediatamente el input retenido. La caché Mongo reutiliza solicitudes exactas de matrices; los estadísticos aún reconstruyen sus matrices en cada proceso Python. La cuota de concurrencia de cálculos inline no es global entre varias instancias: operar un host o añadir coordinación compartida antes de escalar horizontalmente.

Mediciones reales en [bsie-benchmark.json](evidence/bsie-benchmark.json), con 25/100/400/1000 puntos sintéticos. Cada tamaño usa un proceso independiente y registra tiempo de preparación, matriz, estadístico, resultado y peak RSS nativo. El tiempo excluye inicio/importación de Python y HTTP; no es una promesa de latencia de producción.

## Ejecución y pruebas

Desde la raíz, crear un entorno virtual e instalar dependencias:

```powershell
python -m venv .venv-bsie
.\.venv-bsie\Scripts\python.exe -m pip install -r bsie/requirements-test.txt
npm run test:bsie
npm run benchmark:bsie
npm run test:backend
npm run test:frontend
npm run build
```

En Linux usar `.venv-bsie/bin/python`. Runtime detecta ese entorno; también admite `BSIE_PYTHON` con ruta al intérprete. En un host de ejecución solo se necesita `requirements.txt`; pruebas usan el archivo ampliado. No se instala Python durante el build de Vercel.

MongoDB debe estar accesible y ser Atlas/replica set. Revisar `npm run mongo:plan --prefix backend` (offline), inicializar con `npm run mongo:init --prefix backend` en el entorno autorizado y arrancar `npm run bsie:worker --prefix backend`. Para una sola toma: `node backend/scripts/bsie-worker.js --once`. La UI se abre desde SOI → Estadística espacial; la cola necesita su worker activo.

Verificación vigente: 27 pruebas BSIE, 11 sanitarias, 275 backend aprobadas y una integración externa optativa omitida; 13 frontend, seis probabilísticas y una prueba Python del RPC. API y frontend publicados después de 17 verificaciones remotas, seis controles de motores y 15 comprobaciones sobre la interfaz desplegada. Se verificaron worker, caché, auditoría, transacciones y TTL con limpieza del tenant temporal. La carga simultánea a escala productiva sigue pendiente. Evidencias: [estado sanitario](SOI_SANITARY_PROGRESS.md).
