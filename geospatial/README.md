# BACKSTAGE Geospatial Workspace (QGIS + PostGIS)

Este directorio contiene los recursos reproducibles para trabajar el flujo geoespacial en QGIS con PostGIS.

## Estructura

- `qgis/`: proyecto QGIS (`.qgz`) y configuración por entorno.
- `styles/`: estilos de capas.
- `sql/`: consultas de soporte para validación y análisis.
- `imports/`: guía de carga de datos (GeoJSON, CSV, SHP, GPKG).
- `exports/`: salida de capas procesadas para intercambio.
- `sample-data/`: referencia de datasets demo.

## Conexión a PostGIS desde QGIS

1. Abrir QGIS.
2. Ir a **Data Source Manager > PostgreSQL > New**.
3. Configurar:
   - Host: variable `PGHOST` o host de Neon.
   - Puerto: `5432`.
   - Base de datos: `PGDATABASE`.
   - Usuario: `PGUSER`.
4. Activar **Allow geometryless tables** para catálogos.
5. Guardar como conexión `BACKSTAGE_PostGIS`.

## Validaciones mínimas recomendadas

Ejecutar las consultas de [`sql/validation.sql`](./sql/validation.sql) para:

- Confirmar SRID `4326`.
- Verificar geometrías válidas.
- Revisar capas sin geometría.

## Fuentes de datos en modo demo

Los datos incluidos para McDonald’s Bogotá están etiquetados con `confidence_level = 'demo'` y `data_mode = 'demo'`.

No se deben presentar como datos oficiales.
