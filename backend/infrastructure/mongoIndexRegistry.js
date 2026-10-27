// Storage schema composition point. Existing collection names and schema ID are preserved.
const unique = (key, options = {}) => ({ key, options: { unique: true, ...options } });
const index = (key, options = {}) => ({ key, options });
const INDEXES = {
  identity_users: [unique({ user_id: 1 }), unique({ email: 1 })],
  identity_organizations: [unique({ organization_id: 1 }), unique({ slug: 1 })],
  identity_memberships: [unique({ organization_id: 1, user_id: 1 }), index({ user_id: 1 })],
  identity_invitations: [unique({ invitation_id: 1 }), unique({ token_hash: 1 }), index({ organization_id: 1, created_at: -1 })],
  soi_configuration: [unique({ organization_id: 1 })],
  soi_assets: [unique({ location_id: 1 }), index({ organization_id: 1, location_id: -1 }), unique({ organization_id: 1, external_id: 1 }, { partialFilterExpression: { external_id: { $type: 'string' } } }), index({ geometry: '2dsphere' })],
  soi_operations: [unique({ operation_id: 1 }), index({ organization_id: 1, operation_id: -1 })],
  soi_vehicles: [unique({ vehicle_id: 1 }), unique({ organization_id: 1, plate: 1 })],
  soi_incidents: [unique({ incident_id: 1 }), index({ organization_id: 1, incident_id: -1 })],
  soi_crews: [unique({ crew_id: 1 }), index({ organization_id: 1, crew_id: -1 })],
  soi_service_orders: [unique({ service_order_id: 1 }), index({ organization_id: 1, status: 1, service_order_id: -1 })],
  soi_imports: [unique({ import_id: 1 }), unique({ organization_id: 1, preview_hash: 1 })],
  soi_comparisons: [unique({ comparison_id: 1 }), index({ organization_id: 1, comparison_id: -1 })],
  soi_route_plans: [unique({ route_plan_id: 1 }), index({ organization_id: 1, route_plan_id: -1 })],
  soi_trips: [unique({ trip_id: 1 }), unique({ organization_id: 1, user_id: 1 }, { partialFilterExpression: { open: true } }), index({ expires_at: 1 }, { expireAfterSeconds: 0 })],
  soi_trip_points: [unique({ point_id: 1 }), unique({ organization_id: 1, trip_id: 1, recorded_at: 1 }), index({ organization_id: 1, user_id: 1, trip_id: 1, point_id: 1 }), index({ expires_at: 1 }, { expireAfterSeconds: 0 })],
  soi_fleet_sources: [unique({ source_id: 1 }), index({ organization_id: 1, active: 1 })],
  soi_vehicle_positions: [unique({ position_id: 1 }), unique({ organization_id: 1, vehicle_id: 1, source_id: 1, event_id: 1 }), index({ organization_id: 1, vehicle_id: 1, recorded_at: -1 }), index({ organization_id: 1, vehicle_id: 1, position_id: 1 }), index({ expires_at: 1 }, { expireAfterSeconds: 0 })],
  soi_audit_events: [unique({ audit_log_id: 1 }), index({ organization_id: 1, created_at: -1 })],
  soi_audit_heads: [],
  soi_provider_locks: [],
  bsie_jobs: [unique({ job_id: 1 }), unique({ organization_id: 1, request_hash: 1 }), index({ state: 1, lease_until: 1, created_at: 1 }), index({ expires_at: 1 }, { expireAfterSeconds: 0 })],
  bsie_weights: [unique({ organization_id: 1, request_hash: 1 }), index({ expires_at: 1 }, { expireAfterSeconds: 0 })],
  soi_counters: [],
};
const {RESOURCES:SANITARY_RESOURCES}=require('../soi/sanitary.contract');
INDEXES.identity_users.push(unique({ 'mfa_login.challenge_hash': 1 }, { name: 'identity_mfa_challenge_v1', partialFilterExpression: { 'mfa_login.challenge_hash': { $type: 'string' } } }));
for(const spec of Object.values(SANITARY_RESOURCES))INDEXES[spec.collection]=[
  unique({record_id:1}),index({organization_id:1,record_id:-1}),
  ...(spec.ledger&&spec.fields.event_id?[unique({organization_id:1,event_id:1})]:[]),
];
INDEXES.soi_waste_categories.push(unique({organization_id:1,code:1}));
INDEXES.soi_measurements.push(index({organization_id:1,sensor_id:1,observed_at:-1}));
INDEXES.soi_carbon_entries.push(unique({organization_id:1,activity_reference:1}));
INDEXES.soi_carbon_entries.push(unique({organization_id:1,business_activity_reference:1},{partialFilterExpression:{active:true}}));
INDEXES.soi_emission_factors.push(unique({organization_id:1,name:1,version:1}));
INDEXES.soi_sanitary_alerts.push(index({organization_id:1,status:1,last_observed_at:-1}));
INDEXES.soi_domain_events=[unique({event_id:1}),unique({organization_id:1,event_key:1}),index({organization_id:1,event_id:1})];
INDEXES.soi_sanitary_versions=[unique({version_id:1}),unique({organization_id:1,resource_kind:1,resource_id:1,revision:1})];
const documentCollections={recommendations:'recommendation_id',layer_catalog:'layer_id',locations:'location_id',risk_assessments:'risk_id',risk_components:'component_id',property_valuations:'valuation_id',retail_zones:'retail_zone_id',analysis_runs:'analysis_run_id',analysis_results:'analysis_result_id',analysis_run_candidates:'analysis_run_candidate_id',operational_events:'operational_event_id',analytics_jobs:'analytics_job_id',command_executions:'command_execution_id',territorial_units:'unit_id',territorial_facilities:'facility_id',territorial_dimension_scores:'score_id',territorial_index_snapshots:'snapshot_id',territorial_gaps:'gap_id',territorial_simulations:'simulation_id',scoring_results:'scoring_result_id',integration_sources:'source_id',integration_events:'event_id'};
for(const [name,key] of Object.entries(documentCollections))INDEXES[name]=[unique({[key]:1}),index({organization_id:1,[key]:-1})];
INDEXES.analysis_run_candidates.push(unique({organization_id:1,analysis_run_id:1,location_id:1}));
INDEXES.territorial_dimension_scores.push(unique({organization_id:1,unit_id:1,dimension:1,measured_at:1}));
INDEXES.operational_events.push(unique({organization_id:1,dedupe_key:1},{partialFilterExpression:{dedupe_key:{$type:'string'},resolved_at:{$eq:null}}}));
INDEXES.integration_sources.push(unique({organization_id:1,name:1}));
// PH is a layer of canonical assets, not a separate database or asset store.
INDEXES.locations.push(unique({ organization_id: 1, 'metadata.horizontal_property.creation_key': 1 }, { name: 'ph_creation_v1', partialFilterExpression: { 'metadata.horizontal_property.creation_key': { $type: 'string' } } }));
INDEXES.locations.push(index({ organization_id: 1, 'metadata.horizontal_property.parent_id': 1, location_id: 1 }, { name: 'ph_parent_v1', partialFilterExpression: { 'metadata.horizontal_property.version': 1 } }));
INDEXES.locations.push(index({ organization_id: 1, 'metadata.horizontal_property.root_id': 1, location_id: 1 }, { name: 'ph_root_v1', partialFilterExpression: { 'metadata.horizontal_property.version': 1 } }));
INDEXES.operational_events.push(unique({ organization_id: 1, 'ph.location_id': 1, 'ph.command_key': 1 }, { name: 'ph_operation_command_v1', partialFilterExpression: { kind: 'ph.record.version' } }));
INDEXES.operational_events.push(unique({ organization_id: 1, 'ph.record_id': 1, 'ph.revision': 1 }, { name: 'ph_operation_revision_v1', partialFilterExpression: { kind: 'ph.record.version' } }));
INDEXES.operational_events.push(unique({ organization_id: 1, 'ph.record_id': 1 }, { name: 'ph_operation_current_v1', partialFilterExpression: { kind: 'ph.record.version', 'ph.current': true } }));
INDEXES.operational_events.push(index({ organization_id: 1, 'ph.root_id': 1, 'ph.current': 1, operational_event_id: -1 }, { name: 'ph_operation_root_v1', partialFilterExpression: { kind: 'ph.record.version' } }));
INDEXES.operational_events.push(unique({ organization_id: 1, 'territorial.location_id': 1, 'territorial.command_key': 1 }, { name: 'territorial_analysis_command_v1', partialFilterExpression: { kind: 'territorial.analysis' } }));
INDEXES.operational_events.push(index({ organization_id: 1, 'territorial.location_id': 1, operational_event_id: -1 }, { name: 'territorial_analysis_object_v1', partialFilterExpression: { kind: 'territorial.analysis' } }));
INDEXES.operational_events.push(unique({organization_id:1,'economic.location_id':1,'economic.command_key':1},{name:'economic_command_v1',partialFilterExpression:{kind:'economic.scenario.version'}}));
INDEXES.operational_events.push(unique({organization_id:1,'economic.family_id':1,'economic.revision':1},{name:'economic_revision_v1',partialFilterExpression:{kind:'economic.scenario.version'}}));
INDEXES.operational_events.push(unique({organization_id:1,'economic.family_id':1},{name:'economic_current_v1',partialFilterExpression:{kind:'economic.scenario.version','economic.current':true}}));
INDEXES.operational_events.push(index({organization_id:1,'economic.location_id':1,'economic.current':1,operational_event_id:-1},{name:'economic_object_v1',partialFilterExpression:{kind:'economic.scenario.version'}}));
INDEXES.operational_events.push(unique({organization_id:1,'normative.location_id':1,'normative.command_key':1},{name:'normative_command_v1',partialFilterExpression:{kind:'normative.record.version'}}));
INDEXES.operational_events.push(unique({organization_id:1,'normative.family_id':1,'normative.revision':1},{name:'normative_revision_v1',partialFilterExpression:{kind:'normative.record.version'}}));
INDEXES.operational_events.push(unique({organization_id:1,'normative.family_id':1},{name:'normative_current_v1',partialFilterExpression:{kind:'normative.record.version','normative.current':true}}));
INDEXES.operational_events.push(index({organization_id:1,'normative.location_id':1,'normative.current':1,operational_event_id:-1},{name:'normative_object_v1',partialFilterExpression:{kind:'normative.record.version'}}));
// Additive phase-2 indexes. TTL applies only to BCO snapshots, never legacy analytics.
INDEXES.analytics_jobs.push(index({kind:1,status:1,priority:-1,created_at:1,lease_until:1},{name:'bco_queue_v1',partialFilterExpression:{kind:'bco.workflow'}}));
INDEXES.analytics_jobs.push(index({expires_at:1},{name:'bco_retention_v1',expireAfterSeconds:0,partialFilterExpression:{kind:'bco.workflow'}}));
INDEXES.operational_events.push(index({'outbox.state':1,'outbox.next_attempt_at':1,operational_event_id:1},{name:'bco_outbox_v1',partialFilterExpression:{event_version:1}}));

