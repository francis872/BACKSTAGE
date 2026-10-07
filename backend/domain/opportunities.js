function buildOpportunityRanking(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const score = Number(row.factor_score);
    if (!Number.isFinite(score) || score < 0 || score > 100) continue;
    const id = Number(row.location_id);
    if (!groups.has(id)) groups.set(id, {
      location_id: id, name: row.location_name, type: row.location_type, city: row.city, region: row.region,
      latitude: row.latitude == null ? null : Number(row.latitude), longitude: row.longitude == null ? null : Number(row.longitude),
      latest_risk_score: row.latest_risk_score == null ? null : Number(row.latest_risk_score), factors: [],
    });
    groups.get(id).factors.push({ score_id: row.score_id, category: row.category, score, market_area: row.market_area, details: row.details || {} });
  }
  return [...groups.values()].map((item) => ({
    ...item,
    opportunity_score: Number((item.factors.reduce((sum, factor) => sum + factor.score, 0) / item.factors.length).toFixed(2)),
    factor_count: item.factors.length,
    methodology: 'arithmetic-mean-market-factors-v1',
  })).sort((a, b) => b.opportunity_score - a.opportunity_score || a.location_id - b.location_id)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

module.exports = { buildOpportunityRanking };
