function createComputationalController(service){
 const context=req=>({organizationId:req.organization.organization_id,userId:req.user.user_id,correlationId:req.requestId,session:{session_version:req.user.session_version??0,session_id:req.user.session_id||null}});
 const key=req=>req.get('Idempotency-Key');
 return {
  catalog:(req,res)=>res.json(service.catalog()),
  metrics:async(req,res)=>res.json({data:await service.metrics(context(req))}),
  perceptionSources:(req,res)=>res.json({sources:[{id:'supplied_geojson',status:'implemented',live_acquisition:false,algorithm:'perception.geojson'},{id:'supplied_authorized_positions',status:'implemented',live_acquisition:false,algorithm:'perception.positions'},{id:'openstreetmap',status:'existing_adapter',endpoint:'/spatial/geocode',availability_checked:false},{id:'open_meteo',status:'existing_adapter',endpoint:'/spatial/live-context',availability_checked:false},{id:'mapbox',status:process.env.MAPBOX_ACCESS_TOKEN&&process.env.MAPBOX_GEOCODING_PERMANENT==='true'?'configured':'not_configured',availability_checked:false},...['sentinel','landsat'].map(id=>({id,status:'metadata_search_adapter',endpoint:'/computational/perception/satellite/search',imagery_downloaded:false,availability_checked:false})),{id:'copernicus_stac',status:'not_integrated',live_acquisition:false}],map:'existing_explorer',new_map:false,gps_provider_configured:null,gps_provider_status:'consult_existing_organization_fleet_sources'}),
  list:async(req,res)=>res.json(await service.list(context(req),req.query)),
  get:async(req,res)=>res.json({data:await service.get(context(req),req.params.id)}),
  verify:async(req,res)=>res.json({data:await service.verify(context(req),req.params.id)}),
  create:async(req,res)=>{const result=await service.create(context(req),req.body,key(req));res.status(result.created?201:200).json({data:result.run,replayed:!result.created});},
  update:async(req,res)=>res.json({data:await service.mutate(context(req),req.params.id,'update',req.body)}),
  queue:async(req,res)=>res.status(202).json({data:await service.mutate(context(req),req.params.id,'queue',req.body)}),
  cancel:async(req,res)=>res.json({data:await service.mutate(context(req),req.params.id,'cancel',req.body)}),
  archive:async(req,res)=>{await service.mutate(context(req),req.params.id,'archive',req.body);res.status(204).end();},
  retry:async(req,res)=>{const result=await service.retry(context(req),req.params.id,req.body,key(req));res.status(result.created?201:200).json({data:result.run,replayed:!result.created});},
  repeat:async(req,res)=>{const result=await service.retry(context(req),req.params.id,req.body,key(req),{repeat:true});res.status(result.created?201:200).json({data:result.run,replayed:!result.created});},
  approve:async(req,res)=>res.json({data:await service.mutate(context(req),req.params.id,'approve',req.body)}),
  geojson:async(req,res)=>{const job=await service.get(context(req),req.params.id);const task=job.tasks.find(t=>t.id===req.params.task);if(job.status!=='COMPLETED'||task?.state!=='COMPLETED'||!task.result?.result?.geojson)return res.status(409).json({error:'La tarea no dispone de una capa GeoJSON terminada.'});res.set('Content-Type','application/geo+json');res.json(task.result.result.geojson);},
 };
}
module.exports={createComputationalController};
