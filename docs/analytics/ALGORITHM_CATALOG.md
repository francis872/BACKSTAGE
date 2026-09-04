# Catálogo de algoritmos — BACKSTAGE Analytics Core

Fuente de verdad en código: `backend/infrastructure/analytics/algorithmRegistry.js`.
Implementación: `backend/domain/analytics/*.js`. Pruebas doradas y de
propiedades: `backend/domain/analytics/__tests__/*.test.js` (53 pruebas,
`npm test` dentro de `backend/`).

## Normalización (`domain/analytics/normalization.js`) — v1.0.0

Usadas internamente por los algoritmos multicriterio; no se exponen como
endpoint propio.

| Función | Propósito | Comportamiento en casos degenerados |
|---|---|---|
| `minMax` | Escala a [0,1], orientación beneficio/costo | Serie constante -> devuelve 1 (beneficio) o 0 (costo) y marca `constant: true` |
| `zScore` | Estandarización (x-media)/desviación | Desviación 0 -> devuelve 0 y marca `constant: true` |
| `robustScale` | (x-mediana)/IQR, robusta a outliers | IQR 0 -> devuelve 0 y marca `constant: true` |
| `logTransform` | Transformación logarítmica | Lanza error explícito si hay valores <= 0 |
| `winsorize` | Recorta colas a percentiles configurables | Lanza error si los límites son inválidos |

## Multicriterio (`domain/analytics/multicriteria.js`) — v1.0.0

| Algoritmo | Entradas | Salidas | Supuestos |
|---|---|---|---|
| `multicriteria.weighted_sum` | alternativas (nombre + criterios), pesos, dirección por criterio | ranking con score 0-100 por alternativa | Pesos deben sumar > 0 (se normalizan a 1); valores faltantes lanzan error, nunca se asumen 0 |
| `multicriteria.topsis` | igual que weighted_sum | ranking + distancia a solución ideal/anti-ideal | Normalización vectorial estándar TOPSIS; todas las alternativas deben compartir el mismo conjunto de criterios |
| `multicriteria.ahp_weights` | matriz de comparación por pares (n x n, valores positivos) | pesos derivados + razón de consistencia (CR) | CR > 0.10 se marca `isConsistent: false` (umbral de Saaty); no se usan automáticamente pesos inconsistentes sin advertirlo |
| `multicriteria.sensitivity` | alternativas, pesos, método, % de perturbación | por cada criterio, escenarios ±X% y si cambia el ganador | Perturbación por defecto 10-15%; renormaliza los demás pesos proporcionalmente |

**Integrado en:** Comparador Inteligente (`POST /analysis/compare`, que
internamente usa `topsis` desde `analysis.service.js`).

## Financiero (`domain/analytics/financial.js`) — v1.0.0

| Algoritmo | Entradas | Salidas | Supuestos |
|---|---|---|---|
| `financial.npv_irr` | flujos de caja (período 0 = inversión), tasa de descuento | VPN; TIR (Newton-Raphson con fallback a bisección) | TIR devuelve `null` explícito (no NaN/0) si la serie no cambia de signo |
| `financial.cap_rate` | NOI, valor de la propiedad | tasa de capitalización % | Ambos valores deben ser explícitos; nunca se infiere el NOI de un % fijo |
| `financial.payback` | flujos de caja, tasa (opcional) | periodo de recuperación simple y descontado | Devuelve `null` si la inversión no se recupera en el horizonte dado |
| `financial.dcf` | flujos proyectados, tasa, valor terminal | valor presente de flujos + valor terminal descontado | El valor terminal es un input explícito del llamador, nunca inventado |

**Integrado en:** Portafolio Inmobiliario (panel "Analizar
financieramente" en `RealEstatePortfolio.jsx`), usando el valor de avalúo
observado como inversión inicial y supuestos explícitos del usuario para
NOI y flujo de caja futuro.

## Riesgo (`domain/analytics/risk.js`) — v1.0.0

| Algoritmo | Entradas | Salidas | Supuestos |
|---|---|---|---|
| `risk.components` | threat, exposure, vulnerability (cada uno en [0,1]) | riesgo = threat × exposure × vulnerability | Los 3 factores deben declararse por separado; nunca se colapsan en un solo número sin trazabilidad |
| `risk.monte_carlo` | factores {mean, stdDev}, función de combinación, iteraciones, semilla | media, desviación, P5/P50/P95 | Generador pseudoaleatorio seedable (mulberry32 + Box-Muller) para reproducibilidad exacta; límite de 100-200.000 iteraciones |
| `risk.stress_test` | componentes base, escenarios con multiplicadores | riesgo resultante por escenario | Cada factor se limita a máx. 1.0 tras aplicar el multiplicador |
| `risk.geographic_concentration` | activos {grupo, valor} | índice Herfindahl-Hirschman, participación por grupo | HHI = 1/n (diversificado) a 1 (concentrado); requiere grupo explícito por activo |

**Integrado en:** Evaluaciones de Riesgo (panel "Simular riesgo" en
`RiskAssessments.jsx`), usando los 4 indicadores de riesgo ya
almacenados (inundación, deslizamiento, crimen, clima) como medias de
una simulación Monte Carlo con desviación estándar documentada
(15% del valor de cada indicador).

## Reglas transversales (aplicadas a todos los algoritmos)

- Ningún algoritmo acepta fórmulas arbitrarias: el catálogo es una lista
  cerrada de nombres conocidos (`getAlgorithm` lanza error si el nombre
  no existe).
- Ninguna función reemplaza silenciosamente un dato faltante por 0;
  siempre lanza un error explicando qué falta.
- Toda ejecución vía `analytics.service.js` queda registrada en
  `analytics_jobs` con algoritmo, versión, parámetros, resultado o error,
  organización, usuario y duración.