// Community stores encrypted references and reviews, never a second document body.
INDEXES.operational_events.push(unique({organization_id:1,'community.location_id':1,'community.command_key':1},{name:'community_command_v1',partialFilterExpression:{kind:'community.record.version'}}));
INDEXES.operational_events.push(unique({organization_id:1,'community.family_id':1,'community.revision':1},{name:'community_revision_v1',partialFilterExpression:{kind:'community.record.version'}}));
INDEXES.operational_events.push(unique({organization_id:1,'community.family_id':1},{name:'community_current_v1',partialFilterExpression:{kind:'community.record.version','community.current':true}}));
INDEXES.operational_events.push(unique({organization_id:1,'community.location_id':1,'community.source_document_id':1},{name:'community_analysis_source_v1',partialFilterExpression:{kind:'community.record.version','community.type':'analysis','community.current':true}}));
INDEXES.operational_events.push(index({organization_id:1,'community.location_id':1,'community.current':1,operational_event_id:-1},{name:'community_object_v1',partialFilterExpression:{kind:'community.record.version'}}));
INDEXES.operational_events.push(index({'community.target_organization_id':1,'community.current':1,operational_event_id:-1},{name:'community_incoming_v1',partialFilterExpression:{kind:'community.record.version','community.type':'share'}}));
module.exports = { INDEXES };
