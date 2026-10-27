# BACKSTAGE · inteligencia económica contextual

Incremento del 26 de octubre de 2026. El servicio económico se abre en **Explorador → objeto PH → Operaciones e historial → Analizar economía y presupuesto**. Conserva la plataforma, identidad, servicios financieros y motores existentes. No añade navegación principal, paquetes, bases alternativas ni infraestructura Docker. No publica en Vercel ni cambia producción.

## Auditoría y línea base

Se reutilizan `shared/decimal.mjs` para fracciones exactas, los contratos financieros existentes, las entidades PH de `locations`, los asientos versionados de `propertyOperations`, la identidad/membresía vigente y el cifrado/auditoría Hebra. `shared/financial.v2.mjs` sigue proporcionando VAN/TIR y los cálculos anteriores; no se sustituye. El nuevo núcleo resuelve planificación operativa sobre un libro administrativo, responsabilidad que no cubría ese motor.

La inspección de Atlas autorizado se limitó a metadatos/conteos: cero entidades PH y cero versiones financieras disponibles. No se leyeron cuerpos sensibles ni se fabricaron conclusiones sobre datos inexistentes. La aceptación usa exclusivamente entidades, cargos, recibos, egresos y series sintéticas en una base nueva con marcador de propiedad, eliminada al terminar. [Auditoría de datos](evidence/economics-data-audit.json).

Antes de modificar: 425 pruebas backend, 424 aprobadas/una omitida; 36 frontend aprobadas. Se conservaron copias de los archivos afectados y huellas de los motores compartidos. El árbol ya contenía trabajo previo, que se preservó.

## Alcance implementado

| Capacidad | Comportamiento real | Condición o límite |
| --- | --- | --- |
| Caja | Ingresos, egresos, flujo neto/acumulado, déficits y desviación presupuestaria mensual | Apertura y fuente obligatorias; libro administrativo, sin conciliación bancaria |
| Cartera | Saldo corriente/vencido, antigüedad, proporción vencida, HHI, comparación territorial y evolución mensual | Solo obligaciones registradas y autorizadas, una moneda/precisión por ejecución |
| Proyección | Recaudo, egresos, facturación, caja y cartera; base y variantes editables | Media móvil recursiva; validación retrospectiva de flujos; bandas de sensibilidad, sin cobertura garantizada |
| Escenarios | Supuestos, instantánea, resultado, manifiesto y aprobación interna versionados | Aprobar no crea cargos ni certifica normas; cambios de base exigen revisión nueva |
| Optimización | Presupuestos aprobados, reserva, mínimos, máximos y prioridades marginales | Asignación lineal de un recurso divisible y cotas independientes; no MILP general |
| Cuotas | Componentes comunes/reserva/extraordinarios; coeficientes, reparto igual o pesos explícitos; cuotas parciales | Reglas y fuentes obligatorias, propuesta para revisión humana, presupuesto conservado exactamente |
| Explorador | Indicadores, alertas, tabla/serie, escenarios, exportación y capa categórica de saldo | Solo geometrías propias. La prueba de navegador no certifica renderizado WebGL |
| Confianza | Autorización vigente, cifrado, hashes, versiones y auditoría nativos | Custodia de claves por entorno y operación productiva siguen pendientes |

El núcleo recibe un contrato territorial neutro y se puede reutilizar en retail, industria o transporte. **En este incremento el adaptador operativo implementado es PH**; no se anuncian los demás adaptadores como disponibles.

## Modelo y matemáticas

Todos los importes persistidos por el núcleo son cadenas canónicas de enteros en unidades mínimas, con hasta treinta dígitos. Se calculan con `BigInt` y las fracciones exactas existentes; no se convierten a `Number` para calcular dinero. Las series SVG convierten únicamente la posición visual; la tabla y el resultado conservan importes exactos. Moneda ISO de tres letras y escala de cero a cuatro decimales deben coincidir con la instantánea. No se suman monedas ni se aplican tipos de cambio implícitos.

### Libro, caja y cartera

El adaptador descifra versiones PH, comprueba su auditoría canónica, secuencia y compromiso de integridad y construye hechos `charge`, `receipt`, `expense` y sus anulaciones. Cada hecho lleva entidad, identificador estable, secuencia y fecha UTC de **registro autenticado**. Las fechas de emisión/vencimiento/egreso declaradas se conservan como procedencia; una declaración no se convierte en extracto bancario. Los pagos deben corresponder a un cargo vigente de la misma entidad y no superar su saldo. Se incluyen entidades archivadas para no borrar historia financiera.

