const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const { createPasswordHash, verifyPassword, isLegacyHash, createToken } = require('../auth');
const { appendPlatformAudit } = require('./platformAudit.service');
const { emailAddress, passwordValue } = require('../domain/identityCredentials');
const ROLES = ['admin', 'analyst', 'viewer'];
const INDEX_PLAN = Object.freeze([
  ['identity_users', { user_id: 1 }, { unique: true }], ['identity_users', { email: 1 }, { unique: true }],
  ['identity_organizations', { organization_id: 1 }, { unique: true }], ['identity_organizations', { slug: 1 }, { unique: true }],
  ['identity_memberships', { organization_id: 1, user_id: 1 }, { unique: true }], ['identity_memberships', { user_id: 1 }, {}],
  ['identity_invitations', { invitation_id: 1 }, { unique: true }], ['identity_invitations', { token_hash: 1 }, { unique: true }], ['identity_invitations', { organization_id: 1, created_at: -1 }, {}],
]);
function identifier(value) {
  if (!['number','string'].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new ApiError(400, 'Identificador inválido.');
  return Number(value);
}
function label(value, field, minimum = 1) {
  if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > 120) throw new ApiError(400, `${field} debe tener entre ${minimum} y 120 caracteres.`);
  return value.trim();
}
function roleValue(value = 'viewer') {
  if (!ROLES.includes(value)) throw new ApiError(400, 'Rol inválido.');
  return value;
}
function publicUser(user) {
  return { user_id: user.user_id, email: user.email, name: user.name, mfa_enabled: user.mfa?.enabled === true, email_verified: Boolean(user.email_verified_at), ...(user.profile?.phone!=null?{phone:user.profile.phone}:{}), created_at: user.created_at, updated_at: user.updated_at };
}
function resolveMembership(memberships, requested) {
  if (!memberships.length) throw new ApiError(403, 'El usuario no tiene organizaciones asignadas.');
  const membership = requested == null || requested === '' ? memberships[0] : memberships.find((item) => item.organization_id === identifier(requested));
  if (!membership) throw new ApiError(403, 'No tienes acceso a la organización solicitada.');
  return membership;
}
function slug(name) {
  const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0,48);
  if (!base) throw new ApiError(400, 'El nombre del workspace debe incluir letras o números.');
  return `${base}-${crypto.randomBytes(4).toString('hex')}`;
}

