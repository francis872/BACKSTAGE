# Intelligence Core: finanzas y simulación probabilística

El incremento conserva BACKSTAGE, sus páginas y proyectos, y utiliza exclusivamente MongoDB Atlas. Extiende `analytics_jobs` con el contrato `backstage-analysis-1`; los proyectos existentes en `analysis_runs` conservan referencias en `metadata.analytics_evidence`. No crea colecciones, índices ni migraciones y no modifica ejecuciones históricas.

## Contrato y persistencia

El servidor selecciona el algoritmo, valida y canonicaliza las entradas, calcula el resultado y genera las huellas SHA-256 de entrada, resultado, fuentes y manifiesto. Ignora el resultado, contrato, usuario y organización aportados en el cuerpo. La identidad y el tenant proceden de la sesión y membresía vigente. El resultado completado, su referencia al proyecto y el hecho `analysis.saved` se confirman en una transacción. Si falla, la ejecución puede permanecer registrada como fallida; no conserva un resultado exitoso ni una referencia parcial.

Se conservan moneda, unidad, periodo, periodo de la tasa, fuente y supuestos. Cuando faltan, se registra explícitamente su ausencia; no se infiere COP ni periodicidad anual en la API. Las monedas usan una etiqueta de tres letras aportada por el usuario, sin certificar que sus datos correspondan a esa moneda. Se rechazan unidades y monedas distintas, o tasas con otra periodicidad. No hay conversiones cambiarias ni anualización implícita. La pantalla inmobiliaria declara COP y años conforme a su formulario existente; el valor del activo es declarado, no un avalúo certificado.

Cada solicitud puede incluir `analysis_run_id`. Debe existir en la organización activa, y se comprueba de nuevo al confirmar la referencia en la transacción. Una ejecución nueva no sobrescribe otra. La referencia de proyecto contiene ID, algoritmo, versión y manifiesto; los datos completos permanecen en `analytics_jobs`. El vínculo no completa automáticamente las etapas de comparación, ajuste de distribuciones, riesgos o informe del proyecto.

## Finanzas: `backstage-financial-2`

Se conservan las rutas y operaciones: `npv_irr`, `cap_rate`, `payback` y `dcf`. Los importes y tasas se almacenan como cadenas decimales canónicas: hasta 34 cifras significativas y 18 posiciones fraccionarias. Los números JSON que ya excedan el coeficiente entero seguro se rechazan; debe enviarse texto decimal. Se rechazan booleanos, nulos como cantidades, valores no finitos y separadores ambiguos.

VPN, capitalización, interpolación del payback y descuento de flujos usan fracciones exactas. Se redondea al final, con mitades alejadas de cero: seis posiciones para importes monetarios y cuatro para capitalización/payback. Los campos monetarios con sufijo `_decimal` son la representación conservada exacta del valor redondeado; los campos numéricos anteriores se mantienen para compatibilidad y pueden aproximar importes grandes. Capitalización y payback mantienen sus salidas numéricas. No son una recomendación de inversión ni una predicción de los flujos.

Los flujos son igualmente espaciados: inversión inicial en el periodo cero y flujos posteriores al final de cada periodo. DCF comienza en el periodo uno y descuenta el valor terminal al final del horizonte. Se admiten hasta 120 periodos futuros y tasas entre -0.99 y 10 por periodo. No se implementa XIRR para fechas irregulares. Un flujo inicial no negativo tiene payback cero; una inversión no recuperada devuelve nulo.

