# Módulo probabilístico académico (BACKSTAGE)

Este módulo implementa el flujo matemático pedido en clase para ajustar distribuciones y evaluar posición probabilística de observaciones:

X -> h(x) -> normalizar -> integral(h)=1 -> ajustar f1..fn -> validar integral(fi)=1 ->  
h(x) vs fi(x) -> Bhattacharyya + ECDF vs CDF -> KS -> distribución de métricas ->  
cola izquierda -> umbral heurístico -> ranking -> f*(x) -> CDF / 1-CDF -> posición probabilística

## Ejecución

Desde [probability/](/C:/Users/Usuario/OneDrive/Escritorio/BACKSTAGE/probability):

```bash
C:/Python314/python.exe -m pip install -r requirements.txt
C:/Python314/python.exe run_probability_analysis.py --variable commercial_rent_cop_m2
```

Con archivo Excel:

```bash
C:/Python314/python.exe run_probability_analysis.py --input Backstage_Dataset_Probabilistico.xlsx --sheet Datos_Backstage --variable pedestrian_flow_day
```

## Funciones clave

- `cdf(x)` implementado en `FittedDistribution.cdf`.
- `survival_function(x)` implementado con `scipy.stats.<dist>.sf(...)` para estabilidad numérica.
- `evaluate_observation(x, fitted_distribution, thresholds)` devuelve:
  - `cdf`
  - `survival_probability`
  - `percentile`
  - `location` (`left_tail | central | right_tail`)

## Umbrales configurables

Por defecto:

- cola izquierda: `F(x) <= 0.05`
- zona central: `0.05 < F(x) < 0.95`
- cola derecha: `F(x) >= 0.95`

Se pueden cambiar con `--left-tail` y `--right-tail`.

## Umbral de selección de f(x) (heurística experimental)

Se calculan las distancias KS y Bhattacharyya para todas las distribuciones probadas.

Umbrales por cuantil:

- `threshold_KS = quantile(KS, q)`
- `threshold_B = quantile(Bhattacharyya, q)`

con `q=0.20` por defecto (`--threshold-quantile`).

Una distribución es candidata cuando cumple:

- `KS <= threshold_KS` **y**
- `Bhattacharyya <= threshold_B`

> Importante: esto se documenta como **heurística experimental del proyecto**, no como prueba universal.

## Artefactos generados

Se generan en `output/<variable>/`:

- `results.csv`
- `academic_summary.csv`
- `analysis_summary.json`
- `histogram_unit.png`
- `all_distributions_pdf.png`
- `top_pdfs_overlay.png`
- `best_pdf_vs_hist.png`
- `ecdf_vs_best_cdf.png`
- `cdf_survival.png` (Gráfico 9)
- `bhattacharyya_ranking.png`
- `ks_ranking.png`
- `bhattacharyya_threshold.png` (Gráfico 10)
- `ks_threshold.png` (Gráfico 11)
- `metrics_table.png`
