const d = require('./infrastructure/atlasDocuments');

async function loadLocationData(locationId,organizationId){
 const scope={...d.org(organizationId),location_id:d.id(locationId)};const location=await d.one('locations',scope);if(!location)return null;
 const [risk,indicators,market,suitability]=await Promise.all([d.one('risk_assessments',scope,{assessed_at:-1}),d.find('location_indicators',scope,{indicator_date:-1},10),d.find('location_market_scores',scope),d.find('site_suitability_scores',scope,{created_at:-1},5)]);
 return {location,risk,indicators,marketScores:market.map(r=>Number(r.score)||0),suitabilityScores:suitability.map(r=>Number(r.score_value)||0)};
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

async function evaluateLocation(locationId, modelId = null, organizationId) {
  const data = await loadLocationData(locationId, organizationId);
  if (!data) throw new (require('./utils/ApiError'))(404, 'Ubicación no encontrada.');
  const score = computeCompositeScore(data);
  const details = buildScoreDetails(data);

  const row=await d.insert('scoring_results','scoring_result_id',{...d.org(organizationId),location_id:d.id(locationId),model_id:modelId,score,details,evaluated_at:new Date()});

  return {
    result: row,
    details,
  };
}

module.exports = {
  evaluateLocation,
  computeCompositeScore,
  buildScoreDetails,
};
