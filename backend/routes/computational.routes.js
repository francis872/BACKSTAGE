const express=require('express');
const {authenticate}=require('../auth');
const {createRequireOrganizationContext}=require('../middleware/organizationContext');
const {authorizeRoles}=require('../middleware/rbac');
const wrap=require('../utils/asyncHandler');
const {createComputationalController}=require('../controllers/computational.controller');
function createComputationalRouter({service=require('../services/computationalOrchestrator.service').service,organizationService,limiterFactory,satelliteService=require('../services/satelliteCatalog.service').createSatelliteCatalog()}={}){
 const router=express.Router();router.use(authenticate,createRequireOrganizationContext(organizationService),authorizeRoles('admin','analyst','viewer'));
 const c=createComputationalController(service),writer=authorizeRoles('admin','analyst');
 const limiter=limiterFactory||(process.env.VERCEL?require('../middleware/atlasRateLimiter').createAtlasRateLimiter:require('../middleware/platformSecurity').createRateLimiter);
 const budget=limiter({namespace:'bco_commands',windowMs:15*60000,max:30,subject:req=>String(req.user.user_id)});
 const reads=limiter({namespace:'bco_reads',windowMs:60000,max:120,subject:req=>String(req.user.user_id)});
 router.use((req,res,next)=>req.method==='GET'?reads(req,res,next):next());
 router.get('/catalog',c.catalog);
 router.get('/metrics',wrap(c.metrics));router.get('/perception/sources',c.perceptionSources);
 router.post('/perception/satellite/search',writer,budget,wrap(async(req,res)=>res.json(await satelliteService.search({organizationId:req.organization.organization_id,userId:req.user.user_id,session:{session_version:req.user.session_version??0,session_id:req.user.session_id||null}},req.body))));
 router.get('/openapi',(req,res)=>res.json(require('../computational/openapi')));
 router.get('/runs',wrap(c.list));router.get('/runs/:id',wrap(c.get));
 router.post('/runs',writer,budget,wrap(c.create));router.patch('/runs/:id',writer,budget,wrap(c.update));
 router.post('/runs/:id/queue',writer,budget,wrap(c.queue));router.post('/runs/:id/cancel',writer,budget,wrap(c.cancel));
 router.post('/runs/:id/retry',writer,budget,wrap(c.retry));router.post('/runs/:id/defense-approval',authorizeRoles('admin'),budget,wrap(c.approve));
 router.post('/runs/:id/repeat',writer,budget,wrap(c.repeat));router.get('/runs/:id/reproducibility',wrap(c.verify));
 router.delete('/runs/:id',writer,budget,wrap(c.archive));router.get('/runs/:id/tasks/:task/geojson',wrap(c.geojson));
 router.use((req,res)=>res.status(404).json({error:'Ruta computacional no encontrada.',request_id:req.requestId}));
 return router;
}
module.exports={createComputationalRouter};
