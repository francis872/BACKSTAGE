const C=require('../domain/computationalContract');
async function currentActor(db,session,context){
 const organizationId=C.identifier(context.organizationId),userId=C.identifier(context.userId);
 const user=context.session?await require('./accountSecurity.service').validateSessionIn(db,{...context.session,user_id:userId},session):await db.collection('identity_users').findOne({user_id:userId},{session});
 const org=await db.collection('identity_organizations').findOne({organization_id:organizationId,status:'active'},{session});
 const member=await db.collection('identity_memberships').findOne({organization_id:organizationId,user_id:userId},{session});
 if(!user||user.status==='disabled'||!org||!member||!['admin','analyst','viewer'].includes(member.role))C.fail('Se requiere autorización vigente en la organización.',403);
 return {organizationId,userId,role:member.role};
}
module.exports={currentActor};
