// Read the existing project record; this adapter never creates a second project store.
export function contextFromProject(project, organizationId) {
  if (Number(project.organization_id) !== Number(organizationId)) {
    throw new Error('El proyecto no pertenece a la organización activa.');
  }
  const metadata = project.metadata || {};
  const selected = Array.isArray(metadata.selected_assets) ? metadata.selected_assets : [];
  const asset = selected.find(item => item && typeof item === 'object' && /^(platform|soi):[1-9][0-9]*$/.test(item.asset_id));
  return {
    organization_id: Number(organizationId),
    analysis_run_id: Number(project.analysis_run_id),
    project_name: project.project_name,
    city: project.city || metadata.territory?.city || null,
    project,
    territory: metadata.territory || null,
    projectTerritory: metadata.territory || null,
    selected_assets: selected,
    asset_id: asset?.asset_id || null,
    location_id: asset?.origin === 'platform' ? asset.source_record_id : null,
    comparison_id: metadata.comparison_snapshot_id || null,
    comparison_mode: metadata.comparison_snapshot_id ? 'configurable' : 'existing',
    candidates: metadata.comparison_candidates || metadata.candidates || [],
    mapContext: metadata.map_context || null,
  };
}

// A response can arrive after navigation changed selection or opened evidence.
// Merge into the CURRENT workspace, never the state captured when fetch began.
export function restoreValidatedProjectContext(current, project, organizationId) {
  if(String(current?.organization_id)!==String(organizationId)||Number(current?.analysis_run_id)!==Number(project.analysis_run_id))return current;
  const saved=contextFromProject(project,organizationId);
  const comparison_id=current.comparison_id || saved.comparison_id;
  const next={...saved,...current,project,analysis_run_id:Number(project.analysis_run_id),project_name:project.project_name,
    projectTerritory:saved.territory,territory:current.territory||saved.territory,
    comparison_id,comparison_mode:comparison_id?'configurable':current.comparison_mode||saved.comparison_mode,
    candidates:current.candidates?.length?current.candidates:saved.candidates,
    selected_assets:current.selected_assets?.length?current.selected_assets:saved.selected_assets,
    organization_id:Number(organizationId),organizationId:Number(organizationId)};
  next.activeTerritory=next.territory;
  next.analysisRun={id:next.analysis_run_id,project_name:next.project_name,city:next.city};
  return next;
}
