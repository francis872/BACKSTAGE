const express = require('express');
const cors = require('cors');
const { query } = require('./db');
const { verifyPassword, createToken, authenticate, authorizeRole } = require('./auth');
const { evaluateLocation } = require('./scoring');
const { registerIntegrationSource, recordIntegrationEvent, getPendingEvents, markEventProcessed } = require('./ingestion');
const { computeTerritorialIndex, getLatestIndexSnapshot, detectGaps, simulateInfrastructure } = require('./earthart');
const app = express();
const port = process.env.PORT || 4000;

const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'BACKSTAGE Intelligence Backend' });
});

app.get('/locations', async (req, res) => {
  try {
    const result = await query('SELECT * FROM locations ORDER BY location_id LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar las ubicaciones.' });
  }
});

app.get('/locations/nearby', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius) || 2000;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'Latitud y longitud válidas son requeridas.' });
    }

    const point = 'SRID=4326;POINT(' + lng + ' ' + lat + ')';
    const result = await query(
      `SELECT
         l.*,
         COALESCE(ra.score, NULL) AS risk_score,
         ST_Distance(l.geom::geography, ST_GeomFromText($1)::geography) AS distance_m
       FROM locations l
       LEFT JOIN risk_assessments ra ON ra.location_id = l.location_id
       WHERE l.geom IS NOT NULL
         AND ST_DWithin(l.geom::geography, ST_GeomFromText($1)::geography, $2)
       ORDER BY distance_m
       LIMIT 100`,
      [point, radius]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar ubicaciones cercanas.' });
  }
});

app.get('/locations/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM locations WHERE location_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ubicación no encontrada.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar la ubicación.' });
  }
});

app.get('/insights/summary', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         (SELECT COUNT(*) FROM locations) AS locations,
         (SELECT COUNT(*) FROM risk_assessments) AS risk_assessments,
         (SELECT COUNT(*) FROM retail_zones) AS retail_zones,
         (SELECT COUNT(*) FROM recommendations) AS recommendations`
    );
    res.json(result.rows[0] || {});
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar el resumen de insights.' });
  }
});

app.get('/real-estate/portfolio', async (req, res) => {
  try {
    const result = await query(
      `WITH latest_valuations AS (
         SELECT DISTINCT ON (location_id)
           location_id, estimated_value, annual_appreciation_pct, development_potential
         FROM property_valuations
         ORDER BY location_id, valued_at DESC, valuation_id DESC
       ),
       latest_risks AS (
         SELECT DISTINCT ON (location_id) location_id, score
         FROM risk_assessments
         ORDER BY location_id, assessed_at DESC, risk_id DESC
       )
       SELECT
         COUNT(*) AS properties,
         COALESCE(SUM(pv.estimated_value), 0) AS estimated_portfolio_value,
         COALESCE(ROUND(AVG(pv.annual_appreciation_pct)::numeric, 2), 0) AS average_appreciation_pct,
         COALESCE(ROUND(AVG(lr.score * 100)::numeric, 2), 0) AS average_risk_score
       FROM locations l
       LEFT JOIN latest_valuations pv ON pv.location_id = l.location_id
       LEFT JOIN latest_risks lr ON lr.location_id = l.location_id
       WHERE l.type = 'property'`
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar el portafolio inmobiliario.' });
  }
});

app.get('/real-estate/properties', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         l.location_id, l.external_id, l.name, l.address, l.city, l.region, l.latitude, l.longitude,
         pv.valuation_id, pv.valued_at, pv.land_area_m2, pv.price_per_m2, pv.estimated_value,
         pv.annual_appreciation_pct, pv.development_potential, pv.zoning, pv.details AS valuation_details,
         ra.flood_risk, ra.landslide_risk, ra.crime_risk, ra.climate_exposure, ra.score AS risk_score,
         ROUND((
           COALESCE(pv.development_potential, 0) * 0.45 +
           COALESCE(pv.annual_appreciation_pct, 0) * 4 * 0.30 +
           COALESCE(ra.score, 0) * 100 * 0.25
         )::numeric, 2) AS investment_score
       FROM locations l
       LEFT JOIN LATERAL (
         SELECT * FROM property_valuations
         WHERE location_id = l.location_id
         ORDER BY valued_at DESC, valuation_id DESC LIMIT 1
       ) pv ON true
       LEFT JOIN LATERAL (
         SELECT * FROM risk_assessments
         WHERE location_id = l.location_id
         ORDER BY assessed_at DESC, risk_id DESC LIMIT 1
       ) ra ON true
       WHERE l.type = 'property'
       ORDER BY investment_score DESC NULLS LAST, l.name`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar los lotes inmobiliarios.' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const userResult = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const user = userResult.rows[0];
    const valid = verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = createToken(user);
    res.json({ token, user: { user_id: user.user_id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Error al autenticar usuario.' });
  }
});

app.post('/integrations/sources', authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { name, type, config } = req.body;
    const source = await registerIntegrationSource(name, type, config || {});
    res.status(201).json(source);
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar la fuente de integración.' });
  }
});

