const DIMENSIONS = ['education', 'health', 'infrastructure', 'economy', 'environment', 'security', 'connectivity', 'housing', 'services'];

const locations = [
  {
    location_id: 1,
    external_id: 'mcd-001',
    name: "McDonald's Centro",
    type: 'restaurant',
    address: 'Calle 123 #45-67',
    city: 'Bogotá',
    region: 'Cundinamarca',
    country: 'Colombia',
    latitude: 4.711,
    longitude: -74.0721,
    capacity: 120,
  },
  {
    location_id: 2,
    external_id: 'sbux-001',
    name: 'Starbucks Parque',
    type: 'cafe',
    address: 'Carrera 15 #95-30',
    city: 'Bogotá',
    region: 'Cundinamarca',
    country: 'Colombia',
    latitude: 4.6693,
    longitude: -74.0536,
    capacity: 80,
  },
  {
    location_id: 3,
    external_id: 'retail-001',
    name: 'Plaza Comercial Norte',
    type: 'retail',
    address: 'Avenida 20 #120-10',
    city: 'Bogotá',
    region: 'Cundinamarca',
    country: 'Colombia',
    latitude: 4.7501,
    longitude: -74.065,
    capacity: 250,
  },
  {
    location_id: 4,
    external_id: 'prop-001',
    name: 'Lote Vía La Calera',
    type: 'property',
    address: 'Km 3 Vía La Calera',
    city: 'Bogotá',
    region: 'Cundinamarca',
    country: 'Colombia',
    latitude: 4.7032,
    longitude: -74.0338,
    capacity: null,
  },
];

const riskByLocation = {
  1: 0.89,
  2: 0.92,
  3: 0.78,
  4: 0.62,
};

const propertyValuations = [
  {
    location_id: 4,
    land_area_m2: 1500,
    estimated_value: 6300000000,
    annual_appreciation_pct: 12.5,
    development_potential: 84,
    zoning: 'Residencial de densidad media',
  },
];

let retailZoneId = 2;
let riskComponentId = 3;
let recommendationId = 2;
let gapId = 3;
let simulationId = 2;

let retailZones = [
  {
    retail_zone_id: 1,
    name: 'Norte Comercial',
    city: 'Bogotá',
    region: 'Cundinamarca',
    country: 'Colombia',
    population_density: 13400.25,
    pedestrian_traffic_score: 88.5,
    vehicle_traffic_score: 72.1,
    purchasing_power_index: 87.3,
  },
];

let riskComponents = [
  {
    component_id: 1,
    risk_id: 1,
    component_type: 'flood_risk',
    component_score: 0.3,
    notes: 'Exposición media a inundación en temporadas de lluvia.',
  },
  {
    component_id: 2,
    risk_id: 1,
    component_type: 'crime_risk',
    component_score: 0.2,
    notes: 'Incidencia delictiva controlada en perímetro inmediato.',
  },
];

let recommendations = [
  {
    recommendation_id: 1,
    location_id: 3,
    query_type: 'new_store',
    parameters: { objective: 'maximize_foot_traffic' },
    result: { zone: 'Norte Comercial', action: 'abrir nueva tienda ancla' },
    score: 86.5,
    requested_at: new Date().toISOString(),
  },
];

const territorialUnits = [
  {
    unit_id: 1,
    external_id: 'bogota-usaquen',
    name: 'Usaquén',
    unit_type: 'localidad',
    city: 'Bogotá',
    region: 'Cundinamarca',
    country: 'Colombia',
    population: 561000,
    population_growth_pct: 8.3,
    area_km2: 65.3,
    latitude: 4.7026,
    longitude: -74.0304,
  },
  {
    unit_id: 2,
    external_id: 'bogota-suba',
    name: 'Suba',
    unit_type: 'localidad',
    city: 'Bogotá',
    region: 'Cundinamarca',
    country: 'Colombia',
    population: 1310000,
    population_growth_pct: 11.6,
    area_km2: 100.6,
    latitude: 4.7436,
    longitude: -74.0853,
  },
];

