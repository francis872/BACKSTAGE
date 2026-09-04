# Metodología de validación — BACKSTAGE Analytics Core

## Cómo se valida cada algoritmo

Cada función en `backend/domain/analytics/*.js` tiene pruebas en
`backend/domain/analytics/__tests__/` (`npm test` en `backend/`, motor
`node --test`, sin dependencias externas). 53 pruebas, 0 fallidas al
cierre de esta fase. Tipos de prueba usados:

1. **Pruebas doradas (golden tests):** entradas con resultado matemático
   conocido de antemano. Ejemplos:
   - `netPresentValue([-100, 110], 0.10) === 0` (identidad financiera básica).
   - `internalRateOfReturn([-100, 110]).irr ≈ 0.10`.
   - `capRate(50000, 1000000) === 5`.
   - `riskFromComponents({threat:0.5, exposure:0.5, vulnerability:0.5}).risk === 0.125`.
   - AHP con la matriz de ejemplo de Saaty produce pesos ordenados según
     las comparaciones y una razón de consistencia numérica.

2. **Pruebas de propiedades:** invariantes que deben cumplirse siempre,
   no solo en un caso puntual:
   - Los pesos normalizados siempre suman 1 (`normalizeWeights`).
   - Los rankings de TOPSIS son una permutación estricta (sin rangos
     duplicados, un rango por alternativa).
   - Los percentiles de Monte Carlo cumplen `p5 <= p50 <= p95`.
   - El payback descontado nunca es menor que el payback simple.
   - La concentración geográfica de un solo grupo siempre da HHI = 1.

3. **Reproducibilidad:** `monteCarloSimulate` con la misma semilla y
   parámetros produce exactamente el mismo resultado (`deepEqual` en la
   prueba); semillas distintas producen resultados distintos. Esto se
   verifica automáticamente, no es una promesa sin comprobar.

4. **Casos límite y de error:** arreglos vacíos, series constantes,
   valores faltantes, matrices con dimensiones incorrectas, tasas de
   descuento inválidas, series de flujo de caja que nunca cambian de
   signo (TIR indefinida), número de iteraciones fuera de rango.

## Cómo interpretar un resultado en la interfaz

Cada ejecución expuesta al usuario debe poder responder:

| Pregunta | Dónde se responde hoy |
|---|---|
| ¿Qué método se usó? | `ranking_method` en la respuesta del Comparador (TOPSIS/weighted_sum) |
| ¿Qué versión del algoritmo? | `algorithm_version` en `analytics_jobs`, mostrado como parte de la ejecución registrada |
| ¿Es un dato observado o un supuesto? | El panel financiero distingue explícitamente "valor estimado observado" (avalúo) de los campos que el usuario diligencia (NOI, flujo de caja) |
| ¿Qué tan sensible es el resultado? | Sección "Análisis de sensibilidad" en el Comparador: por cada criterio, qué pasa si su peso sube o baja un 15% |
| ¿Es reproducible? | La simulación de riesgo expone la semilla usada; ejecutarla de nuevo con la misma semilla da el mismo resultado |
| ¿Dónde quedó registrada la ejecución? | `analytics_job_id` visible en la interfaz, consultable vía `GET /analytics/jobs/:id` |

## Limitaciones conocidas de esta fase (explícitas, no ocultas)

- El análisis financiero de Portafolio usa flujos de caja **anuales
  constantes** definidos por el usuario (no variables por año). Un
  escenario más realista (crecimiento del flujo, vacancia, gastos
  variables) queda como extensión futura del mismo endpoint
  (`POST /analytics/financial`), sin cambiar el contrato.
- La simulación de riesgo asume una desviación estándar del 15% sobre
  cada indicador almacenado, una heurística declarada explícitamente en
  la interfaz, no un dato observado. Ajustarla a datos históricos reales
  requiere una fuente de series temporales de riesgo que hoy no existe
  en el esquema.
- AHP calcula pesos con el método de "promedio de columnas normalizadas"
  (aproximación estándar y ampliamente usada), no con el método exacto
  de autovector principal; para las matrices pequeñas (n <= 10) típicas
  de este dominio la diferencia es marginal, pero queda documentado
  como una decisión de implementación, no un detalle oculto.
- No existe todavía un worker asíncrono separado (ver
  `docs/analytics/ARCHITECTURE.md`, sección "Por qué no hay un worker
  Python separado"). Los algoritmos actuales corren en milisegundos a
  segundos, dentro del límite de una función serverless.