function createMongoIdentityService(injected) {
  const infrastructure = () => injected || require('../infrastructure/platformMongo');
  const database = () => infrastructure().getMongoDatabase();
  const transaction = async (operation) => {
    try { return await infrastructure().withMongoTransaction(operation); }
    catch (error) {
      if (error.code === 11000) throw new ApiError(409, 'El email o la membresía ya está registrado.');
      if (error instanceof ApiError) throw error;
      const unavailable=new ApiError(503, 'El servicio de identidad MongoDB no está disponible.');
      unavailable.diagnostic={name:error.name,code:error.code||null,codeName:error.codeName||null};
      throw unavailable;
    }
  };
  async function read(operation) {
    try { return await operation(await database()); }
    catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, 'El servicio de identidad MongoDB no está disponible.'); }
  }
  async function initializeIdentityIndexes() {
    const db = await database();
    for (const [collection, fields, options] of INDEX_PLAN) await db.collection(collection).createIndex(fields, options);
    return { collections: [...new Set(INDEX_PLAN.map((entry) => entry[0]))], seedUsers: false };
  }
  async function membershipsIn(db, userId, session) {
    const user = await db.collection('identity_users').findOne({ user_id: identifier(userId) }, { session });
    if (!user || user.status === 'disabled') return [];
    const memberships = await db.collection('identity_memberships').find({ user_id: user.user_id }, { session }).toArray();
    const organizations = await db.collection('identity_organizations').find({ organization_id: { $in: memberships.map((item) => item.organization_id) }, status: 'active' }, { session }).toArray();
    const byId = new Map(organizations.map((item) => [item.organization_id, item]));
    return memberships.filter((item) => byId.has(item.organization_id) && ROLES.includes(item.role)).map((item) => ({
      organization_id: item.organization_id, organization_slug: byId.get(item.organization_id).slug,
      organization_name: byId.get(item.organization_id).name, role: item.role,
    })).sort((a,b) => a.organization_name.localeCompare(b.organization_name));
  }
  async function getUserMemberships(userId, securityContext) { return read(async db => {
    if(securityContext)await require('./accountSecurity.service').validateSessionIn(db,{...securityContext,user_id:identifier(userId)});
    return membershipsIn(db, userId);
  }); }
  const validateSession = context => read(db => require('./accountSecurity.service').validateSessionIn(db,context));
  async function listActiveOrganizations() {
    return read(async (db) => (await db.collection('identity_organizations').find({ status: 'active' }).toArray())
      .map((item) => ({ organization_id: item.organization_id, organization_name: item.name, organization_slug: item.slug })));
  }
  async function sessionResult(user, memberships, organizationId, db, session) {
    const active = resolveMembership(memberships, organizationId);
    const sessionUser = { ...publicUser(user), role: active.role, ...active, memberships };
    const token=await require('./accountSecurity.service').issueSessionToken(infrastructure(),db,session,sessionUser);
    return { token, user: sessionUser };
  }
  async function register(input = {}) {
    if (!input?.email || !input?.password || !input?.name || !input?.organization_name) throw new ApiError(400, 'name, email, password y organization_name son requeridos.');
    const email = emailAddress(input.email), name = label(input.name,'name'), organizationName = label(input.organization_name,'organization_name',2);
    const password = passwordValue(input.password);
    if (input.role != null || input.organization_id != null || input.organization_slug != null) throw new ApiError(400, 'El registro crea un workspace nuevo; para unirse a otro se requiere invitación.');
    const passwordHash = createPasswordHash(password);
    // Validate token setup before writing an account, preserving atomic registration failure semantics.
    if (!process.env.JWT_SECRET) throw new ApiError(503, 'El servicio de acceso no está disponible.');
    return transaction(async (db, session) => {
      if (await db.collection('identity_users').findOne({ email }, { session })) throw new ApiError(409, 'El email ya está registrado.');
      const organizationId = await infrastructure().nextId('identity_organizations', session);
      const userId = await infrastructure().nextId('identity_users', session);
      const now = new Date();
      const organization = { organization_id: organizationId, name: organizationName, slug: slug(organizationName), status: 'active', membership_revision: 0, created_at: now, updated_at: now };
      const user = { user_id: userId, email, name, password_hash: passwordHash, created_at: now, updated_at: now };
      await db.collection('identity_organizations').insertOne(organization, { session });
      await db.collection('identity_users').insertOne(user, { session });
      await db.collection('identity_memberships').insertOne({ user_id: userId, organization_id: organizationId, role: 'admin', created_at: now }, { session });
      const memberships = [{ organization_id: organizationId, organization_name: organizationName, organization_slug: organization.slug, role: 'admin' }];
      return { ...await sessionResult(user,memberships,organizationId,db,session), organization: { organization_id: organizationId, name: organizationName, slug: organization.slug } };
    });
  }
  async function login(input = {}) {
    if (!input?.email || !input?.password) throw new ApiError(400, 'email y password son requeridos.');
    const email = emailAddress(input.email);
    if (typeof input.password !== 'string' || Buffer.byteLength(input.password,'utf8') > 72) throw new ApiError(400, 'Contraseña inválida.');
    return transaction(async (db,session) => {
      const user = await db.collection('identity_users').findOne({ email },{session});
      if (!user || user.status === 'disabled' || !verifyPassword(input.password, user.password_hash)) throw new ApiError(401, 'Credenciales inválidas.');
      const memberships = await membershipsIn(db,user.user_id);
      const selected = resolveMembership(memberships,input.organization_id);
      if (user.mfa?.enabled) return require('./identityMfa.service').createIdentityMfaService({infrastructure:infrastructure()}).challengeIn(db,session,user,selected.organization_id);
      const result = await sessionResult(user,memberships,input.organization_id,db,session);
      if (isLegacyHash(user.password_hash)) await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $set: { password_hash: createPasswordHash(passwordValue(input.password)), updated_at: new Date() } },{session});
      return result;
    });
  }
  async function me(userId, organizationId) {
    return read(async (db) => {
      const user = await db.collection('identity_users').findOne({ user_id: identifier(userId) });
      if (!user || user.status === 'disabled') throw new ApiError(404, 'Usuario no encontrado.');
      const memberships = await membershipsIn(db,userId);
      return { ...publicUser(user), ...resolveMembership(memberships,organizationId), memberships };
    });
  }
  async function switchOrganization(userId, organizationId) {
    return transaction(async(db,session)=>{
      const user=await db.collection('identity_users').findOne({user_id:identifier(userId)},{session});
      if(!user||user.status==='disabled')throw new ApiError(404,'Usuario no encontrado.');
      return sessionResult(user,await membershipsIn(db,userId,session),organizationId,db,session);
    });
  }
  async function updateOwnProfile(userId,org,input={}) {
    if(Object.keys(input).some(key=>!['name','phone'].includes(key)))throw new ApiError(400,'Solo puedes modificar tu nombre y teléfono desde Cuenta.');
    const name=label(input.name,'name');
    if(typeof input.phone!=='string'||input.phone.length>40||!/^[0-9+().\s-]*$/.test(input.phone))throw new ApiError(400,'Teléfono inválido.');
    await transaction(async(db,session)=>{
      await db.collection('identity_organizations').updateOne({organization_id:identifier(org)},{$inc:{membership_revision:1}},{session});
      await memberIn(db,userId,org,session);
      const user=await db.collection('identity_users').findOne({user_id:identifier(userId)},{session});
      await db.collection('identity_users').updateOne({user_id:identifier(userId)},{$set:{name,profile:{...(user.profile||{}),phone:input.phone.trim()},updated_at:new Date()}},{session});
      await appendPlatformAudit(infrastructure(),db,session,{organizationId:org,userId},'account.profile_updated','identity_users',userId,{fields:['name','phone']});
    });
    return me(userId,org);
  }
  async function memberIn(db, userId, org, session) {
    const membership = await db.collection('identity_memberships').findOne({ user_id: identifier(userId), organization_id: identifier(org) }, { session });
    const organization = await db.collection('identity_organizations').findOne({ organization_id: identifier(org), status: 'active' }, { session });
    const user = membership && await db.collection('identity_users').findOne({ user_id: identifier(userId) }, { session });
    if (!user || !organization || user.status === 'disabled') throw new ApiError(404, 'Usuario no encontrado en esta organización.');
    return { ...publicUser(user), name: membership.display_name || user.name, organization_id: organization.organization_id, organization_name: organization.name, organization_slug: organization.slug, role: membership.role };
  }
  async function listUsers(org) {
    return read(async (db) => {
      const members = await db.collection('identity_memberships').find({ organization_id: identifier(org) }).sort({ user_id: 1 }).limit(1000).toArray();
      const rows = [];
      for (const member of members) { try { rows.push(await memberIn(db,member.user_id,org)); } catch (error) { if (error.statusCode !== 404) throw error; } }
      return rows;
    });
  }
  async function getUserById(userId, org) { return read((db) => memberIn(db,userId,org)); }
  async function requireAdmin(db, session, org, actor) {
    if (!actor) throw new ApiError(403, 'Se requiere un administrador vigente.');
    const organization = await db.collection('identity_organizations').findOne({ organization_id: identifier(org), status: 'active' }, { session });
    if (!organization) throw new ApiError(404, 'Organización no disponible.');
    // Serialize membership changes and acceptance against the same organization document.
    await db.collection('identity_organizations').updateOne({ organization_id: identifier(org) }, { $inc: { membership_revision: 1 } }, { session });
    const user = await db.collection('identity_users').findOne({ user_id: identifier(actor) }, { session });
    const membership = await db.collection('identity_memberships').findOne({ user_id: identifier(actor), organization_id: identifier(org), role: 'admin' }, { session });
    if (!user || user.status === 'disabled' || !membership) throw new ApiError(403, 'Se requiere un administrador vigente.');
  }
  const auditMutation = (db, session, actor, org, action, type, target, metadata) => appendPlatformAudit(infrastructure(), db, session, { userId: identifier(actor), organizationId: identifier(org) }, action, type, target, metadata);
  async function createUser(input, org, actor) {
    const email = emailAddress(input.email), name = input.name ? label(input.name,'name') : null, password = passwordValue(input.password), role = roleValue(input.role);
    return transaction(async (db,session) => {
      await requireAdmin(db, session, org, actor);
      const organization = await db.collection('identity_organizations').findOne({ organization_id: identifier(org), status: 'active' }, { session });
      if (!organization) throw new ApiError(404, 'Organización no disponible.');
      // Adding an existing global account requires a consented invitation flow, not knowledge of its email.
      if (await db.collection('identity_users').findOne({ email }, { session })) throw new ApiError(409, 'El email ya existe. Incorporar cuentas existentes requiere invitación.');
      const userId = await infrastructure().nextId('identity_users',session), now = new Date();
      await db.collection('identity_users').insertOne({ user_id: userId, email, name, password_hash: createPasswordHash(password), created_at: now, updated_at: now }, { session });
      await db.collection('identity_memberships').insertOne({ user_id: userId, organization_id: identifier(org), role, created_at: now }, { session });
      await auditMutation(db,session,actor,org,'member.created','identity_memberships',userId,{role});
      return memberIn(db,userId,org,session);
    });
  }
  async function protectLastAdmin(db,session,org,userId,targetRole) {
    await db.collection('identity_organizations').updateOne({ organization_id: identifier(org) }, { $inc: { membership_revision: 1 } }, { session });
    const current = await db.collection('identity_memberships').findOne({ user_id: identifier(userId), organization_id: identifier(org) }, { session });
    if (current?.role === 'admin' && targetRole !== 'admin') {
      const admins = await db.collection('identity_memberships').find({ organization_id: identifier(org), role: 'admin' }, { session }).toArray();
      let count = 0;
      for (const admin of admins) { const user=await db.collection('identity_users').findOne({user_id:admin.user_id},{session});if(user && user.status!=='disabled')count++; }
      if (count <= 1) throw new ApiError(409, 'La organización debe conservar al menos un administrador.');
    }
  }
  async function updateUser(userId,input,org,actor) {
    const changes = {};
    if (input.name != null) changes.display_name = label(input.name,'name');
    if (input.role != null) changes.role = roleValue(input.role);
    return transaction(async (db,session) => {
      await requireAdmin(db,session,org,actor);
      const current = await memberIn(db,userId,org,session);
      if(identifier(userId)===identifier(actor)&&current.role==='admin'&&changes.role&&changes.role!=='admin')throw new ApiError(409,'No puedes retirar tus propios privilegios de administrador. Otro administrador debe revisar el cambio.');
      await protectLastAdmin(db,session,org,userId,changes.role || current.role);
      if (Object.keys(changes).length) await db.collection('identity_memberships').updateOne({ user_id: identifier(userId), organization_id: identifier(org) }, { $set: { ...changes, updated_at: new Date() } }, { session });
      await auditMutation(db,session,actor,org,'member.updated','identity_memberships',userId,{previous_role:current.role,role:changes.role||current.role});
      return memberIn(db,userId,org,session);
    });
  }
  async function updateUserPassword(userId,password,org,actor) {
    const hash = createPasswordHash(passwordValue(password));
    return transaction(async (db,session) => {
      await requireAdmin(db,session,org,actor);
      await memberIn(db,userId,org,session);
      const memberships = await db.collection('identity_memberships').countDocuments({ user_id: identifier(userId) }, { session });
      if (memberships !== 1) throw new ApiError(403, 'La contraseña de una cuenta multiempresa requiere recuperación por su titular.');
      await db.collection('identity_users').updateOne({ user_id: identifier(userId) }, { $set: { password_hash: hash, auth_sessions:{}, auth_actions:{}, updated_at: new Date() },$inc:{session_version:1} }, { session });
      await auditMutation(db,session,actor,org,'member.password_updated','identity_users',userId);
      return memberIn(db,userId,org,session);
    });
  }
  async function deleteUser(userId,org,actor) {
    return transaction(async (db,session) => {
      await requireAdmin(db,session,org,actor);
      const current = await memberIn(db,userId,org,session);
      if(identifier(userId)===identifier(actor))throw new ApiError(409,'No puedes revocar tu propio acceso administrativo desde Miembros. Otro administrador debe revisar el cambio.');
      await protectLastAdmin(db,session,org,userId,null);
      await db.collection('identity_memberships').deleteOne({ user_id: identifier(userId), organization_id: identifier(org) }, { session });
      const invitations=await db.collection('identity_invitations').updateMany({organization_id:identifier(org),email:current.email,status:'pending'},{$set:{status:'revoked',revoked_by:identifier(actor),revoked_at:new Date()}},{session});
      await auditMutation(db,session,actor,org,'member.revoked','identity_memberships',userId,{previous_role:current.role,revoked_invitations:invitations.modifiedCount||0});
      // Global account and other organizations remain intact.
      return current;
    });
  }
  function publicInvitation(row) {
    return { invitation_id: row.invitation_id, organization_id: row.organization_id, email: row.email, role: row.role,
      status: row.status === 'pending' && new Date(row.expires_at) <= new Date() ? 'expired' : row.status,
      created_by: row.created_by, created_at: row.created_at, expires_at: row.expires_at };
  }
  async function listInvitations(org) {
    return read(async db => (await db.collection('identity_invitations').find({ organization_id: identifier(org) }).sort({ created_at: -1 }).limit(100).toArray()).map(publicInvitation));
  }
  async function createInvitation(input, org, actor) {
    const email = emailAddress(input.email), role = roleValue(input.role);
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return transaction(async (db,session) => {
      await requireAdmin(db,session,org,actor);
      const now = new Date();
      const row = { invitation_id: crypto.randomUUID(), organization_id: identifier(org), email, role, token_hash: tokenHash,
        status: 'pending', created_by: identifier(actor), created_at: now, expires_at: new Date(now.getTime() + 7 * 86400000) };
      const existing = await db.collection('identity_users').findOne({ email }, {session});
      if (existing && await db.collection('identity_memberships').findOne({user_id:existing.user_id,organization_id:identifier(org)},{session})) throw new ApiError(409, 'La cuenta ya pertenece a esta organización.');
      await db.collection('identity_invitations').insertOne(row,{session});
      await auditMutation(db,session,actor,org,'invitation.created','identity_invitations',row.invitation_id,{role,expires_at:row.expires_at});
      return { invitation:publicInvitation(row), token };
    });
  }
  async function revokeInvitation(id,org,actor) {
    if(typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new ApiError(400,'Invitación inválida.');
    return transaction(async (db,session) => {
      await requireAdmin(db,session,org,actor);
      const filter={organization_id:identifier(org),invitation_id:id,status:'pending'};
      const row=await db.collection('identity_invitations').findOne(filter,{session});
      if(!row)throw new ApiError(404,'Invitación no disponible.');
      await db.collection('identity_invitations').updateOne(filter,{$set:{status:'revoked',revoked_at:new Date(),revoked_by:identifier(actor)}},{session});
      await auditMutation(db,session,actor,org,'invitation.revoked','identity_invitations',id);
      return {invitation_id:id,status:'revoked'};
    });
  }
  async function acceptInvitation(input,userId) {
    if(typeof input.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.token)) throw new ApiError(400,'Invitación inválida.');
    const tokenHash=crypto.createHash('sha256').update(input.token).digest('hex');
    return transaction(async (db,session) => {
      const row=await db.collection('identity_invitations').findOne({token_hash:tokenHash},{session});
      if(!row || row.status!=='pending' || new Date(row.expires_at)<=new Date())throw new ApiError(410,'La invitación venció, fue utilizada o está revocada.');
      await requireAdmin(db,session,row.organization_id,row.created_by);
      const user=await db.collection('identity_users').findOne({user_id:identifier(userId)},{session});
      if(!user || user.status==='disabled' || user.email!==row.email)throw new ApiError(403,'Inicia sesión con la cuenta destinataria de la invitación.');
      if(await db.collection('identity_memberships').findOne({user_id:user.user_id,organization_id:row.organization_id},{session}))throw new ApiError(409,'La cuenta ya pertenece a esta organización.');
      await db.collection('identity_memberships').insertOne({user_id:user.user_id,organization_id:row.organization_id,role:row.role,created_at:new Date(),invitation_id:row.invitation_id},{session});
      await db.collection('identity_invitations').updateOne({invitation_id:row.invitation_id,status:'pending'},{$set:{status:'accepted',accepted_by:user.user_id,accepted_at:new Date()}},{session});
      await auditMutation(db,session,user.user_id,row.organization_id,'invitation.accepted','identity_memberships',user.user_id,{invitation_id:row.invitation_id,role:row.role});
      return sessionResult(user,await membershipsIn(db,user.user_id,session),row.organization_id,db,session);
    });
  }
  async function mfaSessionIn(db,session,userId,organizationId) {
    const user=await db.collection('identity_users').findOne({user_id:identifier(userId)},{session});
    if(!user||user.status==='disabled')throw new ApiError(401,'Usuario no disponible.');
    return sessionResult(user,await membershipsIn(db,userId,session),organizationId,db,session);
  }
  return { validateSession, mfaSessionIn, updateOwnProfile, createInvitation, listInvitations, revokeInvitation, acceptInvitation, initializeIdentityIndexes, register, login, me, switchOrganization, getUserMemberships, listActiveOrganizations, listUsers, getUserById, createUser, updateUser, updateUserPassword, deleteUser };
}
module.exports = { createMongoIdentityService, INDEX_PLAN, service: createMongoIdentityService() };