const territorialDimensionScores = {
  1: { education: 74, health: 71, infrastructure: 68, economy: 79, environment: 62, security: 58, connectivity: 76, housing: 80, services: 73 },
  2: { education: 63, health: 59, infrastructure: 52, economy: 70, environment: 55, security: 49, connectivity: 47, housing: 78, services: 61 },
};

let territorialGaps = [
  {
    gap_id: 1,
    unit_id: 2,
    gap_type: 'mobility_deficit',
    severity: 'medium',
    message: 'Déficit de conectividad frente al crecimiento de vivienda.',
    metric: { housing_score: 78, connectivity_score: 47 },
    detected_at: new Date().toISOString(),
    resolved: false,
  },
  {
    gap_id: 2,
    unit_id: 2,
    gap_type: 'infrastructure_lag',
    severity: 'high',
    message: 'Crecimiento poblacional por encima de la capacidad de infraestructura.',
    metric: { population_growth_pct: 11.6, infrastructure_score: 52 },
    detected_at: new Date().toISOString(),
    resolved: false,
  },
];

let indexSnapshots = {};
let simulations = [];

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function normalizePath(req) {
  const fromQuery = req.query && req.query.path ? req.query.path : '';
  const joined = Array.isArray(fromQuery) ? fromQuery.join('/') : String(fromQuery || '');
  return `/${joined}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeTerritorialIndex(unitId) {
  const unitScores = territorialDimensionScores[unitId];
  if (!unitScores) return null;
  const values = DIMENSIONS.map((dimension) => unitScores[dimension] ?? null).filter((value) => value != null);
  const compositeScore = values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
  const snapshot = {
    snapshot_id: `idx-${unitId}-${Date.now()}`,
    unit_id: unitId,
    composite_score: compositeScore,
    breakdown: unitScores,
    computed_at: new Date().toISOString(),
  };
  indexSnapshots[unitId] = snapshot;
  return snapshot;
}

function detectTerritorialGaps(unitId) {
  const unit = territorialUnits.find((item) => item.unit_id === unitId);
  if (!unit) return [];
  const scores = territorialDimensionScores[unitId] || {};
  const detected = [];

  if ((scores.connectivity ?? 0) < 50 && (scores.housing ?? 0) >= 70) {
    detected.push({
      gap_type: 'mobility_deficit',
      severity: 'medium',
      message: `Alta presión de vivienda (${scores.housing}/100) con conectividad baja (${scores.connectivity}/100).`,
      metric: { housing_score: scores.housing, connectivity_score: scores.connectivity },
    });
  }

  if ((unit.population_growth_pct ?? 0) > 10 && (scores.infrastructure ?? 0) < 55) {
    detected.push({
      gap_type: 'infrastructure_lag',
      severity: unit.population_growth_pct > 20 ? 'critical' : 'high',
      message: `Crecimiento poblacional de ${unit.population_growth_pct}% con infraestructura en ${scores.infrastructure}/100.`,
      metric: { population_growth_pct: unit.population_growth_pct, infrastructure_score: scores.infrastructure },
    });
  }

  const inserted = detected.map((gap) => {
    const row = {
      gap_id: gapId++,
      unit_id: unitId,
      ...gap,
      detected_at: new Date().toISOString(),
      resolved: false,
    };
    territorialGaps = [row, ...territorialGaps];
    return row;
  });
  return inserted;
}

function estimateScenario(unit, params) {
  const population = Number(unit.population) || 0;
  const capacity = Number(params.capacity) || 0;
  const costPerSeat = Number(params.cost_per_seat) || 0;
  const coverageKm = clamp(Number(params.coverage_radius_km) || 2, 0.5, 20);
  const catchment = clamp(population * (coverageKm / 10), 0, population);
  const benefited = Math.round(Math.min(catchment, capacity * 8));
  const estimatedCost = Math.round(capacity * costPerSeat);
  const coverageRatioPct = population > 0 ? Math.round((benefited / population) * 10000) / 100 : 0;
  const costPerPerson = benefited > 0 ? Math.round((estimatedCost / benefited) * 100) / 100 : null;

  return {
    name: params.name || null,
    capacity,
    coverage_radius_km: coverageKm,
    population_benefited: benefited,
    coverage_ratio_pct: coverageRatioPct,
    estimated_cost: estimatedCost,
    cost_per_person_benefited: costPerPerson,
  };
}

function computePortfolio() {
  const properties = computeProperties();
  const estimatedValue = properties.reduce((sum, item) => sum + Number(item.estimated_value || 0), 0);
  const avgAppreciation = properties.length
    ? Math.round((properties.reduce((sum, item) => sum + Number(item.annual_appreciation_pct || 0), 0) / properties.length) * 100) / 100
    : 0;
  const avgRisk = properties.length
    ? Math.round((properties.reduce((sum, item) => sum + Number(item.risk_score || 0), 0) / properties.length) * 100 * 100) / 100
    : 0;

  return {
    properties: properties.length,
    estimated_portfolio_value: estimatedValue,
    average_appreciation_pct: avgAppreciation,
    average_risk_score: avgRisk,
  };
}

function computeProperties() {
  return locations
    .filter((item) => item.type === 'property')
    .map((item) => {
      const valuation = propertyValuations.find((row) => row.location_id === item.location_id);
      const riskScore = Number(riskByLocation[item.location_id] || 0);
      const investmentScore = Math.round(((Number(valuation?.development_potential || 0) * 0.45 + Number(valuation?.annual_appreciation_pct || 0) * 4 * 0.3 + riskScore * 100 * 0.25) * 100)) / 100;
      return {
        ...item,
        ...valuation,
        risk_score: riskScore,
        investment_score: investmentScore,
      };
    })
    .sort((a, b) => b.investment_score - a.investment_score);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      resolve({});
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('JSON inválido en el cuerpo de la solicitud.'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  };

  const path = normalizePath(req);
  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  if (path === '/health' && req.method === 'GET') {
    sendJson(res, 200, { status: 'ok', service: 'BACKSTAGE Intelligence API (Vercel)' });
    return;
  }

  if (path === '/recommendation/example' && req.method === 'GET') {
    sendJson(res, 200, {
      message:
        "El restaurante McDonald's Centro tiene una fila estimada de 4 minutos. Si recorres 600 metros adicionales ahorrarás 14 minutos.",
      location: {
        name: "McDonald's Centro",
        address: 'Calle 123 #45-67',
        queue_minutes: 4,
        occupancy: 0.78,
      },
    });
    return;
  }

  if (path === '/locations' && req.method === 'GET') {
    sendJson(res, 200, locations);
    return;
  }

  if (path === '/locations/nearby' && req.method === 'GET') {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Number(req.query.radius || 2000);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      sendJson(res, 400, { error: 'Latitud y longitud válidas son requeridas.' });
      return;
    }
    const nearby = locations
      .map((item) => {
        const distance = haversineMeters(lat, lng, item.latitude, item.longitude);
        return { ...item, risk_score: riskByLocation[item.location_id] ?? null, distance_m: distance };
      })
      .filter((item) => item.distance_m <= radius)
      .sort((a, b) => a.distance_m - b.distance_m);
    sendJson(res, 200, nearby);
    return;
  }

  const locationMatch = path.match(/^\/locations\/(\d+)$/);
  if (locationMatch && req.method === 'GET') {
    const id = Number(locationMatch[1]);
    const location = locations.find((item) => item.location_id === id);
    if (!location) {
      sendJson(res, 404, { error: 'Ubicación no encontrada.' });
      return;
    }
    sendJson(res, 200, location);
    return;
  }

  if (path === '/insights/summary' && req.method === 'GET') {
    sendJson(res, 200, {
      locations: locations.length,
      risk_assessments: Object.keys(riskByLocation).length,
      retail_zones: retailZones.length,
      recommendations: recommendations.length,
    });
    return;
  }

  if (path === '/real-estate/portfolio' && req.method === 'GET') {
    sendJson(res, 200, computePortfolio());
    return;
  }

  if (path === '/real-estate/properties' && req.method === 'GET') {
    sendJson(res, 200, computeProperties());
    return;
  }

  if (path === '/retail-zones' && req.method === 'GET') {
    sendJson(res, 200, retailZones);
    return;
  }
  if (path === '/retail-zones' && req.method === 'POST') {
    const created = { retail_zone_id: retailZoneId++, ...body };
    retailZones = [...retailZones, created];
    sendJson(res, 201, created);
    return;
  }
  const retailMatch = path.match(/^\/retail-zones\/(\d+)$/);
  if (retailMatch && req.method === 'PUT') {
    const id = Number(retailMatch[1]);
    const index = retailZones.findIndex((item) => item.retail_zone_id === id);
    if (index === -1) {
      sendJson(res, 404, { error: 'Zona retail no encontrada.' });
      return;
    }
    retailZones[index] = { ...retailZones[index], ...body };
    sendJson(res, 200, retailZones[index]);
    return;
  }
  if (retailMatch && req.method === 'DELETE') {
    const id = Number(retailMatch[1]);
    const zone = retailZones.find((item) => item.retail_zone_id === id);
    if (!zone) {
      sendJson(res, 404, { error: 'Zona retail no encontrada.' });
      return;
    }
    retailZones = retailZones.filter((item) => item.retail_zone_id !== id);
    sendJson(res, 200, { message: 'Zona retail eliminada correctamente.', deleted: zone });
    return;
  }

  if (path === '/risk-components' && req.method === 'GET') {
    sendJson(res, 200, riskComponents);
    return;
  }
  if (path === '/risk-components' && req.method === 'POST') {
    const created = { component_id: riskComponentId++, ...body };
    riskComponents = [...riskComponents, created];
    sendJson(res, 201, created);
    return;
  }
  const riskMatch = path.match(/^\/risk-components\/(\d+)$/);
  if (riskMatch && req.method === 'PUT') {
    const id = Number(riskMatch[1]);
    const index = riskComponents.findIndex((item) => item.component_id === id);
    if (index === -1) {
      sendJson(res, 404, { error: 'Componente de riesgo no encontrado.' });
      return;
    }
    riskComponents[index] = { ...riskComponents[index], ...body };
    sendJson(res, 200, riskComponents[index]);
    return;
  }
  if (riskMatch && req.method === 'DELETE') {
    const id = Number(riskMatch[1]);
    const component = riskComponents.find((item) => item.component_id === id);
    if (!component) {
      sendJson(res, 404, { error: 'Componente de riesgo no encontrado.' });
      return;
    }
    riskComponents = riskComponents.filter((item) => item.component_id !== id);
    sendJson(res, 200, { message: 'Componente de riesgo eliminado correctamente.', deleted: component });
    return;
  }

  if (path === '/recommendations' && req.method === 'GET') {
    sendJson(res, 200, recommendations);
    return;
  }
  if (path === '/recommendations' && req.method === 'POST') {
    const created = {
      recommendation_id: recommendationId++,
      requested_at: new Date().toISOString(),
      ...body,
    };
    recommendations = [created, ...recommendations];
    sendJson(res, 201, created);
    return;
  }
  const recommendationMatch = path.match(/^\/recommendations\/(\d+)$/);
  if (recommendationMatch && req.method === 'PUT') {
    const id = Number(recommendationMatch[1]);
    const index = recommendations.findIndex((item) => item.recommendation_id === id);
    if (index === -1) {
      sendJson(res, 404, { error: 'Recomendación no encontrada.' });
      return;
    }
    recommendations[index] = { ...recommendations[index], ...body };
    sendJson(res, 200, recommendations[index]);
    return;
  }
  if (recommendationMatch && req.method === 'DELETE') {
    const id = Number(recommendationMatch[1]);
    const item = recommendations.find((entry) => entry.recommendation_id === id);
    if (!item) {
      sendJson(res, 404, { error: 'Recomendación no encontrada.' });
      return;
    }
    recommendations = recommendations.filter((entry) => entry.recommendation_id !== id);
    sendJson(res, 200, { message: 'Recomendación eliminada correctamente.', deleted: item });
    return;
  }

  if (path === '/territorial/units' && req.method === 'GET') {
    sendJson(res, 200, territorialUnits);
    return;
  }

  const indexMatch = path.match(/^\/territorial\/units\/(\d+)\/index$/);
  if (indexMatch && req.method === 'GET') {
    const unitId = Number(indexMatch[1]);
    const snapshot = indexSnapshots[unitId] || computeTerritorialIndex(unitId);
    if (!snapshot) {
      sendJson(res, 404, { error: 'Unidad territorial no encontrada.' });
      return;
    }
    sendJson(res, 200, snapshot);
    return;
  }

  const gapsMatch = path.match(/^\/territorial\/units\/(\d+)\/gaps$/);
  if (gapsMatch && req.method === 'GET') {
    const unitId = Number(gapsMatch[1]);
    const unitGaps = territorialGaps.filter((item) => item.unit_id === unitId).sort((a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at));
    sendJson(res, 200, unitGaps);
    return;
  }

  const detectGapMatch = path.match(/^\/territorial\/units\/(\d+)\/gaps\/detect$/);
  if (detectGapMatch && req.method === 'POST') {
    const unitId = Number(detectGapMatch[1]);
    const unit = territorialUnits.find((item) => item.unit_id === unitId);
    if (!unit) {
      sendJson(res, 404, { error: 'Unidad territorial no encontrada.' });
      return;
    }
    const createdGaps = detectTerritorialGaps(unitId);
    sendJson(res, 201, createdGaps);
    return;
  }

  const simulateMatch = path.match(/^\/territorial\/units\/(\d+)\/simulate$/);
  if (simulateMatch && req.method === 'POST') {
    const unitId = Number(simulateMatch[1]);
    const unit = territorialUnits.find((item) => item.unit_id === unitId);
    if (!unit) {
      sendJson(res, 404, { error: 'Unidad territorial no encontrada.' });
      return;
    }

    const alternatives = Array.isArray(body.alternatives) && body.alternatives.length > 0 ? body.alternatives : [body];
    const evaluated = alternatives.map((alternative) => estimateScenario(unit, { ...body, ...alternative }));
    let bestAlternativeIndex = 0;

    evaluated.forEach((item, index) => {
      const best = evaluated[bestAlternativeIndex];
      const byCoverage = item.population_benefited - best.population_benefited;
      const byCost = (best.cost_per_person_benefited ?? Number.POSITIVE_INFINITY) - (item.cost_per_person_benefited ?? Number.POSITIVE_INFINITY);
      if (byCoverage > 0 || (byCoverage === 0 && byCost > 0)) {
        bestAlternativeIndex = index;
      }
    });

    const best = evaluated[bestAlternativeIndex];
    const recommendation = `Recomendación: alternativa ${String.fromCharCode(65 + bestAlternativeIndex)}. Beneficiaría a ${best.population_benefited.toLocaleString(
      'es-CO'
    )} personas (${best.coverage_ratio_pct}%) con un costo estimado de ${best.estimated_cost.toLocaleString('es-CO')}.`;

    const simulation = {
      simulation_id: simulationId++,
      unit_id: unitId,
      scenario_type: body.scenario_type || 'new_facility',
      parameters: body,
      result: {
        scenario_type: body.scenario_type || 'new_facility',
        alternatives: evaluated,
        best_alternative_index: bestAlternativeIndex,
      },
      recommendation,
      created_at: new Date().toISOString(),
    };
    simulations = [simulation, ...simulations];
    sendJson(res, 201, simulation);
    return;
  }

  sendJson(res, 404, { error: 'Endpoint no encontrado.' });
}