app.post('/integrations/events', authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { source_id, external_id, payload } = req.body;
    const event = await recordIntegrationEvent(source_id, external_id, payload || {});
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar el evento de integración.' });
  }
});

app.get('/integrations/events/pending', async (req, res) => {
  try {
    const events = await getPendingEvents(100);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar eventos pendientes.' });
  }
});

app.post('/integrations/events/:id/complete', async (req, res) => {
  try {
    const eventId = req.params.id;
    await markEventProcessed(eventId, 'processed');
    res.json({ event_id: eventId, status: 'processed' });
  } catch (error) {
    res.status(500).json({ error: 'Error al marcar evento como procesado.' });
  }
});

app.post('/scoring/evaluate', authenticate, authorizeRole('analyst'), async (req, res) => {
  try {
    const { location_id, model_id } = req.body;
    if (!location_id) {
      return res.status(400).json({ error: 'location_id es requerido.' });
    }
    const evaluation = await evaluateLocation(location_id, model_id || null);
    res.status(201).json(evaluation);
  } catch (error) {
    res.status(500).json({ error: 'Error al evaluar la puntuación de la ubicación.' });
  }
});

app.get('/scoring/latest/:location_id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM scoring_results
       WHERE location_id = $1
       ORDER BY evaluated_at DESC
       LIMIT 1`,
      [req.params.location_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No existe una puntuación para esta ubicación.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar la puntuación de la ubicación.' });
  }
});

app.get('/recommendations', async (req, res) => {
  try {
    const result = await query('SELECT * FROM recommendations ORDER BY requested_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar recomendaciones.' });
  }
});

app.get('/recommendation/example', async (req, res) => {
  try {
    const locationResult = await query(
      `SELECT l.name, l.address, h.metric->>'queue_minutes' AS queue_minutes, h.metric->>'occupancy' AS occupancy
       FROM locations l
       LEFT JOIN location_histories h ON h.location_id = l.location_id
       WHERE l.external_id = 'mcd-001'
       ORDER BY h.observed_at DESC LIMIT 1`
    );

    const restaurant = locationResult.rows[0];
    if (!restaurant) {
      return res.json({
        message: 'No se encontró un restaurante de ejemplo en la base de datos.'
      });
    }

    const queueMinutes = restaurant.queue_minutes ? Number(restaurant.queue_minutes) : null;
    const occupancy = restaurant.occupancy ? Number(restaurant.occupancy) : null;
    const message = queueMinutes
      ? `El restaurante ${restaurant.name} tiene una fila estimada de ${queueMinutes} minutos. Si recorres 600 metros adicionales ahorrarás 14 minutos.`
      : `El restaurante ${restaurant.name} no tiene datos de espera en este momento, pero está disponible para análisis.`;

    res.json({
      message,
      location: {
        name: restaurant.name,
        address: restaurant.address,
        queue_minutes: queueMinutes,
        occupancy,
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al generar la recomendación de ejemplo.' });
  }
});

app.get('/retail-zones', async (req, res) => {
  try {
    const result = await query('SELECT * FROM retail_zones ORDER BY retail_zone_id');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar zonas retail.' });
  }
});

app.get('/retail-zones/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM retail_zones WHERE retail_zone_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Zona retail no encontrada.' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar la zona retail.' });
  }
});

app.post('/retail-zones', async (req, res) => {
  try {
    const { name, city, region, country, population_density, pedestrian_traffic_score, vehicle_traffic_score, purchasing_power_index } = req.body;
    const result = await query(
      `INSERT INTO retail_zones (name, city, region, country, population_density, pedestrian_traffic_score, vehicle_traffic_score, purchasing_power_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, city, region, country, population_density, pedestrian_traffic_score, vehicle_traffic_score, purchasing_power_index]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear la zona retail.' });
  }
});

app.put('/retail-zones/:id', async (req, res) => {
  try {
    const { name, city, region, country, population_density, pedestrian_traffic_score, vehicle_traffic_score, purchasing_power_index } = req.body;
    const result = await query(
      `UPDATE retail_zones SET
         name = $1,
         city = $2,
         region = $3,
         country = $4,
         population_density = $5,
         pedestrian_traffic_score = $6,
         vehicle_traffic_score = $7,
         purchasing_power_index = $8,
         created_at = created_at
       WHERE retail_zone_id = $9 RETURNING *`,
      [name, city, region, country, population_density, pedestrian_traffic_score, vehicle_traffic_score, purchasing_power_index, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Zona retail no encontrada.' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la zona retail.' });
  }
});

