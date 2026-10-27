const ApiError = require('../utils/ApiError');
const validators = require('./soiValidation');
const CAPABILITIES = [...validators.CAPABILITIES, 'crews', 'service_orders',...require('../soi/sanitary.contract').CAPABILITIES];
const KINDS = { assets: ['soi_assets','location_id','assets'], operations: ['soi_operations','operation_id','operations'], vehicles: ['soi_vehicles','vehicle_id','fleet'], incidents: ['soi_incidents','incident_id','incidents'], crews: ['soi_crews','crew_id','crews'], 'service-orders': ['soi_service_orders','service_order_id','service_orders'] };
const reject = (message) => { throw new ApiError(400, message); };
const inputObject = (value) => { if (!value || typeof value !== 'object' || Array.isArray(value)) reject('Se requiere un objeto de datos.'); return value; };
const identifier = (v) => { if (!['string','number'].includes(typeof v) || !Number.isSafeInteger(Number(v)) || Number(v) <= 0) reject('Identificador inválido.'); return Number(v); };
const text = (v, field, max = 200) => { if (typeof v !== 'string' || !v.trim() || v.length > max) reject(`${field} requiere texto de hasta ${max} caracteres.`); return v.trim(); };
const date = (v) => { if (v == null || v === '') return null; if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) reject('Fecha inválida.'); return new Date(v); };
const ids = (v = []) => { if (!Array.isArray(v) || v.length > 1000) reject('Lista de identificadores inválida.'); const result = v.map(identifier); if (new Set(result).size !== result.length) reject('Identificadores duplicados.'); return result; };
const status = (value, allowed, fallback) => { const result = value || fallback; if (!allowed.includes(result)) reject('Estado inválido.'); return result; };
function metadata(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 20000) reject('metadata inválida.');
  const result = { ...value };
  for (const key of ['provenance','data_type','validated','verified','quality','source','access_scope','soi']) delete result[key];
  return result;
}
function provenance(kind, source, actor) { return { data_type: kind, validated: false, quality: 'unassessed', source, actor_user_id: actor, recorded_at: new Date(), access_scope: 'organization' }; }
function createMongoSoiService(infrastructure = require('../infrastructure/soiMongo')) {
  const { getMongoDatabase, withMongoTransaction, nextId, cleanDocument } = infrastructure;
  const scoped = (context) => ({ organization_id: identifier(context.organizationId) });
  const writer = (context, admin = false) => { scoped(context); identifier(context.userId); if (!(admin ? ['admin'] : ['admin','analyst']).includes(context.role)) throw new ApiError(403, 'Sin permiso para modificar SOI.'); };
  const db = getMongoDatabase;
  async function configuration(context, transactionDb, session) {
    return cleanDocument(await (transactionDb || await db()).collection('soi_configuration').findOne(scoped(context), { session })) || { ...scoped(context), sector: 'general', capabilities: ['assets','operations'] };
  }
  async function requireCapability(context, capability, transactionDb, session) {
    const current = await configuration(context, transactionDb, session);
    if (!current.capabilities.includes(capability)) throw new ApiError(409, `La capacidad ${capability} no está habilitada.`);
  }
  async function reference(database, context, collection, key, value, session, extra = {}) {
    if (value == null || value === '') return null;
    const target = identifier(value);
    const found = await database.collection(collection).findOneAndUpdate({ ...scoped(context), [key]: target, ...extra }, { $inc: { relation_revision: 1 } }, { session, returnDocument: 'after', includeResultMetadata: false });
    if (!found) throw new ApiError(404, `${key} no pertenece a la organización o no está disponible.`);
    return target;
  }
  async function saveConfiguration(context, input) {
    inputObject(input);
    writer(context, true);
    const sector = text(input.sector, 'sector', 80).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(sector)) reject('Sector inválido.');
    if (!Array.isArray(input.capabilities) || input.capabilities.some((c) => !CAPABILITIES.includes(c))) reject('Capacidades inválidas.');
    return withMongoTransaction(async (database, session) => {
      const before=await database.collection('soi_configuration').findOne(scoped(context),{session});
      const row=await database.collection('soi_configuration').findOneAndUpdate(scoped(context), { $set: { sector, capabilities: [...new Set(input.capabilities)], updated_at: new Date(),updated_by:context.userId },$inc:{revision:1} }, { upsert: true, session, returnDocument: 'after', includeResultMetadata: false });
      await require('./platformAudit.service').appendPlatformAudit(infrastructure,database,session,context,'configuration.updated','soi_configuration',context.organizationId,{revision:row.revision,before:{sector:before?.sector||null,capabilities:before?.capabilities||[]},after:{sector:row.sector,capabilities:row.capabilities}});
      return cleanDocument(row);
    });
  }
  async function list(context, kind, limit = 100, offset = 0) {
    const definition = Object.hasOwn(KINDS,kind) ? KINDS[kind] : null; if (!definition) reject('Recurso inválido.');
    const size = identifier(limit); if (size > 500) reject('Límite máximo 500.');
    const start = Number(offset); if (!Number.isSafeInteger(start) || start < 0 || start > 100000) reject('Offset inválido.');
    await requireCapability(context, definition[2]);
    return (await (await db()).collection(definition[0]).find(scoped(context)).sort({ [definition[1]]: -1 }).skip(start).limit(size).toArray()).map(cleanDocument);
  }
  async function insertAsset(database, context, input, source, session) {
    const normalized = validators.normalizeAsset(input);
    const pair = normalized.geometry.type === 'Point' ? normalized.geometry.coordinates : [null,null];
    const document = { ...normalized, location_id: await nextId('soi_assets', session), ...scoped(context), longitude: pair[0], latitude: pair[1],
      metadata: { ...metadata(normalized.metadata), soi: true, archived: false, provenance: source }, created_at: new Date(), updated_at: new Date() };
    if (!document.external_id) delete document.external_id;
    await database.collection('soi_assets').insertOne(document, { session });
    return cleanDocument(document);
  }
  async function validateMembers(database, context, values, session) {
    const members = ids(values);
    if (members.length > 100) reject('Máximo 100 miembros por cuadrilla.');
    for (const member of members) {
      if (!await database.collection('identity_memberships').findOne({ ...scoped(context), user_id: member }, { session })) throw new ApiError(404, 'Un integrante no pertenece a la organización.');
    }
    return members;
  }
  async function create(context, kind, input) {
    inputObject(input); writer(context); const definition = Object.hasOwn(KINDS,kind) ? KINDS[kind] : null; if (!definition) reject('Recurso inválido.');
    await requireCapability(context, definition[2]);
    return withMongoTransaction(async (database, session) => {
      await requireCapability(context, definition[2], database, session);
      const p = provenance('ORGANIZATION_PROVIDED', { name: 'Registro de la organización' }, context.userId);
      if (kind === 'assets') return insertAsset(database, context, input, p, session);
      const document = { ...scoped(context), [definition[1]]: await nextId(definition[0], session), created_at: new Date(), updated_at: new Date(), created_by: context.userId, metadata: { ...metadata(input.metadata), provenance: p } };
      if (kind === 'vehicles') {
        const capacity = Number(input.capacity); if (!['number','string'].includes(typeof input.capacity) || !Number.isFinite(capacity) || capacity <= 0) reject('Capacidad positiva requerida.');
        Object.assign(document, { name: text(input.name,'name'), plate: text(input.plate,'plate',32).toUpperCase(), capacity, status: status(input.status, ['available','maintenance','inactive'], 'available') });
        document.capacity_unit=status(input.capacity_unit,['kg','m3','L','unspecified'],'unspecified');
        document.vehicle_type=input.vehicle_type?text(input.vehicle_type,'vehicle_type',80):null;
        document.energy_source=status(input.energy_source,['diesel','gasoline','gas','electric','hybrid','other','unspecified'],'unspecified');
        document.odometer_km=input.odometer_km==null?null:Number(input.odometer_km);if(document.odometer_km!=null&&(!Number.isFinite(document.odometer_km)||document.odometer_km<0))reject('Kilometraje inválido.');
        document.maintenance_due_at=date(input.maintenance_due_at);
        document.driver_user_id=await reference(database,context,'identity_memberships','user_id',input.driver_user_id,session);
      } else if (kind === 'crews') {
        Object.assign(document, { name: text(input.name,'name'), member_user_ids: await validateMembers(database, context, input.member_user_ids, session), status: status(input.status, ['available','assigned','inactive'], 'available') });
      } else if (kind === 'operations') {
        Object.assign(document, { name: text(input.name,'name'), operation_type: text(input.operation_type,'operation_type',80), status: status(input.status, ['planned','active','completed','cancelled'], 'planned'), scheduled_at: date(input.scheduled_at), asset_ids: [],
          vehicle_id: await reference(database, context, 'soi_vehicles','vehicle_id',input.vehicle_id,session), crew_id: await reference(database, context, 'soi_crews','crew_id',input.crew_id,session, { status: { $ne: 'inactive' } }) });
      } else if (kind === 'incidents') {
        const shape = input.geometry ? validators.geometry(input.geometry) : input.longitude != null && input.longitude !== '' || input.latitude != null && input.latitude !== '' ? validators.normalizeAsset({ name: 'Incidencia', longitude: input.longitude, latitude: input.latitude }).geometry : null;
        Object.assign(document, { title: text(input.title,'title'), description: input.description ? text(input.description,'description',4000) : null, severity: status(input.severity,['low','medium','high','critical'],'medium'), status: 'open',
          operation_id: await reference(database,context,'soi_operations','operation_id',input.operation_id,session), vehicle_id: await reference(database,context,'soi_vehicles','vehicle_id',input.vehicle_id,session) });
        document.metadata.geometry = shape;
        document.workflow_state='registered';document.workflow_history=[{state:'registered',at:new Date(),actor_user_id:context.userId}];document.assigned_user_id=null;
      } else if (kind === 'service-orders') {
        const assets = ids(input.asset_ids);
        for (const asset of assets) await reference(database,context,'soi_assets','location_id',asset,session,{ 'metadata.archived': { $ne: true } });
        const crew = await reference(database,context,'soi_crews','crew_id',input.crew_id,session,{ status: { $ne: 'inactive' } });
        const currentStatus = status(input.status,['planned','assigned'],'planned'); if (currentStatus === 'assigned' && !crew) reject('Asigna una cuadrilla antes de activar la orden.');
        Object.assign(document, { name: text(input.name,'name'), description: input.description ? text(input.description,'description',4000) : null, status: currentStatus, due_at: date(input.due_at), crew_id: crew, asset_ids: assets,
          operation_id: await reference(database,context,'soi_operations','operation_id',input.operation_id,session), route_plan_id: await reference(database,context,'soi_route_plans','route_plan_id',input.route_plan_id,session) });
      }
      if(document.metadata?.analysis_run_id){
        await reference(database,context,'analysis_runs','analysis_run_id',document.metadata.analysis_run_id,session);
        if(['active','completed'].includes(document.status))await require('./businessRules.service').createBusinessRulesService(infrastructure).assertFreshnessIn(database,session,context,document.metadata.analysis_run_id);
      }
      await database.collection(definition[0]).insertOne(document, { session }); return cleanDocument(document);
    });
  }
  async function updateAsset(context, assetId, input) {
    inputObject(input);
    writer(context); await requireCapability(context,'assets');
    return withMongoTransaction(async (database,session) => {
      const filter = { ...scoped(context), location_id: identifier(assetId) };
      const current = await database.collection('soi_assets').findOne(filter, { session }); if (!current) throw new ApiError(404,'Activo no disponible.');
      if (input.archived !== undefined && typeof input.archived !== 'boolean') reject('archived debe ser booleano.');
      const merged = { ...current, ...input };
      if ((Object.hasOwn(input,'longitude') || Object.hasOwn(input,'latitude')) && !Object.hasOwn(input,'geometry')) merged.geometry = null;
      const normalized = validators.normalizeAsset(merged);
      const pair = normalized.geometry.type === 'Point' ? normalized.geometry.coordinates : [null,null];
      const patch = { ...normalized, longitude: pair[0], latitude: pair[1], metadata: { ...metadata(current.metadata), ...metadata(input.metadata), soi: true, archived: input.archived ?? current.metadata?.archived ?? false, provenance: current.metadata?.provenance || provenance('UNKNOWN',{ name:'Inventario heredado sin clasificación' },context.userId) }, updated_at: new Date() };
      if (!patch.external_id) delete patch.external_id;
      return cleanDocument(await database.collection('soi_assets').findOneAndUpdate(filter,{ $set: patch, ...(!normalized.external_id ? { $unset:{ external_id:'' } } : {}) },{ session, returnDocument:'after',includeResultMetadata:false }));
    });
  }
  async function updateStatus(context,kind,itemId,input) {
    inputObject(input); writer(context); const definition = Object.hasOwn(KINDS,kind) ? KINDS[kind] : null; if (!definition || kind === 'assets') reject('Recurso inválido.');
    await requireCapability(context,definition[2]);
    return withMongoTransaction(async (database,session) => {
      const filter = { ...scoped(context), [definition[1]]: identifier(itemId) };
      const current = await database.collection(definition[0]).findOne(filter,{ session }); if (!current) throw new ApiError(404,'Recurso no disponible.');
      const values = { operations:['planned','active','completed','cancelled'], vehicles:['available','maintenance','inactive'], incidents:['open','resolved'], crews:['available','assigned','inactive'], 'service-orders':['planned','assigned','in_progress','completed','cancelled'] };
      const patch = { updated_at: new Date() };
      if (input.status !== undefined) patch.status = status(input.status,values[kind]);
      if(kind==='vehicles'){
        if(input.capacity_unit!==undefined)patch.capacity_unit=status(input.capacity_unit,['kg','m3','L','unspecified']);
        if(input.energy_source!==undefined)patch.energy_source=status(input.energy_source,['diesel','gasoline','gas','electric','hybrid','other','unspecified']);
        if(input.driver_user_id!==undefined)patch.driver_user_id=await reference(database,context,'identity_memberships','user_id',input.driver_user_id,session);
        if(input.odometer_km!==undefined){const value=Number(input.odometer_km);if(!Number.isFinite(value)||value<0||current.odometer_km!=null&&value<current.odometer_km)reject('Kilometraje inválido o anterior al registrado.');patch.odometer_km=value;}
        if(input.maintenance_due_at!==undefined)patch.maintenance_due_at=date(input.maintenance_due_at);
      }
      if(kind==='incidents'){
        const currentState=current.workflow_state||(current.status==='resolved'?'closed':'registered');
        const target=input.workflow_state||(input.status==='resolved'?'closed':null);
        const transitions={registered:['triaged'],triaged:['assigned'],assigned:['in_progress'],in_progress:['verified'],verified:['closed']};
        if(!target||!transitions[currentState]?.includes(target))throw new ApiError(409,'La incidencia debe seguir registro, clasificación, asignación, atención, verificación y cierre.');
        const reason=text(input.reason,'Justificación',2000);if(reason.length<8)reject('Describe la actuación con al menos 8 caracteres.');
        if(target==='assigned'){if(!input.assigned_user_id)reject('Selecciona responsable.');patch.assigned_user_id=await reference(database,context,'identity_memberships','user_id',input.assigned_user_id,session);}
        if(target==='closed'&&context.role!=='admin')throw new ApiError(403,'El cierre requiere un administrador/supervisor autorizado.');
        patch.workflow_state=target;patch.status=target==='closed'?'resolved':'open';patch.workflow_history=[...(current.workflow_history||[]),{state:target,at:new Date(),actor_user_id:context.userId,reason}];
      }
      if (kind === 'crews' && input.member_user_ids !== undefined) patch.member_user_ids = await validateMembers(database,context,input.member_user_ids,session);
      if (kind === 'service-orders') {
        if (input.crew_id !== undefined) patch.crew_id = await reference(database,context,'soi_crews','crew_id',input.crew_id,session,{ status:{ $ne:'inactive' } });
        const transitions = { planned:['assigned','cancelled'],assigned:['in_progress','cancelled'],in_progress:['completed','cancelled'] };
        if (patch.status && patch.status !== current.status && !transitions[current.status]?.includes(patch.status)) throw new ApiError(409,'Transición de orden inválida.');
        const effectiveCrew = Object.hasOwn(patch,'crew_id') ? patch.crew_id : current.crew_id;
        if (['assigned','in_progress'].includes(patch.status || current.status)) {
          if (!effectiveCrew) reject('La orden requiere una cuadrilla.');
          await reference(database,context,'soi_crews','crew_id',effectiveCrew,session,{ status:{ $ne:'inactive' } });
        }
      }
      if(['active','in_progress','completed'].includes(patch.status)||patch.workflow_state==='closed'){
        const projectId=current.metadata?.analysis_run_id;
        if(projectId)await require('./businessRules.service').createBusinessRulesService(infrastructure).assertFreshnessIn(database,session,context,projectId);
      }
      return cleanDocument(await database.collection(definition[0]).findOneAndUpdate(filter,{ $set:patch },{ session, returnDocument:'after',includeResultMetadata:false }));
    });
  }
  async function operationAssets(context,operationId,input) {
    scoped(context); if (input !== undefined) writer(context); await requireCapability(context,'operations'); await requireCapability(context,'assets');
    return withMongoTransaction(async(database,session) => {
      const filter = { ...scoped(context), operation_id:identifier(operationId) };
      let operation = await database.collection('soi_operations').findOne(filter,{ session }); if (!operation) throw new ApiError(404,'Operación no disponible.');
      if (input !== undefined) {
        inputObject(input);
        const assets = ids(input.asset_ids);
        for (const asset of assets) await reference(database,context,'soi_assets','location_id',asset,session,{ 'metadata.archived':{ $ne:true } });
        operation = await database.collection('soi_operations').findOneAndUpdate(filter,{ $set:{ asset_ids:assets, updated_at:new Date() } },{ session,returnDocument:'after',includeResultMetadata:false });
      }
      const assets = await database.collection('soi_assets').find({ ...scoped(context), location_id:{ $in:operation.asset_ids || [] } },{ session }).toArray();
      return { operation_id:operation.operation_id, asset_ids:operation.asset_ids || [], assets:assets.map(cleanDocument) };
    });
  }
  async function preview(context,input) {
    inputObject(input);
    writer(context); await requireCapability(context,'imports'); const value = validators.previewImport(input,identifier(context.organizationId));
    const keys = value.assets.map((a)=>a.external_id).filter(Boolean);
    const existing = keys.length ? await (await db()).collection('soi_assets').find({ ...scoped(context),external_id:{ $in:keys } }).toArray() : [];
    const duplicates = new Set(existing.map((a)=>a.external_id));
    value.assets.forEach((a,i)=>{ if (duplicates.has(a.external_id)) value.errors.push({ row:value.asset_rows[i], message:'Identificador externo ya registrado en la organización.' }); });
    value.valid = !value.errors.length; return value;
  }
  async function commit(context,input) {
    const value = await preview(context,input); await requireCapability(context,'assets');
    if (!value.valid) reject('Corrige la importación antes de confirmar.'); if (input.preview_hash !== value.preview_hash) throw new ApiError(409,'La previsualización cambió.');
    return withMongoTransaction(async(database,session)=>{
      const import_id = await nextId('soi_imports',session);
      await database.collection('soi_imports').insertOne({ ...scoped(context),import_id,preview_hash:value.preview_hash,source:value.source,row_count:value.row_count,created_at:new Date(),actor_user_id:context.userId },{ session });
      for (const asset of value.assets) await insertAsset(database,context,asset,{ ...provenance('IMPORTED',value.source,context.userId),import_id },session);
      return { import_id,imported:value.row_count };
    });
  }
  async function summary(context) {
    const database = await db(), filter = scoped(context), active = { 'metadata.provenance.data_type':{ $in:['REAL_VERIFIED','ORGANIZATION_PROVIDED','IMPORTED','EXTERNAL_API'] } };
    const tasks = { inventory_assets:['soi_assets',{ 'metadata.archived':{ $ne:true } }], operational_assets:['soi_assets',{ ...active,'metadata.archived':{ $ne:true } }],active_operations:['soi_operations',{ ...active,status:'active' }],vehicles:['soi_vehicles',active],open_incidents:['soi_incidents',{ ...active,status:'open' }],crews:['soi_crews',{}],open_service_orders:['soi_service_orders',{ status:{ $in:['planned','assigned','in_progress'] } }],imports:['soi_imports',{}],comparisons:['soi_comparisons',{}] };
    return Object.fromEntries(await Promise.all(Object.entries(tasks).map(async([key,[collection,extra]])=>[key,await database.collection(collection).countDocuments({ ...filter,...extra })])));
  }
  async function listComparisons(context) { return (await (await db()).collection('soi_comparisons').find(scoped(context)).sort({ comparison_id:-1 }).limit(100).toArray()).map(cleanDocument); }
  const comparisonService = require('./comparisons.service').createComparisonService(infrastructure);
  const saveComparison = comparisonService.save;
  async function catalog(context) { const current=await configuration(context); return { sectors:[...new Set([...validators.SECTORS,current.sector])],capabilities:CAPABILITIES,assetTypes:validators.ASSET_TYPES,dataTypes:validators.DATA_TYPES }; }
  return { configuration,saveConfiguration,catalog,summary,list,create,preview,commit,updateStatus,updateAsset,operationAssets,listComparisons,saveComparison,requireCapability,db,scoped,writer,reference };
}
module.exports={ createMongoSoiService,CAPABILITIES,KINDS };
