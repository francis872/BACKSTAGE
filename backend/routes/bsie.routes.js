const express=require('express');
const {authenticate}=require('../auth');
const {createRequireFreshOrganizationContext}=require('../middleware/soiOrganizationContext');
const wrap=require('../utils/asyncHandler');
const {service,OPERATIONS}=require('../services/bsie.service');
function createBsieRouter(engine=service,{organizationService}={}){
 const router=express.Router();router.use(authenticate,createRequireFreshOrganizationContext(organizationService));
 const context=req=>({organizationId:req.organization.organization_id,userId:req.user.user_id,role:req.organization.role});
 router.get('/methods',(req,res)=>res.json({data:{operations:OPERATIONS,version:'bsie-1.1.0',regressionModels:['ols','diagnostics','auto','spatial_lag','spatial_error'],temporal:['periods','rolling_windows','paired_change','descriptive_trends'],limits:{features:1000,spatialRegressionFeatures:300,periods:12,requestBytes:4000000,gridCells:4096,timeoutSeconds:30,concurrentPerProcess:2},formats:['GeoJSON'],metricProjection:'regional azimuthal equidistant, max 10 degrees'}}));
 router.get('/jobs',wrap(async(req,res)=>res.json({data:await engine.list(context(req))})));
 router.post('/jobs',wrap(async(req,res)=>{const current=context(req);const job=await engine.enqueue(current,req.body);if(process.env.BSIE_REQUEST_WORKER==='true'&&job.state==='QUEUED')await engine.processNext({organizationId:current.organizationId,jobId:job.job_id});res.status(202).json({data:job});}));
 router.get('/jobs/:id',wrap(async(req,res)=>res.json({data:await engine.getJob(context(req),req.params.id)})));
 router.post('/jobs/:id/cancel',wrap(async(req,res)=>res.json({data:await engine.cancel(context(req),req.params.id)})));
 router.post('/jobs/:id/retry',wrap(async(req,res)=>{const current=context(req);const job=await engine.retry(current,req.params.id);if(process.env.BSIE_REQUEST_WORKER==='true')await engine.processNext({organizationId:current.organizationId,jobId:job.job_id});res.json({data:job});}));
 router.get('/jobs/:id/export',wrap(async(req,res)=>{const job=await engine.getJob(context(req),req.params.id);const geojson=job.result?.result?.geojson;if(job.state!=='COMPLETED'||!geojson)return res.status(409).json({error:'La ejecución no dispone de una capa exportable.'});res.setHeader('Content-Disposition',`attachment; filename="bsie-${job.job_id}.geojson"`);return res.json(geojson);}));
 for(const operation of OPERATIONS)router.post(`/${operation.replaceAll('_','-')}`,wrap(async(req,res)=>{const controller=new AbortController();req.on('aborted',()=>controller.abort());res.json({data:await engine.compute(context(req),{...req.body,operation},{signal:controller.signal})});}));
 router.use((error,req,res,next)=>{if(error.code===11000)return res.status(409).json({error:'La ejecución ya está registrada.'});if(error.name?.startsWith('Mongo'))return res.status(503).json({error:'La persistencia MongoDB del motor espacial no está disponible.'});return next(error);});return router;
}
module.exports=createBsieRouter();module.exports.createBsieRouter=createBsieRouter;
