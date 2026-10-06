# BACKSTAGE Geospatial Workspace

Este directorio contiene recursos de intercambio para el motor geoespacial nativo de BACKSTAGE. PostgreSQL conserva datos operativos y geometrías GeoJSON; MongoDB Atlas puede almacenar el modelo vectorial, versiones y embeddings territoriales.

## Estructura

- `qgis/`: recursos históricos opcionales para inspección externa.
- `styles/`: estilos de capas.
- `sql/`: validaciones compatibles con PostgreSQL estándar.
- `imports/`: guía de carga de GeoJSON y CSV.
- `exports/`: salida de capas procesadas para intercambio.
- `sample-data/`: datasets demostrativos.

## Modelo geométrico

- Puntos: `{ "type": "Point", "coordinates": [longitud, latitud] }`.
- Polígonos: GeoJSON `Polygon` con anillos cerrados.
- Coordenadas geográficas: WGS84 (`EPSG:4326`) por convención de aplicación, sin tipos ni extensiones espaciales en PostgreSQL.
- Distancias, pertenencia a polígonos, índices Quadtree y curvas de nivel se calculan en `backend/spatial/`.

## Validaciones mínimas

Ejecutar [`sql/validation.sql`](./sql/validation.sql) para detectar geometrías ausentes, tipos JSON incorrectos y coordenadas incompletas.

Los datos incluidos son demostrativos (`confidence_level = 'demo'`, `data_mode = 'demo'`) y no deben presentarse como oficiales.