Para cada corte: `saldo_cargo = cargo_vigente − recibos_vigentes`; `cartera = Σ saldo_cargo`. La caja es `apertura_aportada + Σ recibos − Σ egresos`, descontando los hechos anteriores a la fecha de apertura. Una anulación es una corrección administrativa en su fecha de registro: no prueba un reembolso bancario. Los cortes anteriores permanecen reproducibles.

Vencido significa vencimiento anterior al instante del corte. Los tramos son corriente, hasta 30 días, 31–60, 61–90 y más de 90; el primer tramo vencido incluye fracciones inferiores a un día. `proporción_vencida = cartera_vencida / cartera_total`; si el denominador es cero se devuelve `null`, no un porcentaje ficticio. `HHI = Σ saldo_entidad² / cartera_total²` usa solo el libro incluido.

La desviación es `presupuesto_aprobado_del_mes − egresos_del_mes`. Solo se utiliza un presupuesto contenido en ese mes calendario —o que termina exactamente al inicio del siguiente—; no se prorratean anualidades sin una regla aportada. Una ausencia de presupuesto comparable se informa explícitamente.

Las alertas detectan déficit según apertura aportada, aumento observado del saldo vencido, déficit proyectado condicional o un umbral de morosidad definido por el operador con fuente. No se inventa un SLA ni un umbral comercial universal.

### Proyección y escenarios

Para una ventana `w`, la predicción de cada flujo es la media exacta de sus últimos `w` meses, redondeada a la unidad mínima, con cota inferior cero. Los valores base se incorporan recursivamente a la serie; cada variante aplica por separado sus factores de facturación, recaudo y egresos. El factor de escenario no se compone dos veces. Los factores iniciales optimista/pesimista son uno hasta que el operador declare otro supuesto: sus nombres no garantizan una mejora o empeoramiento.

`recaudo_t = min(recaudo_propuesto_t, cartera_abierta_t + facturación_t)`; `cartera_cierre_t = cartera_abierta_t + facturación_t − recaudo_t`; `caja_t = caja_anterior + recaudo_t − egresos_t`. Son identidades de planificación, no una estimación causal de conducta de pago.

Se requiere historia mensual consecutiva y revisada o una serie aportada con naturaleza `ORGANIZATION_PROVIDED`/`SIMULATED` y fuente explícita. No se mezclan las series aportadas con el libro registrado. La historia debe terminar el mes completo anterior; una historia antigua permite consultar su backtest, pero no producir una proyección actual silenciosamente.

