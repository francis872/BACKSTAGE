const ApiError = require('../utils/ApiError');
const { appendPlatformAudit } = require('./platformAudit.service');
const id = value => { if (typeof value === 'boolean' || !/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new ApiError(400,'Identificador inválido.'); return Number(value); };
const content = (value,max=4000) => { if(typeof value!=='string'||!value.trim()||value.length>max)throw new ApiError(400,`Escribe entre 1 y ${max} caracteres.`);return value.trim(); };
function createCollaborationService(injected) {
  const infra = () => injected || require('../infrastructure/platformMongo');
  async function actor(db,org,userId,session,write=false) {
    org=id(org);userId=id(userId);
    const organization=await db.collection('identity_organizations').findOne({organization_id:org,status:'active'},{session});
    if(!organization)throw new ApiError(403,'Organización no disponible.');
    if(write)await db.collection('identity_organizations').updateOne({organization_id:org},{$inc:{membership_revision:1}},{session});
    const user=await db.collection('identity_users').findOne({user_id:userId},{session});
    const membership=await db.collection('identity_memberships').findOne({organization_id:org,user_id:userId},{session});
    if(!user||user.status==='disabled'||!membership||!['admin','analyst','viewer'].includes(membership.role))throw new ApiError(403,'No tienes acceso vigente a esta organización.');
    if(write&&!['admin','analyst'].includes(membership.role))throw new ApiError(403,'Tu rol permite consultar publicaciones.');
    return {...membership,name:user.name};
  }
  function present(row,org,authorizedProjects) {
    const own=Number(row.organization_id)===Number(org);
    let project_reference=null;
    if(own&&authorizedProjects.has(row.analysis_run_id))project_reference={analysis_run_id:row.analysis_run_id};
    return {operational_event_id:row.operational_event_id,author_name:row.author_name,content:row.content,created_at:row.created_at,shared:Object.keys(row.audience).length>1,project_reference};
  }
  async function list(org,userId,query={}) {
    org=id(org);const limit=query.limit==null?40:id(query.limit);if(limit>100)throw new ApiError(400,'Máximo 100 publicaciones por consulta.');
    const db=await infra().getMongoDatabase();await actor(db,org,userId);
    const filter={kind:'collaboration.post',[`audience.${org}`]:true,deleted:false};
    if(query.before!=null)filter.operational_event_id={$lt:id(query.before)};
    const rows=await db.collection('operational_events').find(filter).sort({operational_event_id:-1}).limit(limit+1).toArray();
    const hasMore=rows.length>limit;const page=rows.slice(0,limit),data=[];
    const projectIds=page.filter(row=>row.organization_id===org&&row.analysis_run_id).map(row=>row.analysis_run_id);
    const projectRows=projectIds.length?await db.collection('analysis_runs').find({organization_id:org,analysis_run_id:{$in:projectIds}}).limit(limit).toArray():[];
    const authorizedProjects=new Set(projectRows.map(row=>row.analysis_run_id));
    const comments=page.length?await db.collection('operational_events').find({kind:'collaboration.comment',parent_event_id:{$in:page.map(row=>row.operational_event_id)},deleted:false}).sort({operational_event_id:-1}).limit(200).toArray():[];
    for(const row of page){const value=present(row,org,authorizedProjects);value.comments=comments.filter(c=>c.parent_event_id===row.operational_event_id).slice(0,10).reverse().map(c=>({operational_event_id:c.operational_event_id,author_name:c.author_name,content:c.content,created_at:c.created_at}));value.comments_limited=(row.comment_revision||0)>value.comments.length;data.push(value);}
    return {data,next_before:hasMore?page.at(-1).operational_event_id:null};
  }
  async function publish(org,userId,input={}) {
    org=id(org);userId=id(userId);const text=content(input.content);
    if(Object.keys(input).some(k=>!['content','analysis_run_id','shared_organization_ids'].includes(k)))throw new ApiError(400,'Campos de publicación no admitidos.');
    const project=input.analysis_run_id==null?null:id(input.analysis_run_id);
    if(input.shared_organization_ids!=null&&!Array.isArray(input.shared_organization_ids))throw new ApiError(400,'Visibilidad inválida.');
    const recipients=[...new Set((input.shared_organization_ids||[]).map(id))].filter(v=>v!==org);if(recipients.length>10)throw new ApiError(400,'Máximo 10 organizaciones destinatarias.');
    return infra().withMongoTransaction(async(db,session)=>{
      const author=await actor(db,org,userId,session,true);
      if(project&&!await db.collection('analysis_runs').findOne({organization_id:org,analysis_run_id:project},{session}))throw new ApiError(404,'Proyecto no disponible en esta organización.');
      const audience={[org]:true};
      for(const recipient of recipients){if(author.role!=='admin')throw new ApiError(403,'Compartir fuera de la organización requiere un administrador.');const target=await actor(db,recipient,userId,session,true);if(target.role!=='admin')throw new ApiError(403,'Solo puedes compartir con espacios que administras.');audience[recipient]=true;}
      const eventId=await infra().nextId('operational_events',session),created_at=new Date();
      const row={operational_event_id:eventId,organization_id:org,actor_user_id:userId,author_name:author.name,kind:'collaboration.post',event_type:'collaboration.post',title:'Actualización de trabajo',severity:'info',content:text,audience,analysis_run_id:project,created_at,deleted:false};
      await db.collection('operational_events').insertOne(row,{session});
      await appendPlatformAudit(infra(),db,session,{organizationId:org,userId},'collaboration.published','operational_events',eventId,{shared_organization_count:recipients.length,analysis_run_id:project});
      return {operational_event_id:eventId,created_at};
    });
  }
  async function comment(org,userId,parentId,input={}) {
    org=id(org);userId=id(userId);parentId=id(parentId);const text=content(input.content,2000);
    if(Object.keys(input).some(k=>k!=='content'))throw new ApiError(400,'Solo se admite el contenido del comentario.');
    return infra().withMongoTransaction(async(db,session)=>{
      const author=await actor(db,org,userId,session,true);
      const parent=await db.collection('operational_events').findOne({kind:'collaboration.post',operational_event_id:parentId,[`audience.${org}`]:true,deleted:false},{session});
      if(!parent)throw new ApiError(404,'Publicación no disponible.');
      // Serialize with any future visibility/moderation change on the parent.
      await db.collection('operational_events').updateOne({operational_event_id:parentId},{$inc:{comment_revision:1}},{session});
      const eventId=await infra().nextId('operational_events',session),created_at=new Date();
      await db.collection('operational_events').insertOne({operational_event_id:eventId,organization_id:org,actor_user_id:userId,author_name:author.name,kind:'collaboration.comment',event_type:'collaboration.comment',title:'Comentario de trabajo',severity:'info',content:text,parent_event_id:parentId,created_at,deleted:false},{session});
      await appendPlatformAudit(infra(),db,session,{organizationId:org,userId},'collaboration.commented','operational_events',eventId,{parent_event_id:parentId});
      return {operational_event_id:eventId,created_at};
    });
  }
  return {list,publish,comment};
}
module.exports={createCollaborationService,service:createCollaborationService()};
