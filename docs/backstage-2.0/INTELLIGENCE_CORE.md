# Intelligence Core: comparación y proyectos

> Extensión posterior: [reglas de negocio](BUSINESS_RULES.md) y [trazabilidad GIS/optimización](SPATIAL_INTELLIGENCE_CORE.md), con [validación en staging](PHASE_5_SPATIAL_REPORT.md). El contrato de comparación que sigue se conserva.

La extensión posterior de Fase 5 a finanzas y simulación Monte Carlo se documenta en [finanzas y probabilidad](FINANCIAL_PROBABILITY_CORE.md). Este documento conserva el contrato específico del comparador.

Este incremento implementa el recorrido aprobado de comparación reproducible sobre las colecciones existentes de MongoDB Atlas. No crea otro almacén de análisis ni altera documentos históricos. Este contrato se aplica al comparador configurable y a sus proyectos vinculados. La extensión financiera y probabilística utiliza los jobs existentes y conserva sus motores históricos; GIS, BSIE y motores sanitarios mantienen sus contratos.

## Contrato de análisis

Cada nuevo documento de `soi_comparisons` conserva `input`, `result` y `analysis`. El servidor selecciona el motor, sanea los datos y calcula el resultado; ignora resultados, huellas, usuario y organización declarados por el cliente. La autoría y el tenant provienen de la sesión y su membresía vigente.

| Campo de `analysis` | Contenido |
| --- | --- |
| `contract_version` | `backstage-analysis-1` |
| `engine` | Identificador, versión y huella de las fuentes del motor |
| `input_sha256`, `result_sha256` | SHA-256 de JSON canónico con claves de objeto ordenadas; el orden de arrays se conserva |
| `quantities` | Unidad declarada por criterio; sin conversiones implícitas |
| `provenance` | Fuente, clasificación, fecha declarada, ausencia y presencia de zona horaria por observación |
| `numeric_policy` | Precisión admitida, redondeo, almacenamiento y agregación de puntuaciones |
| `reproducibility` | Motor determinista, sin consultas externas ni semilla aleatoria necesaria |
| `uncertainty` | No estimada; intervalo de confianza nulo |
| `manifest_sha256` | Huella del conjunto anterior |

Las huellas detectan diferencias con la referencia guardada. No son una firma digital, no prueban autenticidad de las fuentes y no protegen frente a quien pueda reescribir datos y recalcular todas sus huellas fuera de la aplicación. La autorización, las transacciones y la auditoría siguen siendo controles separados.

Los datos financieros del comparador son cantidades aportadas, etiquetadas por unidad o moneda; no se genera un avalúo, conversión de divisas, flujo de caja o recomendación financiera automática. Una observación que declare una unidad diferente a la del criterio se rechaza. La fecha sin zona horaria se conserva como declarada y se marca sin zona; no se inventa UTC. `REAL_VERIFIED` declarado por el cliente se reduce a `UNKNOWN`.

## Versiones y calidad numérica

`shared/comparison.v1.mjs` conserva los bytes del motor anterior `soi-weighted-minmax-1`. Solo se emplea explícitamente para repetir registros anteriores. Los nuevos guardados usan `backstage-weighted-minmax-2`, con el mismo método de suma ponderada/min-max y sus políticas de ausencia, restricciones y empates.

La versión 2 admite decimales con hasta 34 cifras significativas y 18 posiciones fraccionarias. Los valores se conservan como cadenas decimales canónicas en JSON y BSON para evitar conversiones implícitas a `Number`. Un número JSON cuyo coeficiente decimal exceda el rango entero seguro se rechaza; debe enviarse como cadena. Las entradas del formulario ya son cadenas. No se cambian tipos ni documentos existentes mediante una migración.

El cálculo intermedio usa fracciones exactas con `BigInt`: comparación de límites, rangos, normalización y pesos. Cada puntuación total se obtiene sumando las contribuciones exactas y redondeando al final a ocho decimales, con mitades alejadas de cero. Las contribuciones mostradas se redondean individualmente; su suma visible puede diferir del total en las últimas cifras. Los pesos mostrados tienen doce decimales y su fracción exacta se conserva en el desglose. No se añade o reparte una puntuación para forzar un ganador.

Se mantienen datos ausentes explícitos: bloquear, excluir o penalizar con contribución cero, según el criterio. Un valor ausente no satisface una restricción verificable. Los criterios de peso cero no participan en el orden. Los empates se conservan y se ordenan de forma estable por ID.

La elección de representación considera los límites de [Number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER) y los [tipos BSON de MongoDB](https://www.mongodb.com/docs/manual/reference/bson-types/). No implica que el resto de los motores científicos pase a aritmética decimal ni que se hayan sustituido sus algoritmos.

## API, proyectos y lectura histórica

| Ruta | Comportamiento |
| --- | --- |
| `POST /comparisons` | Valida, calcula y guarda entradas, resultado, contrato y hecho de auditoría en una transacción |
| `GET /comparisons/:id` | Lee el snapshot de la organización sin recalcularlo ni sobrescribirlo |
| `GET /comparisons/:id/reproducibility` | Repite con la versión guardada y compara entradas, resultado, fuentes del motor y manifiesto; no escribe |
| `GET /comparisons/:id/export` | Descarga el snapshot persistido y un informe de comprobación actual; no sustituye el resultado por el borrador del navegador |
| `POST /comparisons/:id/project` | Exige un snapshot reproducible para un proyecto nuevo; conserva idempotencia y referencia de huellas en `metadata.analysis_context` |

Las rutas de lectura admiten administrador, analista y consulta con membresía vigente. Guardar y crear proyecto requieren administrador o analista. Una organización ajena no puede verificar o exportar el análisis. Una versión desconocida se puede leer como registro guardado, pero su reproducción se declara no disponible y no permite crear un proyecto nuevo desde ella.

Los registros anteriores sin contrato solo se certifican como reproducidos cuando el cálculo alcanza `ready`; un resultado inválido devuelve `invalid_input`, no se verifica y no puede originar un proyecto nuevo. Los registros válidos pueden devolver `legacy_replayed`: coincide su cálculo con el motor original, pero no hay huellas de origen con las que acreditar integridad histórica. No se completan retroactivamente huellas ni se convierte un replay en certificación de fuentes. Los registros v2 sin contrato, alterados o con motor distinto no se certifican. Los proyectos ya vinculados se conservan aunque después falte un activo; su recuperación sigue siendo idempotente.

La interfaz muestra el resultado persistido con su versión original. Editar prepara un nuevo análisis; guardar crea otro snapshot y no modifica el anterior. «Trazabilidad del análisis» permite comprobarlo. «Descargar evidencia JSON» descarga el registro guardado cuando existe; un borrador se identifica como `backstage-comparison-draft-1`.