La TIR se aproxima con bisección acotada en [-0.99, 10], usando flujos normalizados y evaluación polinómica para evitar desbordamiento en horizontes largos. Solo se busca una raíz cuando hay exactamente un cambio de signo. Devuelve `converged:false` y TIR nula si no cambia el signo, si hay cambios múltiples, si la raíz queda fuera del intervalo o si se agotan iteraciones. No elige arbitrariamente entre raíces ni declara convergencia al agotar el presupuesto. El resultado se redondea a diez posiciones de tasa. La [ecuación de TIR documentada por NumPy](https://numpy.org/doc/1.17/reference/generated/numpy.irr.html) sirve de referencia; las pruebas incluyen casos conocidos e inversiones con cambios múltiples de signo.

## Monte Carlo: `backstage-monte-carlo-2`

`POST /analytics/risk-simulation` con `algorithm: "monte_carlo"` conserva el modelo cerrado `independent_normal_weighted_sum`: normales independientes por factor, combinadas mediante suma ponderada. No ejecuta fórmulas o código del cliente. Reutiliza el generador existente mulberry32 y la transformación Box-Muller.

- Entre 1 y 30 factores con identificadores seguros, media finita, desviación no negativa y peso finito; sin correlaciones estimadas ni truncamiento.
- Entre 100 y 200000 iteraciones y semilla entera sin signo de 32 bits. Si se omiten, se materializan 10000 y 42 en el registro.
- Factores ordenados por clave antes de muestrear; reordenar claves JSON no altera el resultado de una nueva ejecución.
- Se guardan factores, pesos, modelo, semilla, iteraciones, unidad y procedencia. P5/P50/P95, media, desviación y extremos se muestran con cuatro decimales.

Los percentiles describen la distribución simulada condicionada a los parámetros aportados. No son mediciones observadas, probabilidades calibradas ni intervalos de confianza de una estimación. El contrato conserva `confidence_interval:null`; véase la distinción con los [intervalos de confianza para la media de NIST](https://itl.nist.gov/div898/handbook/eda/section3/eda352.htm). Las normales pueden producir valores negativos. Se conserva la versión de Node utilizada; la comprobación exacta incluye ese entorno y puede fallar tras un cambio de runtime o fuentes en lugar de certificar equivalencia no demostrada.

La interfaz conserva los resúmenes y gráficos del Probability Engine y añade un formulario sin factores ficticios precargados. Guarda las simulaciones en la organización o en el proyecto activo. Permite recuperar el historial, repetir la comprobación y descargar el snapshot persistido después de recargar la página.

## Ajustes de distribuciones importados

El recorrido existente `PUT /analysis/:id/probability` conserva también los parámetros de distribución y umbrales aportados. Su evidencia se etiqueta `backstage-imported-probability-1`, `declared_summary_only`, `reproducible:false`: una huella protege la referencia del resumen recibido, pero no prueba el ajuste original ni la autenticidad de sus fuentes. No acepta la declaración de reproducibilidad del cliente. Sin muestra original y entorno científico original no se promete repetir ese ajuste. Los gráficos y datasets sintéticos siguen identificados como sintéticos.

## API y lectura histórica

| Ruta | Acceso y resultado |
| --- | --- |
| `POST /analytics/financial` | Admin/analista. Devuelve ID, versión, resultado y contrato calculados por el servidor. |
| `POST /analytics/risk-simulation` | Admin/analista. El contrato nuevo se aplica a Monte Carlo; otros motores de riesgo conservan sus contratos. |
| `GET /analytics/jobs?project_id=ID` | Admin/analista/consulta. Historial del proyecto y organización, hasta el límite solicitado. |
| `GET /analytics/jobs/:id/reproducibility` | Lectura sin escrituras: versión conocida, huellas, entradas, resultado y entorno. |
| `GET /analytics/jobs/:id/export` | Snapshot persistido e informe actual, formato `backstage-analytics-export-1`, descarga JSON sin caché. |

Un informe negativo responde 200 con `verified:false`; estados posibles: `verified`, `legacy_replayed`, `mismatch`, `unsupported_engine`, `unsupported_version`, `unsupported_contract`, `engine_changed`, `not_completed`, `missing_contract`, `invalid_snapshot`. La organización ajena recibe 404; falta de rol o membresía vigente, 403. Consultas pueden comprobar/exportar, pero no crear cálculos. Las huellas no son firmas digitales ni certificación de fuentes.

Los registros `1.0.0` se leen y, cuando sus entradas válidas permiten repetir el resultado, se devuelven como `legacy_replayed` con `historical_integrity:false`. Se ejecuta su motor anterior y se conserva el orden original de factores. No se añaden huellas retroactivas ni se convierte un registro antiguo a la versión nueva. El motor financiero anterior permanece intacto. Versiones desconocidas pueden leerse, pero no certificarse.

GIS, BSIE, optimización y la preparación completa de producción siguen siendo incrementos separados. Este trabajo no incluye producción ni respaldo completo de Atlas/PITR.
