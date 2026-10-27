const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getMongoDatabase } = require('./infrastructure/platformMongo');
const errorHandler = require('./middleware/errorHandler');
const auditLogger = require('./middleware/auditLogger');
const { platformSecurity } = require('./middleware/platformSecurity');
const { requestTelemetry, readinessResponse } = require('./middleware/requestTelemetry');
const { attachSecurityWebSocketServer } = require('./realtime/wsServer');
const { startOperationalSupervisor, stopOperationalSupervisor } = require('./services/operationalSupervisor.service');

const authRoutes = require('./routes/auth.routes');
const locationsRoutes = require('./routes/locations.routes');
const insightsRoutes = require('./routes/insights.routes');
const realEstateRoutes = require('./routes/realEstate.routes');
const retailZonesRoutes = require('./routes/retailZones.routes');
const riskComponentsRoutes = require('./routes/riskComponents.routes');
const riskAssessmentsRoutes = require('./routes/riskAssessments.routes');
const recommendationsRoutes = require('./routes/recommendations.routes');
const integrationsRoutes = require('./routes/integrations.routes');
const scoringRoutes = require('./routes/scoring.routes');
const territorialRoutes = require('./routes/territorial.routes');
const usersRoutes = require('./routes/users.routes');
const layersRoutes = require('./routes/layers.routes');
const analysisRoutes = require('./routes/analysis.routes');
const operationalEventsRoutes = require('./routes/operationalEvents.routes');
const operationsRoutes = require('./routes/operations.routes');
const auditLogsRoutes = require('./routes/auditLogs.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const terrainRoutes = require('./routes/terrain.routes');
const spatialIngestionRoutes = require('./routes/spatialIngestion.routes');
const cleanComRoutes = require('./routes/cleanCom.routes');
const soiRoutes = require('./routes/soi.routes');
const soiGeoRoutes = require('./routes/soiGeo.routes');
const soiTripsRoutes = require('./routes/soiTrips.routes');
const soiFleetRoutes = require('./routes/soiFleet.routes');
const bsieRoutes = require('./routes/bsie.routes');
const soiSanitaryRoutes = require('./routes/soiSanitary.routes');
const { getExampleRecommendation } = require('./controllers/recommendations.controller');

const app = express();
const port = process.env.PORT || 4000;
const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean)
  || ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowsAllOrigins = allowedOrigins.includes('*');

app.disable('x-powered-by');
app.use(platformSecurity);
app.use(requestTelemetry());
app.use(cors((req, callback) => {
  const origin = req.get('origin');
  const host = req.get('x-forwarded-host') || req.get('host');
  const sameOrigin = Boolean(origin && host && origin.replace(/^https?:\/\//, '') === host);
  const allowed = !origin || sameOrigin || allowsAllOrigins || allowedOrigins.includes(origin);
  callback(allowed ? null : new Error('Not allowed by CORS'), { origin: allowed, credentials: true });
}));

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '5mb' }));
app.use(auditLogger);
// Processed Clean Com artifacts are delivered only through authenticated APIs.
app.use('/cleancom', (req, res) => res.status(404).json({ error: 'Archivo interno no disponible.' }));

// Serve static files from frontend/dist
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
}

app.get('/health', (req, res) => readinessResponse(req, res, getMongoDatabase));
app.use('/auth', authRoutes);
app.use('/feed', require('./routes/feed.routes'));

app.use('/locations', locationsRoutes);
app.use('/assets', require('./routes/assets.routes'));
app.use('/comparisons', require('./routes/comparisons.routes'));
app.use('/geography', require('./routes/geography.routes'));
app.use('/insights', insightsRoutes);
app.use('/real-estate', realEstateRoutes);
app.use('/retail-zones', retailZonesRoutes);
app.use('/risk-components', riskComponentsRoutes);
app.use('/risk-assessments', riskAssessmentsRoutes);
app.use('/recommendations', recommendationsRoutes);
app.use('/integrations', integrationsRoutes);
app.use('/scoring', scoringRoutes);
app.use('/territorial', territorialRoutes);
app.use('/users', usersRoutes);
app.use('/layers', layersRoutes);
app.use('/analysis', analysisRoutes);
app.use('/operational-events', operationalEventsRoutes);
app.use('/operations', operationsRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/computational', require('./routes/computational.routes').createComputationalRouter());
app.use('/terrain', terrainRoutes);
app.use('/spatial', spatialIngestionRoutes);
app.use('/soi/geo', soiGeoRoutes);
app.use('/soi/trips', soiTripsRoutes);
app.use('/soi/fleet', soiFleetRoutes);
app.use('/soi/bsie', bsieRoutes);
app.use('/soi/sanitary', soiSanitaryRoutes);
app.use('/soi', soiRoutes);
app.use('/soi/historical', cleanComRoutes);
app.use('/clean-com', cleanComRoutes);
app.use('/audit-logs', auditLogsRoutes);

// SPA fallback: serve index.html for non-API routes
app.get('*', (req, res, next) => {
  // Skip if route starts with /api or already matched
  if (req.path.startsWith('/api')) {
    return next();
  }
  
  const indexPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  
  // Fallback API info if no frontend
  res.json({
    service: 'BACKSTAGE Intelligence Backend',
    version: '3.1.0',
    endpoints: {
      auth: '/auth',
      locations: '/locations',
      insights: '/insights',
      realEstate: '/real-estate',
      retailZones: '/retail-zones',
      riskComponents: '/risk-components',
      riskAssessments: '/risk-assessments',
      recommendations: '/recommendations',
      integrations: '/integrations',
      scoring: '/scoring',
      territorial: '/territorial',
      users: '/users',
      layers: '/layers',
      analysis: '/analysis',
      analytics: '/analytics',
      computational: '/computational',
      coreOpenApi: '/operations/openapi',
      terrain: '/terrain',
      spatial: '/spatial',
      auditLogs: '/audit-logs',
      securityEventsSocket: '/ws/security?token=<JWT>'
    }
  });
});

// API info endpoint (legacy)
app.get('/', (req, res) => {
  res.json({
    service: 'BACKSTAGE Intelligence Backend',
    version: '3.1.0',
    endpoints: {
      auth: '/auth',
      locations: '/locations',
      insights: '/insights',
      realEstate: '/real-estate',
      retailZones: '/retail-zones',
      riskComponents: '/risk-components',
      riskAssessments: '/risk-assessments',
      recommendations: '/recommendations',
      integrations: '/integrations',
      scoring: '/scoring',
      territorial: '/territorial',
      users: '/users',
      layers: '/layers',
      analysis: '/analysis',
      analytics: '/analytics',
      computational: '/computational',
      coreOpenApi: '/operations/openapi',
      terrain: '/terrain',
      spatial: '/spatial',
      auditLogs: '/audit-logs',
      securityEventsSocket: '/ws/security?token=<JWT>'
    }
  });
});

// Backward compatibility with existing frontend route.
app.get('/recommendation/example', getExampleRecommendation);

app.use(errorHandler);

if (require.main === module) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET es obligatorio para iniciar el backend.');
  }
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción.');
  }

  const server = http.createServer(app);
  attachSecurityWebSocketServer(server);
  server.listen(port, () => {
    console.log(`BACKSTAGE backend escuchando en http://localhost:${port}`);
    startOperationalSupervisor();
  });

  const shutdown = () => {
    stopOperationalSupervisor();
    server.close(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

module.exports = app;
