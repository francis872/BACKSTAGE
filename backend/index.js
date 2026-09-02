const express = require('express');
const http = require('http');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const auditLogger = require('./middleware/auditLogger');
const { attachSecurityWebSocketServer } = require('./realtime/wsServer');

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
const auditLogsRoutes = require('./routes/auditLogs.routes');
const { getExampleRecommendation } = require('./controllers/recommendations.controller');

const app = express();
const port = process.env.PORT || 4000;
const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001'];
const allowsAllOrigins = allowedOrigins.includes('*');

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowsAllOrigins || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(auditLogger);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'BACKSTAGE Intelligence Backend' });
});

// API info endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'BACKSTAGE Intelligence Backend',
    version: '0.1.0',
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
      auditLogs: '/audit-logs',
      securityEventsSocket: '/ws/security?token=<JWT>'
    }
  });
});

app.use('/auth', authRoutes);
app.use('/locations', locationsRoutes);
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
app.use('/audit-logs', auditLogsRoutes);

// Backward compatibility with existing frontend route.
app.get('/recommendation/example', getExampleRecommendation);

app.use(errorHandler);

if (require.main === module) {
  const server = http.createServer(app);
  attachSecurityWebSocketServer(server);
  server.listen(port, () => {
    console.log(`BACKSTAGE backend escuchando en http://localhost:${port}`);
  });
}

module.exports = app;
