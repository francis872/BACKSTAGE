export const economicOwner = (user, locationId) => `${user.user_id}:${user.organization_id}:${user.role}:${locationId}`;
export function economicOverlay(evidence) {
  const rows = new Map(evidence.result.current.receivables.entities.map(r => [r.entity_id,r]));
  return { title:`Saldo registrado · ${evidence.result.currency}`,currency:evidence.result.currency,scale:evidence.result.scale,captured_at:evidence.snapshot.captured_at,
    geojson:{type:'FeatureCollection',features:evidence.snapshot.entities.filter(e=>e.geometry&&rows.has(e.id)).map(e=>({type:'Feature',id:e.id,geometry:e.geometry,properties:{entity_id:e.id,outstanding_minor:rows.get(e.id).outstanding_minor,has_balance:BigInt(rows.get(e.id).outstanding_minor)>0n}}))},
    omitted_unlocated:evidence.snapshot.entities.filter(e=>!e.geometry&&rows.has(e.id)).length,
    legend:'Rojo: entidad con saldo; gris: sin saldo registrado. No representa riesgo, tasa por área ni población.'};
}
export function scopedEconomicOverlay(value,user,locationId,visible) {return visible&&['admin','analyst'].includes(user.role)&&value?.owner===economicOwner(user,locationId)?value.data:null;}
