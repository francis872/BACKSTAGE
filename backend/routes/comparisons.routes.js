const express = require('express');
const { authenticate } = require('../auth');
const { createRequireOrganizationContext } = require('../middleware/organizationContext');
const { authorizeRoles, ROLES } = require('../middleware/rbac');
const wrap = require('../utils/asyncHandler');
const { service } = require('../services/comparisons.service');
function createComparisonsRouter(comparisons = service, organizationService) {
 const router=express.Router();router.use(authenticate,createRequireOrganizationContext(organizationService));
 const context=req=>({organizationId:req.organization.organization_id,userId:req.user.user_id,role:req.organization.role});
 const read=authorizeRoles(ROLES.ADMIN,ROLES.ANALYST,ROLES.VIEWER);
 router.get('/',read,wrap(async(req,res)=>res.json({data:await comparisons.list(context(req))})));
 router.get('/:id',read,wrap(async(req,res)=>res.json({data:await comparisons.get(context(req),req.params.id)})));
 router.get('/:id/reproducibility',read,wrap(async(req,res)=>res.json({data:await comparisons.verify(context(req),req.params.id)})));
 router.get('/:id/export',read,wrap(async(req,res)=>{const data=await comparisons.exportSnapshot(context(req),req.params.id);res.setHeader('Content-Disposition',`attachment; filename="backstage-analysis-${data.snapshot.comparison_id}.json"`);res.setHeader('Cache-Control','no-store');res.json(data);}));
 router.post('/',authorizeRoles(ROLES.ADMIN,ROLES.ANALYST),wrap(async(req,res)=>res.status(201).json({data:await comparisons.save(context(req),req.body)})));
 router.post('/:id/project',authorizeRoles(ROLES.ADMIN,ROLES.ANALYST),wrap(async(req,res)=>res.status(200).json({data:await comparisons.createProject(context(req),req.params.id,req.body)})));
 return router;
}
module.exports=createComparisonsRouter();module.exports.createComparisonsRouter=createComparisonsRouter;
