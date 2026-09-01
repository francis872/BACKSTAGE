const { query } = require('./db');

async function loadLocationData(locationId) {
  const locationResult = await query('SELECT * FROM locations WHERE location_id = $1', [locationId]);
  if (locationResult.rows.length === 0) return null;

  const location = locationResult.rows[0];
  const riskResult = await query('SELECT * FROM risk_assessments WHERE location_id = $1 ORDER BY assessed_at DESC LIMIT 1', [locationId]);
  const indicatorsResult = await query('SELECT indicator_name, value FROM location_indicators WHERE location_id = $1 ORDER BY indicator_date DESC LIMIT 10', [locationId]);
  const marketResult = await query('SELECT score FROM location_market_scores WHERE location_id = $1', [locationId]);
  const suitabilityResult = await query('SELECT score_value FROM site_suitability_scores WHERE location_id = $1 ORDER BY created_at DESC LIMIT 5', [locationId]);

  return {
    location,
    risk: riskResult.rows[0] || null,
    indicators: indicatorsResult.rows,
    marketScores: marketResult.rows.map((row) => Number(row.score) || 0),
    suitabilityScores: suitabilityResult.rows.map((row) => Number(row.score_value) || 0),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeCompositeScore(data) {
  if (!data) return null;

  let score = 50;

  if (data.risk) {
    const riskScore = Number(data.risk.score) || 0;
    score += (50 - riskScore) * 0.3;
  }

  const trafficIndicator = data.indicators.find((item) => item.indicator_name === 'foot_traffic');
  if (trafficIndicator) {
    score += clamp((Number(trafficIndicator.value) / 1000) * 8, -10, 12);
  }

  if (data.marketScores.length > 0) {
    const averageMarket = data.marketScores.reduce((sum, value) => sum + value, 0) / data.marketScores.length;
    score += clamp((averageMarket - 70) * 0.2, -8, 12);
  }

  if (data.suitabilityScores.length > 0) {
    const averageSuitability = data.suitabilityScores.reduce((sum, value) => sum + value, 0) / data.suitabilityScores.length;
    score += clamp((averageSuitability - 75) * 0.15, -6, 10);
  }

  if (data.location.capacity) {
    score += clamp((Number(data.location.capacity) / 200) * 3, -5, 6);
  }

  return clamp(Math.round(score * 100) / 100, 0, 100);
}

function buildScoreDetails(data) {
  const details = {
    base: 50,
    riskImpact: 0,
    trafficImpact: 0,
    marketImpact: 0,
    suitabilityImpact: 0,
    capacityImpact: 0,
    finalScore: 0,
  };

  if (!data) return details;

  if (data.risk) {
    const riskScore = Number(data.risk.score) || 0;
    details.riskImpact = clamp((50 - riskScore) * 0.3, -15, 15);
  }

  const trafficIndicator = data.indicators.find((item) => item.indicator_name === 'foot_traffic');
  if (trafficIndicator) {
    details.trafficImpact = clamp((Number(trafficIndicator.value) / 1000) * 8, -10, 12);
  }

  if (data.marketScores.length > 0) {
    const averageMarket = data.marketScores.reduce((sum, value) => sum + value, 0) / data.marketScores.length;
    details.marketImpact = clamp((averageMarket - 70) * 0.2, -8, 12);
  }

  if (data.suitabilityScores.length > 0) {
    const averageSuitability = data.suitabilityScores.reduce((sum, value) => sum + value, 0) / data.suitabilityScores.length;
    details.suitabilityImpact = clamp((averageSuitability - 75) * 0.15, -6, 10);
  }

  if (data.location.capacity) {
    details.capacityImpact = clamp((Number(data.location.capacity) / 200) * 3, -5, 6);
  }

  details.finalScore = clamp(
    Math.round((details.base + details.riskImpact + details.trafficImpact + details.marketImpact + details.suitabilityImpact + details.capacityImpact) * 100) / 100,
    0,
    100
  );
  return details;
}

async function evaluateLocation(locationId, modelId = null) {
  const data = await loadLocationData(locationId);
  const score = computeCompositeScore(data);
  const details = buildScoreDetails(data);

  const insertResult = await query(
    `INSERT INTO scoring_results (model_id, location_id, score, details)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [modelId, locationId, score, details]
  );

  return {
    result: insertResult.rows[0],
    details,
  };
}

module.exports = {
  evaluateLocation,
  computeCompositeScore,
  buildScoreDetails,
};
