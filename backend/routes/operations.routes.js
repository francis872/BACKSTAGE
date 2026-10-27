const express = require('express');
const controller = require('../controllers/operations.controller');
const { authenticate } = require('../auth');
const { requireOrganizationContext } = require('../middleware/organizationContext');
const { authorizeRoles, ROLES } = require('../middleware/rbac');

const router = express.Router();
router.use(authenticate, requireOrganizationContext);

router.get('/health', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.health);
router.get('/metrics', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.operationalMetrics);
router.get('/openapi',authorizeRoles(ROLES.ADMIN,ROLES.ANALYST,ROLES.VIEWER),(req,res)=>res.json(require('../infrastructure/coreOpenApi')));
router.get('/executions', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.executions);
router.get('/analysis/:id/diagnostics', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), controller.diagnostics);

const wrap = require('../utils/asyncHandler');
const business = require('../services/businessRules.service').service;
const context = req => ({ organizationId: req.organization.organization_id, userId: req.user.user_id });
router.get('/business-rules', authorizeRoles(ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER), wrap(async(req,res)=>res.json(await business.get(req.organization.organization_id))));
router.put('/business-rules', authorizeRoles(ROLES.ADMIN), wrap(async(req,res)=>res.json(await business.save(context(req),req.body||{}))));
router.post('/business-rules/review', authorizeRoles(ROLES.ADMIN,ROLES.ANALYST), wrap(async(req,res)=>res.json(await business.review(context(req),req.body||{}))));
router.post('/business-rules/exceptions', authorizeRoles(ROLES.ADMIN), wrap(async(req,res)=>res.status(201).json(await business.exception(context(req),req.body||{}))));
router.get('/monitor', authorizeRoles(ROLES.ADMIN), wrap(async(req,res)=>{
  if(process.env.BACKSTAGE_RUNTIME_ENV)return res.json(await require('../services/hostedMonitor.service').createHostedMonitor().read({...context(req),session:{session_version:req.user.session_version??0,session_id:req.user.session_id||null}}));
  const db=await require('../infrastructure/platformMongo').getMongoDatabase();
  const row=await db.collection('soi_provider_locks').findOne({_id:'monitor:protected-staging'});
  const age=row?.checked_at?Date.now()-Date.parse(row.checked_at):Infinity;
  res.json({scope:'protected_staging_only',recipient_role:'admin',status:!row?'not_configured':age>10*60000?'monitor_stale':Object.values(row.incidents||{}).some(i=>i.open)?'incident_open':'healthy',checked_at:row?.checked_at||null,incidents:row?.incidents||{},events:(row?.events||[]).slice(-20),external_delivery:false,requires_local_computer_and_signed_in_user:true});
}));

module.exports = router;