La validación de origen rodante predice cada mes usando únicamente meses anteriores. Devuelve errores, MAE y MAE de una referencia ingenua de último valor. Con al menos tres errores, el cuantil empírico de errores absolutos construye bandas de sensibilidad de flujos propagadas a caja/cartera. No son intervalos calibrados de cobertura ni una validación retrospectiva independiente del stock de cartera: la serie aportada contiene flujos, no observaciones de ese stock. Dependencias temporales, choques y datos incompletos limitan su interpretación. Esta separación sigue la [validación temporal descrita en Forecasting: Principles and Practice](https://otexts.com/fpp3/toolbox.html).

La caja/cartera inicial corresponde al instante de captura. La proyección comienza el **mes siguiente**. El resto del mes actual se declara como brecha no modelada, con flujo adicional supuesto cero; no se añade otra vez un mes completo sobre un saldo ya parcial. Si esa hipótesis no sirve para la decisión, el operador debe aportar un plan de tesorería más detallado; no se presenta como liquidez diaria validada.

### Optimización presupuestaria

Problema implementado: maximizar `Σ prioridad_i × asignación_i`, sujeto a `mínimo_i ≤ asignación_i ≤ máximo_i` y `Σ asignación_i + reserva ≤ presupuesto_aprobado`. Las prioridades deben ser no negativas y tienen fuente. Las referencias normativas se conservan como restricciones declaradas; no se certifica su aplicabilidad automáticamente.

Algoritmo exacto para esta estructura: fijar mínimos y reserva, ordenar por prioridad marginal y distribuir el saldo hasta cada máximo. Los empates se resuelven por identificador estable. El argumento de intercambio prueba optimalidad: mover una unidad de un destino de menor prioridad a otro de mayor prioridad con capacidad no puede empeorar el objetivo. Prioridades cero pueden dejar recursos sin asignar. Los cálculos usan racionales exactos, no tolerancias flotantes.

Si un mínimo excede el máximo, o mínimos más reserva superan el presupuesto, se devuelve `infeasible` y un certificado con motivo/importes, sin reparto parcial presentado como solución. No modela proyectos binarios, precedencias, recursos acoplados, descuentos por volumen ni utilidad no lineal. Una referencia independiente con [SciPy/HiGHS](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linprog.html) se usa **solo en validación**, sin añadir una dependencia Python productiva.

### Propuestas de cuotas y redondeo

Cada componente declara presupuesto aprobado, importe, naturaleza y criterio. `cuota_ideal_i = importe_componente × peso_i / Σ pesos`. El criterio por coeficientes exige selección de la copropiedad completa, unidades activas con coeficientes presentes y suma exacta de `1.000.000` unidades de coeficiente —100% con cuatro decimales—. No normaliza un subconjunto incompleto. El criterio igual y los pesos personalizados requieren su propia regla; los pesos deben cubrir exactamente las unidades elegibles.

Se aplica Hamilton: partes enteras, después una unidad mínima a los mayores restos; empate por identificador. La misma regla divide el importe de cada unidad entre los pagos. Se comprueba `Σ cuotas = importe_componente`, `Σ componentes_por_presupuesto = presupuesto_aprobado` y `Σ pagos_unidad = cuota_unidad`. Si falta información o las sumas no coinciden, se retienen todas las asignaciones y se exige revisión. La predicción de medias usa redondeo a mitad alejándose de cero; no se usa ese método para repartir cuotas.

Colombia: la [Ley 675 en el Gestor Normativo oficial de la CRA](https://normas.cra.gov.co/gestor/docs/ley_0675_2001.htm) distingue coeficientes y módulos de contribución y vincula su determinación al reglamento. Por eso no se presume un único criterio universal ni se automatiza una tasa de reserva legal. La referencia de norma y la regla interna son obligatorias por componente; un administrador debe revisar su aplicabilidad. El motor normativo completo, vigencias y excepciones jurídicas pertenecen al incremento posterior. Una aprobación interna de planificación no sustituye asamblea, reglamento, análisis jurídico ni autorización de cobro.

## Decisiones arquitectónicas y seguridad

1. **Núcleo neutral y adaptador PH.** `shared/economics.v1.mjs`, `economicPlanning.mjs` y `economicMoney.mjs` son funciones sin base ni HTTP. `economicSnapshot.js` adapta solo el libro autorizado del objeto y descendientes. No duplica motores VAN/TIR, ni crea otro módulo o directorio de identidad.
2. **Evidencia inmutable privada en Atlas.** `economicIntelligence.service.js` captura instantánea, supuestos normalizados, resultado y manifiesto. Usa `operational_events` discriminado por `economic.scenario.version`, con índices parciales de comando/familia/revisión/vigencia. Revisión y aprobación generan otra versión, no sobrescriben resultados.
3. **Hebra reutilizado.** El documento canónico se comprime con gzip y divide en partes selladas con el AES-256-GCM existente; cada parte tiene AAD con organización, objeto, actor, comando, familia, revisión y posición. Un compromiso vincula el paquete completo. No se inventa criptografía ni se guardan resultados financieros en texto claro. Tope documental: 1 MB antes de comprimir; el límite puede alcanzarse antes de los límites máximos de entidades/hechos. Se rechaza con 413 y se exige reducir alcance.
4. **Permisos y consistencia.** Lectura/cálculo: administrador o analista vigente de la organización; aprobación: administrador. La autorización se revisa al publicar y se serializan escrituras con la revisión de organización. La aprobación recompone el resultado congelado, comprueba huellas y versión del motor y compara la base actual; una revocación o cambio del libro/coeficientes/presupuesto impide aprobar datos antiguos. Los índices e idempotencia impiden duplicación concurrente de un comando.
5. **Auditoría verificable.** Se auditan creación, consulta de evidencia, reproducción y aprobación con compromisos. Los hechos de origen remiten a la cadena canónica PH. Las rutas generales de alertas excluyen estos eventos: no permiten consultar, reconocer ni resolver su contenido. La lectura lleva `Cache-Control: no-store`. Las vistas de metadatos no descifran resultados.
6. **Reproducción exacta y mapa limitado.** El manifiesto conserva hashes de entrada/resultado/código, versión de motor, Node y política monetaria. Reproducir usa la captura congelada; revisar captura datos actuales. La capa de saldos solo reside en memoria, ligada a usuario/organización/rol/objeto; se retira al cambiar contexto. Rojo significa saldo positivo, gris saldo registrado cero. No es un mapa de riesgo ni normaliza por área/población; se informa cuántas entidades sin geometría se omiten.

La gestión de secretos y claves permanece en Backstage Security; no hay dependencias SATYA, Vault o Sincronía. Los ensayos usan claves aleatorias efímeras en la base temporal. No se han configurado claves productivas ni sustitutos ficticios para proveedores ausentes.

## Contrato y uso reproducible

Base autenticada: `/api/assets/layers/horizontal-property/:id/economics`. La organización y los permisos provienen de la sesión vigente, nunca de un campo aceptado del cuerpo.

| Método | Recurso | Uso |
| --- | --- | --- |
| POST | `/preview` | Moneda/escala; disponibilidad del libro y presupuestos |
| GET / POST | `/scenarios` | Listar treinta familias vigentes / calcular y guardar con clave idempotente |
| GET | `/scenarios/:scenario` | Recuperar una versión autorizada y auditada |
| POST | `/scenarios/:scenario/revise` | `revision` y `assumptions`; captura nueva, historia conservada |
| POST | `/scenarios/:scenario/approve` | Admin, `revision` y `reference`; aprobación interna en versión nueva |
| POST | `/scenarios/:scenario/reproduce` | Comparar resultado exacto con huellas de la captura original |

Los errores distinguen datos inválidos, falta de acceso, conflicto de versión/integridad, límites, cuota y claves no configuradas. Ejecuciones acotadas a 500 entidades, 5.000 versiones/hechos y 36 periodos; proyección hasta doce meses, hasta cinco variantes adicionales al escenario base. El panel expone formularios sencillos y opciones avanzadas progresivas; las series/pesos personalizados se aportan en JSON con contrato explícito. No hay carga bancaria ni inferencia automática de reglas internas.

[Ejemplo sintético completo](examples/economic-planning.json): `node scripts/run-economic-example.js` recalcula y verifica sus invariantes sin conexión, crea el resultado de ejemplo y no escribe Atlas. La aceptación real se reproduce con `node scripts/verify-horizontal-property.js --apply --economics` **solo cuando la conexión coincide con la cuenta de pruebas previamente autorizada**. El harness retira exclusivamente su base nueva marcada; no modifica la base original.

## Validación y cierre

Regresión final: **441 backend, 440 aprobadas y una omitida; 38 frontend aprobadas; build aprobado**. La omisión es el recorrido vial externo opt-in ya existente. Las pruebas nuevas cubren dinero superior a precisión binaria, redondeo, conservación, anulaciones, antigüedad, ausencia de denominador, backtest sin fuga temporal, presupuesto inviable, coeficientes incompletos, idempotencia, cambios de base, permisos, revocación, manipulación de evidencia y exclusión de alertas generales. Los módulos científicos anteriores no se modifican.

Comparación: 208 enumeraciones enteras exhaustivas y 48 casos frente a HiGHS. Rendimiento del núcleo, cuatro repeticiones locales con 500 entidades/5.000 hechos/36 meses: mediana 251 ms, máximo 344 ms en la medición guardada; no incluye Atlas/HTTP, carga concurrente ni memoria de producción. [Referencia y medición](evidence/economic-reference-performance.json).

La [aceptación Atlas y navegador](evidence/economic-intelligence-live.json) registra los controles ejecutados, auditoría y retirada de la base. El [postflight](evidence/economic-postflight.json) vincula las fuentes y evidencias de la entrega. Los resultados de navegador corresponden a la aplicación construida y API local con Atlas real; se bloquean mapas externos y WebGL y no se certifica su representación gráfica. La capa GeoJSON y el aislamiento del contexto sí se comprueban mediante pruebas y leyenda del recorrido.

Pendiente fuera de este incremento: adaptadores sectoriales distintos de PH, modelos de cobro estacionales/causales o selección automática de modelos, conciliación bancaria, restricciones presupuestarias generales, motor normativo Colombia, Community, Colab y cierre operativo de producción. No se declara implementado el desarrollo integral de toda la plataforma. **NO_GO productivo permanece vigente** por las condiciones del [expediente de producción](BACKSTAGE_PRODUCTION_GO_NO_GO.md).