app.delete('/retail-zones/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM retail_zones WHERE retail_zone_id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Zona retail no encontrada.' });
    res.json({ message: 'Zona retail eliminada correctamente.', deleted: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la zona retail.' });
  }
});

app.get('/risk-components', async (req, res) => {
  try {
    const result = await query('SELECT * FROM risk_components ORDER BY component_id');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar componentes de riesgo.' });
  }
});

app.get('/risk-components/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM risk_components WHERE component_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Componente de riesgo no encontrado.' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar el componente de riesgo.' });
  }
});

app.post('/risk-components', async (req, res) => {
  try {
    const { risk_id, component_type, component_score, notes } = req.body;
    const result = await query(
      `INSERT INTO risk_components (risk_id, component_type, component_score, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [risk_id, component_type, component_score, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el componente de riesgo.' });
  }
});

app.put('/risk-components/:id', async (req, res) => {
  try {
    const { risk_id, component_type, component_score, notes } = req.body;
    const result = await query(
      `UPDATE risk_components SET
         risk_id = $1,
         component_type = $2,
         component_score = $3,
         notes = $4
       WHERE component_id = $5 RETURNING *`,
      [risk_id, component_type, component_score, notes, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Componente de riesgo no encontrado.' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el componente de riesgo.' });
  }
});

app.delete('/risk-components/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM risk_components WHERE component_id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Componente de riesgo no encontrado.' });
    res.json({ message: 'Componente de riesgo eliminado correctamente.', deleted: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el componente de riesgo.' });
  }
});

app.get('/recommendations/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM recommendations WHERE recommendation_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Recomendación no encontrada.' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar la recomendación.' });
  }
});

app.post('/recommendations', async (req, res) => {
  try {
    const { location_id, query_type, parameters, result, score } = req.body;
    const inserted = await query(
      `INSERT INTO recommendations (location_id, query_type, parameters, result, score)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [location_id, query_type, parameters, result, score]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear la recomendación.' });
  }
});

app.put('/recommendations/:id', async (req, res) => {
  try {
    const { location_id, query_type, parameters, result, score } = req.body;
    const updated = await query(
      `UPDATE recommendations SET
         location_id = $1,
         query_type = $2,
         parameters = $3,
         result = $4,
         score = $5
       WHERE recommendation_id = $6 RETURNING *`,
      [location_id, query_type, parameters, result, score, req.params.id]
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Recomendación no encontrada.' });
    res.json(updated.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la recomendación.' });
  }
});

app.delete('/recommendations/:id', async (req, res) => {
  try {
    const deleted = await query('DELETE FROM recommendations WHERE recommendation_id = $1 RETURNING *', [req.params.id]);
    if (deleted.rows.length === 0) return res.status(404).json({ error: 'Recomendación no encontrada.' });
    res.json({ message: 'Recomendación eliminada correctamente.', deleted: deleted.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la recomendación.' });
  }
});

// EarthArt: territorio, índice territorial, detector de brechas y motor predictivo.
app.get('/territorial/units', async (req, res) => {
  try {
    const result = await query('SELECT * FROM territorial_units ORDER BY unit_id');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar las unidades territoriales.' });
  }
});

app.get('/territorial/units/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM territorial_units WHERE unit_id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Unidad territorial no encontrada.' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar la unidad territorial.' });
  }
});

app.post('/territorial/units', async (req, res) => {
  try {
    const { external_id, name, unit_type, parent_unit_id, city, region, country, population, population_growth_pct, area_km2, latitude, longitude } = req.body;
    const result = await query(
      `INSERT INTO territorial_units
         (external_id, name, unit_type, parent_unit_id, city, region, country, population, population_growth_pct, area_km2, latitude, longitude, geom)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Colombia'), $8, $9, $10, $11, $12,
         CASE WHEN $11 IS NOT NULL AND $12 IS NOT NULL THEN ST_SetSRID(ST_MakePoint($12, $11), 4326) ELSE NULL END)
       RETURNING *`,
      [external_id, name, unit_type, parent_unit_id || null, city, region, country, population, population_growth_pct, area_km2, latitude, longitude]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear la unidad territorial.' });
  }
});

app.put('/territorial/units/:id', async (req, res) => {
  try {
    const { external_id, name, unit_type, parent_unit_id, city, region, country, population, population_growth_pct, area_km2, latitude, longitude } = req.body;
    const result = await query(
      `UPDATE territorial_units SET
         external_id = $1, name = $2, unit_type = $3, parent_unit_id = $4, city = $5, region = $6,
         country = COALESCE($7, 'Colombia'), population = $8, population_growth_pct = $9, area_km2 = $10,
         latitude = $11, longitude = $12,
         geom = CASE WHEN $11 IS NOT NULL AND $12 IS NOT NULL THEN ST_SetSRID(ST_MakePoint($12, $11), 4326) ELSE NULL END,
         updated_at = now()
       WHERE unit_id = $13 RETURNING *`,
      [external_id, name, unit_type, parent_unit_id || null, city, region, country, population, population_growth_pct, area_km2, latitude, longitude, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Unidad territorial no encontrada.' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la unidad territorial.' });
  }
});

app.delete('/territorial/units/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM territorial_units WHERE unit_id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Unidad territorial no encontrada.' });
    res.json({ message: 'Unidad territorial eliminada correctamente.', deleted: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la unidad territorial.' });
  }
});

app.get('/territorial/facilities', async (req, res) => {
  try {
    const { unit_id } = req.query;
    const result = unit_id
      ? await query('SELECT * FROM territorial_facilities WHERE unit_id = $1 ORDER BY facility_id', [unit_id])
      : await query('SELECT * FROM territorial_facilities ORDER BY facility_id LIMIT 200');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar las instalaciones territoriales.' });
  }
});

app.post('/territorial/facilities', async (req, res) => {
  try {
    const { unit_id, location_id, facility_type, name, capacity, latitude, longitude } = req.body;
    const result = await query(
      `INSERT INTO territorial_facilities (unit_id, location_id, facility_type, name, capacity, latitude, longitude, geom)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
         CASE WHEN $6 IS NOT NULL AND $7 IS NOT NULL THEN ST_SetSRID(ST_MakePoint($7, $6), 4326) ELSE NULL END)
       RETURNING *`,
      [unit_id, location_id || null, facility_type, name, capacity, latitude, longitude]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear la instalación territorial.' });
  }
});

app.get('/territorial/dimension-scores', async (req, res) => {
  try {
    const { unit_id } = req.query;
    const result = unit_id
      ? await query('SELECT * FROM territorial_dimension_scores WHERE unit_id = $1 ORDER BY dimension, measured_at DESC', [unit_id])
      : await query('SELECT * FROM territorial_dimension_scores ORDER BY unit_id, dimension LIMIT 200');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar los puntajes por dimensión.' });
  }
});

app.post('/territorial/dimension-scores', async (req, res) => {
  try {
    const { unit_id, dimension, score, measured_at, details } = req.body;
    if (!unit_id || !dimension || score === undefined) {
      return res.status(400).json({ error: 'unit_id, dimension y score son requeridos.' });
    }
    const result = await query(
      `INSERT INTO territorial_dimension_scores (unit_id, dimension, score, measured_at, details)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5)
       ON CONFLICT (unit_id, dimension, measured_at)
       DO UPDATE SET score = EXCLUDED.score, details = EXCLUDED.details
       RETURNING *`,
      [unit_id, dimension, score, measured_at || null, details || {}]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar el puntaje por dimensión.' });
  }
});

app.get('/territorial/units/:id/index', async (req, res) => {
  try {
    const existing = await getLatestIndexSnapshot(req.params.id);
    if (existing) return res.json(existing);
    const computed = await computeTerritorialIndex(req.params.id);
    res.json(computed.snapshot);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar el índice territorial.' });
  }
});

app.post('/territorial/units/:id/index/recompute', async (req, res) => {
  try {
    const computed = await computeTerritorialIndex(req.params.id);
    res.status(201).json(computed.snapshot);
  } catch (error) {
    res.status(500).json({ error: 'Error al recalcular el índice territorial.' });
  }
});

app.get('/territorial/units/:id/gaps', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM territorial_gaps WHERE unit_id = $1 ORDER BY detected_at DESC LIMIT 50',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar las brechas territoriales.' });
  }
});

app.post('/territorial/units/:id/gaps/detect', async (req, res) => {
  try {
    const gaps = await detectGaps(req.params.id);
    res.status(201).json(gaps);
  } catch (error) {
    res.status(500).json({ error: 'Error al detectar brechas territoriales.' });
  }
});

app.get('/territorial/gaps', async (req, res) => {
  try {
    const result = await query(
      `SELECT g.*, u.name AS unit_name FROM territorial_gaps g
       JOIN territorial_units u ON u.unit_id = g.unit_id
       WHERE g.resolved = false
       ORDER BY g.detected_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar las brechas territoriales.' });
  }
});

app.post('/territorial/units/:id/simulate', async (req, res) => {
  try {
    const simulation = await simulateInfrastructure(req.params.id, req.body || {});
    if (!simulation) return res.status(404).json({ error: 'Unidad territorial no encontrada.' });
    res.status(201).json(simulation);
  } catch (error) {
    res.status(500).json({ error: 'Error al ejecutar la simulación territorial.' });
  }
});

app.listen(port, () => {
  console.log(`BACKSTAGE backend escuchando en http://localhost:${port}`);
});
