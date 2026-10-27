// The existing native envelope format. Authorization belongs to the calling resource service.
const binding=row=>({kind:'normative.record.version',organization_id:row.organization_id,location_id:row.normative.location_id,event_id:row.operational_event_id,type:row.normative.type,family_id:row.normative.family_id,revision:row.normative.revision,actor_user_id:row.actor_user_id,command_key:row.normative.command_key});
module.exports={binding};
