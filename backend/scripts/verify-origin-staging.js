// Real protected Preview, Atlas and public geocoding. Never targets production aliases.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {state,root,api}=require('../../scripts/staging-vercel');
const {request,browser}=require('./verify-staging');
const {ownedFilters,COLLECTIONS}=require('./verify-platform-core-atlas');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const requireMapbox = process.argv.includes('--mapbox');
async function run(){
 const mongo=require('../infrastructure/platformMongo'),{BSON}=require('mongodb');
 const runId=`atlas-core-${new Date().toISOString().replace(/\D/g,'').slice(0,14)}-${crypto.randomBytes(6).toString('hex')}`;
 const marker=`BACKSTAGE ORIGIN TEST ${runId}`,directory=path.join(root,'.vercel',`staging-${runId}`);fs.mkdirSync(directory,{recursive:true});
 const previousEvidence=path.join(root,'docs/evidence/origin-live.json');if(fs.existsSync(previousEvidence)){const old=JSON.parse(fs.readFileSync(previousEvidence,'utf8'));fs.copyFileSync(previousEvidence,path.join(root,`docs/evidence/origin-live-${old.run_id}.json`));}
 const report={run_id:runId,started_at:new Date().toISOString(),mode:'real_protected_origin_browser_atlas_public_geocoding',api_interception:false,checks:[],screenshots:[],production_changes:false};
 const ownership={run_id:runId,organization_ids:[],user_ids:[],organizations:{},users:{}};
 const accounts=[];let db,b,stage='preflight';
 const check=(name,detail={})=>{report.checks.push({name,passed:true,...detail});console.log(JSON.stringify({stage:name}));};
 const saveOwnership=()=>fs.writeFileSync(path.join(directory,'ownership.json'),JSON.stringify(ownership,null,2),{mode:0o600});
 const savePrivate=()=>fs.writeFileSync(path.join(directory,'accounts-private.json'),JSON.stringify(accounts,null,2),{mode:0o600});
 const capture=async name=>{const shot=await b.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const relative=`docs/evidence/origin-live-ui/${runId}/${name}.png`;fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.writeFileSync(path.join(root,relative),Buffer.from(shot.data,'base64'));report.screenshots.push(relative);};
 const tool=async label=>{await b.evaluate(`(()=>{const button=[...document.querySelectorAll('.explorer-toolbar button')].find(e=>e.textContent===${JSON.stringify(label)});if(!button)throw Error('Missing capability');const d=button.closest('details');if(d)d.open=true;button.click();})()`);await pause(250);};
 try{
  for(const type of ['api','web']){assert.equal(state.projects[type].deployment.target,'preview');assert.equal(state.projects[type].deployment.readyState,'READY');assert.match(state.projects[type].name,/^backstage-staging-/);}
  db=await mongo.getMongoDatabase();assert.equal(crypto.createHash('sha256').update(`${process.env.MONGODB_URI}\n${db.databaseName}`).digest('hex'),state.target_fingerprint);
  report.deployments=Object.fromEntries(['api','web'].map(type=>[type,state.projects[type].deployment]));
  const production=JSON.parse(fs.readFileSync(path.join(root,'.vercel/production-release-private.json'),'utf8'));
  for(const type of ['api','web']){const alias=await api(`/v4/aliases/${production.projects[type].domain}`);assert.equal(alias.deploymentId,production.projects[type].deployment.id);}
  check('protected_staging_target_and_original_production_aliases_unchanged');
  stage='register';
  for(const suffix of ['owner','peer','viewer']){const account={email:`origin-${runId}-${suffix}@example.invalid`,password:crypto.randomBytes(24).toString('base64url'),name:`Origin ${suffix}`,organization_name:`${marker} ${suffix}`};accounts.push(account);savePrivate();account.session=(await request('/auth/register',{body:account,expected:201})).value;savePrivate();const user=account.session.user;ownership.organization_ids.push(user.organization_id);ownership.user_ids.push(user.user_id);ownership.organizations[user.organization_id]=account.organization_name;ownership.users[user.user_id]=account.email;saveOwnership();}
  const [owner,peer,viewer]=accounts,session=owner.session,org=session.user.organization_id;
  check('three_new_owned_test_workspaces_registered');
  stage='profile_feed_security';
  const profile=(await request('/auth/me',{session,method:'PATCH',body:{name:'Origin test owner',phone:''}})).value;assert.equal(profile.role,'admin');assert.equal(profile.name,'Origin test owner');
  await request('/auth/me',{session,method:'PATCH',body:{name:'Rejected',phone:'',role:'viewer'},expected:400});
  const projectRef={};
  const privatePost=(await request('/feed',{session,body:{content:`${marker} private post`},expected:201})).value;
  assert(!(await request('/feed',{session:peer.session})).value.data.some(p=>p.operational_event_id===privatePost.operational_event_id));
  const invitation=(await request('/users/invitations',{session:peer.session,body:{email:owner.email,role:'admin'},expected:201})).value;
  await request('/auth/invitations/accept',{session,body:{token:invitation.token}});
  const shared=(await request('/feed',{session,body:{content:`${marker} explicitly shared`,shared_organization_ids:[peer.session.user.organization_id]},expected:201})).value;
  const visible=(await request('/feed',{session:peer.session})).value.data.find(p=>p.operational_event_id===shared.operational_event_id);assert(visible&&visible.project_reference===null);
  await request(`/feed/${shared.operational_event_id}/comments`,{session:peer.session,body:{content:'Authorized peer comment'},expected:201});
  await request(`/feed/${privatePost.operational_event_id}/comments`,{session:peer.session,body:{content:'Forbidden'},expected:404});
  const viewerInvitation=(await request('/users/invitations',{session,body:{email:viewer.email,role:'viewer'},expected:201})).value;
  await request('/auth/invitations/accept',{session:viewer.session,body:{token:viewerInvitation.token}});
  await request('/feed',{session:viewer.session,org,body:{content:'Forbidden viewer write'},expected:403});
  check('account_contact_privilege_guard_private_shared_feed_comments_and_viewer_denial');
  stage='public_geocoding';
  const geocode=async(query,expectedName)=>{for(let attempt=0;attempt<3;attempt++){try{const r=await request('/geography/geocode?'+new URLSearchParams({q:query,limit:'5'}),{session});const rows=r.value.results;assert(Array.isArray(rows));const ordered=[...rows].sort((a,b)=>Number(['administrative','city','town','village','municipality','place','locality'].includes(b.type))-Number(['administrative','city','town','village','municipality','place','locality'].includes(a.type)));const place=ordered.find(p=>String(p.name||p.displayName).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(expectedName)&&String(p.country||p.displayName).toLowerCase().includes('colombia'));assert(place,'Provider did not identify the requested Colombian location');assert(place.coordinates?.length===2);return place;}catch(error){if(attempt===2)throw error;await pause(1500);}}};
  const quibdo=await geocode('Quibdó, Chocó, Colombia','quibdo');await pause(1200);
  const yuto=await geocode('Yuto, El Atrato, Chocó, Colombia','yuto');await pause(1200);
  const istmina=await geocode('Istmina, Chocó, Colombia','istmina');
  report.geography={quibdo,yuto,istmina,exact_municipal_parcel_verified:false,interpretation:'Actual named provider matches; type/precision retained. A park is not a municipal center. No cadastral parcel or municipal headquarters verified'};
  check('quibdo_yuto_istmina_actual_geocoder_results_colombia_not_quito');
  stage='browser_project';b=await browser('origin-owner',directory,{softwareWebGL:true});
  await b.navigate('/login');await b.until("!!document.querySelector('#login-email')");await b.set('#login-email',owner.email);await b.set('#login-password',owner.password);await b.evaluate("document.querySelector('#login-email').closest('form').requestSubmit()");await b.until("!!document.querySelector('.explorer-toolbar')");
  if(requireMapbox){
   const capabilities=(await request('/geography/capabilities',{session})).value;assert.equal(capabilities.autocomplete_provider,'mapbox_geocoding_v6_permanent');
   await b.set('#live-place-query','Quibdó, Chocó, Colombia');await b.until("document.querySelector('[aria-label=\"Sugerencias de búsqueda\"]')?.innerText.includes('Mapbox Geocoding v6')");
   assert(b.requests.some(r=>r.path==='/api/geography/autocomplete'&&r.status===200));
   assert(await b.evaluate("document.querySelector('.search-source-attribution')?.innerText.includes('Mapbox')"));
   await capture('mapbox-autocomplete');await b.evaluate("document.querySelector('[aria-label=\"Sugerencias de búsqueda\"] button').click()");await b.until("document.querySelector('.search-source-details')?.textContent.includes('Mapbox')");
   assert(await b.evaluate("document.querySelector('#live-place-query').value===''&&!document.querySelector('[aria-label=\"Sugerencias de búsqueda\"]')"));
   report.mapbox={provider:capabilities.autocomplete_provider,actual_suggestions_without_search_submission:true,attribution_visible:true,server_only_token:true};
   check('mapbox_permanent_suggestions_while_typing_select_without_stale_results_and_attribution');
  }else{
  await b.set('#live-place-query','Quibdó, Chocó, Colombia');await b.evaluate("document.querySelector('.universal-search form').requestSubmit()");await b.until("!!document.querySelector('.live-place-results button')");
  await b.evaluate("document.querySelector('.live-place-results button').click()");await b.until("document.querySelector('.universal-search').innerText.toLowerCase().includes('quibd')");
  }
  await tool('Proyectos');await b.until("!!document.querySelector('.explorer-capability-panel textarea')");await b.set('.explorer-capability-panel .entity-form input','Quibdó 2040');await b.set('.explorer-capability-panel .entity-form textarea','Evaluación institucional de referencia. Localidad verificada; predio municipal exacto pendiente de confirmación en el mapa. Ensayo técnico autorizado.');await b.evaluate("document.querySelector('.explorer-capability-panel .entity-form').requestSubmit()");await b.until("document.querySelector('.explorer-project-context')?.innerText.includes('Quibdó 2040')");
  const project=await db.collection('analysis_runs').findOne({organization_id:org,project_name:'Quibdó 2040'});assert(project);projectRef.id=project.analysis_run_id;report.project_id=project.analysis_run_id;
  assert(project.metadata.territory.coordinates.every(Number.isFinite));assert(/quibd/i.test(project.metadata.territory.name));
  if(requireMapbox){
   // Existing analysis projects retain structured source; converted comparison
   // projects use source + source_metadata. Both must retain real attribution.
   const territory=project.metadata.territory,metadata=typeof territory.source==='object'?territory.source:territory.source_metadata;
   assert.equal(metadata?.name||territory.source,'Mapbox Geocoding v6');assert.equal(metadata.storage,'permanent');assert(metadata.attribution.includes('Mapbox'));
  }
  check('real_browser_project_quibdo_2040_uses_selected_location_without_reentry');
  stage='evidence_comparison';
  const gis=(await request('/analytics/gis',{session,expected:201,body:{algorithm:'distance_matrix',coordinates:[quibdo.coordinates,yuto.coordinates,istmina.coordinates],crs:'OGC:CRS84',coordinate_order:'longitude_latitude',source:{name:'Actual OpenStreetMap locality geocoding via BACKSTAGE; spherical distances, not roads or municipal property measurements',data_type:'ORGANIZATION_PROVIDED'},analysis_run_id:project.analysis_run_id}})).value;
  const job=await db.collection('analytics_jobs').findOne({organization_id:org,analytics_job_id:gis.analytics_job_id});assert(job?.result?.distance_m);
  const candidates=[yuto,istmina].map((place,i)=>({id:`origin-locality:${i+1}`,name:place.displayName||place.name,lat:place.coordinates[1],lng:place.coordinates[0],source:place.source,geometry:place.geometry,city:place.city,region:place.region,country:place.country}));
  const observations=Object.fromEntries(candidates.map((c,i)=>[c.id,{distance:{value:(job.result.distance_m[0][i+1]/1000).toFixed(6),source:`Geocoding and persisted GIS job ${gis.analytics_job_id}; spherical reference only`,observed_at:new Date().toISOString(),data_type:'ORGANIZATION_PROVIDED'}}]));
  const comparison=(await request('/comparisons',{session,body:{project_name:'Quibdó 2040 · distancias de localidades',candidates,criteria:[{id:'distance',name:'Distancia de referencia a Quibdó',definition:'Distancia esférica entre puntos de referencia de localidades; no accesibilidad vial ni aptitud de un predio.',unit:'km',source:'OpenStreetMap locality geocoding and BACKSTAGE GIS evidence',weight:'1',direction:'cost',normalization:'minmax',missing:'block'}],observations},expected:201})).value.data;
  const linked=(await request(`/comparisons/${comparison.comparison_id}/project`,{session,body:{analysis_run_id:project.analysis_run_id,territory:project.metadata.territory}})).value.data;assert.equal(linked.analysis_run_id,project.analysis_run_id);
  assert.equal(await db.collection('analysis_runs').countDocuments({organization_id:org}),1);
  assert.equal((await request(`/comparisons/${comparison.comparison_id}/reproducibility`,{session})).value.data.verified,true);
  await request(`/comparisons/${comparison.comparison_id}`,{session:peer.session,expected:404});
  report.comparison_id=comparison.comparison_id;report.gis_job_id=gis.analytics_job_id;
  check('actual_coordinate_distance_evidence_deterministic_comparison_and_existing_project_link');
  await b.navigate(`/dashboard?page=portfolio-comparator&project=${project.analysis_run_id}&comparison=${comparison.comparison_id}`);await b.until("document.querySelector('.explorer-capability-panel')?.innerText.includes('Distancia de referencia a Quibdó')");
  await capture('comparison-real-evidence');
  await tool('Activos');await b.until("document.querySelector('.explorer-capability-panel')?.innerText.includes('Inventario')");await tool('Proyectos');await b.until("document.querySelector('.explorer-capability-panel')?.innerText.includes('Quibdó 2040')");
  await b.reload();await b.until("document.querySelector('.explorer-project-context')?.innerText.includes('Quibdó 2040')");
  await tool('Comparar');await b.until("document.querySelector('.explorer-capability-panel')?.innerText.includes('Distancia de referencia a Quibdó')");check('real_browser_comparison_project_capability_switch_and_reload_restore');
  stage='regional_exploration';
  for(const place of [yuto,istmina]){
   let found=false;
   for(let attempt=0;attempt<3&&!found;attempt++){
    await pause(1500);await b.set('#live-place-query',place.provenance.query);await b.evaluate("document.querySelector('.universal-search form').requestSubmit()");await b.until("!!document.querySelector('.universal-search form button')&&!document.querySelector('.universal-search form button').disabled");
    found=await b.evaluate("!!document.querySelector('.live-place-results button')");
    if(!found)(report.provider_retries||=[]).push({place:place.name,attempt:attempt+1});
   }
   assert(found,'Public geographic search remained unavailable after bounded explicit retries');
   await b.evaluate("document.querySelector('.live-place-results button').click()");await b.until("!document.querySelector('.live-place-results button')");
   assert(await b.evaluate("document.querySelector('.explorer-project-context')?.innerText.includes('Quibdó 2040')"));
   assert.deepEqual((await db.collection('analysis_runs').findOne({organization_id:org,analysis_run_id:project.analysis_run_id})).metadata.territory,project.metadata.territory);
  }
  check('actual_yuto_istmina_exploration_preserves_quibdo_project_and_canonical_site');
  stage='route_planning';
  await tool('Planificar rutas');await b.until("!!document.querySelector('.soi-route')");
  await b.set('.soi-route>label input',`Quibdó – Yutó ${runId}`);
  for(const [index,place]of [quibdo,yuto].entries()){
   await b.evaluate(`document.querySelectorAll('.soi-waypoint details')[${index}].open=true;true`);
   const base=`.soi-waypoint:nth-of-type(${index+1}) details`;
   await b.set(`${base} label:nth-of-type(1) input`,place.name);await b.set(`${base} label:nth-of-type(2) input`,String(place.coordinates[0]));await b.set(`${base} label:nth-of-type(3) input`,String(place.coordinates[1]));
  }
  await b.evaluate("[...document.querySelectorAll('.soi-route button')].find(e=>e.textContent==='Calcular ruta vial').click()");await b.until("[...document.querySelectorAll('.soi-route button')].some(e=>e.textContent==='Guardar planificación')");
  await b.evaluate("[...document.querySelectorAll('.soi-route button')].find(e=>e.textContent==='Guardar planificación').click()");await b.until("document.querySelector('.soi-route')?.innerText.includes('Planificación guardada:')");
  const plan=await db.collection('soi_route_plans').findOne({organization_id:org});assert(plan?.result?.routes?.[0]?.geometry?.coordinates?.length>1);assert.deepEqual(plan.coordinates,[quibdo.coordinates,yuto.coordinates]);
  assert.equal(plan.analysis_run_id,project.analysis_run_id);assert.match(plan.result_sha256,/^[a-f0-9]{64}$/);assert((await db.collection('analysis_runs').findOne({organization_id:org,analysis_run_id:project.analysis_run_id})).metadata.route_plan_ids.includes(plan.route_plan_id));report.route_plan_id=plan.route_plan_id;report.route_source=plan.result.source;
  await request(`/geography/route-plans/${plan.route_plan_id}`,{session:peer.session,expected:404});check('real_road_plan_saved_in_atlas_with_provider_provenance_and_tenant_isolation');
  stage='map_render';
  await b.evaluate("[...document.querySelectorAll('.side-menu button')].find(e=>e.textContent==='Explorador Territorial').click()");
  await b.until("document.querySelector('.explorer-map')?.dataset.mapReady==='true'");assert(await b.evaluate("document.querySelector('.maplibregl-canvas').width>0"));
  await b.evaluate("window.originCanvas=document.querySelector('.maplibregl-canvas');true");
  for(const mode of ['3D','Globo','2D']){await b.evaluate(`(()=>{const button=[...document.querySelectorAll('.explorer-map button')].find(e=>e.textContent===${JSON.stringify(mode)});button.click();})()`);await pause(900);assert(await b.evaluate("window.originCanvas===document.querySelector('.maplibregl-canvas')"));assert(await b.evaluate("document.querySelector('.explorer-project-context').innerText.includes('Quibdó 2040')"));await capture('map-'+mode.toLowerCase());}
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(500);assert(!await b.evaluate('document.documentElement.scrollWidth>innerWidth+1'));await capture('map-mobile');
  check('real_map_style_layers_2d_3d_globe_same_canvas_project_and_mobile');
  assert.equal(b.errors.length,0);report.browser_api_responses=b.requests.length;report.browser_runtime_errors=b.errors;report.status='passed';
 }catch(error){report.status='failed';report.failure={stage,name:error.name,cause:error.cause?.code||null,message:String(error.message).split('\n')[0].slice(0,300)};if(b)await capture('failure').catch(()=>{});process.exitCode=1;}
 finally{
  b?.close();
  if(db)for(const account of accounts.filter(a=>!a.session)){try{const u=await db.collection('identity_users').findOne({email:account.email});if(!u)continue;const membership=await db.collection('identity_memberships').findOne({user_id:u.user_id});const o=membership&&await db.collection('identity_organizations').findOne({organization_id:membership.organization_id});assert.equal(o?.name,account.organization_name);account.session={user:{user_id:u.user_id,organization_id:o.organization_id}};ownership.organization_ids.push(o.organization_id);ownership.user_ids.push(u.user_id);ownership.organizations[o.organization_id]=account.organization_name;ownership.users[u.user_id]=account.email;saveOwnership();}catch(error){report.ownership_recovery_failed=true;report.status='failed';process.exitCode=1;}}
  if(db&&ownership.organization_ids.length){try{
   for(const account of accounts.filter(a=>a.session)){const u=await db.collection('identity_users').findOne({user_id:account.session.user.user_id});assert.equal(u?.email,account.email);const o=await db.collection('identity_organizations').findOne({organization_id:account.session.user.organization_id});assert.equal(o?.name,account.organization_name);}
   const filters=ownedFilters(ownership),names=[...new Set([...COLLECTIONS,'operational_events','analytics_jobs','soi_configuration','soi_route_plans'])];for(const name of names)if(!filters[name])filters[name]={organization_id:{$in:ownership.organization_ids}};
   const keys=accounts.filter(a=>a.session).flatMap(a=>[['register',a.email],['login',a.email],['invitation_accept',String(a.session.user.user_id)]].map(([namespace,subject])=>`auth-rate:${namespace}:${crypto.createHmac('sha256',state.jwt_secret).update(subject.trim().toLowerCase()).digest('hex')}`));
   const snapshot={run_id:runId,collections:{}};for(const name of names)snapshot.collections[name]=await db.collection(name).find(filters[name]).toArray();snapshot.collections.soi_provider_locks=await db.collection('soi_provider_locks').find({_id:{$in:keys}}).toArray();const bytes=BSON.serialize(snapshot);fs.writeFileSync(path.join(directory,'owned-test-records.bson'),bytes,{mode:0o600});
   await mongo.withMongoTransaction(async(store,session)=>{for(const name of names)await store.collection(name).deleteMany(filters[name],{session});await store.collection('soi_provider_locks').deleteMany({_id:{$in:keys}},{session});});for(const name of names)assert.equal(await db.collection(name).countDocuments(filters[name]),0);
   report.cleanup={passed:true,only_owned_test_records:true,shared_counters_and_global_security_traces_preserved:true,backup_sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  }catch(error){report.cleanup={passed:false,code:error.code||error.name};report.status='failed';process.exitCode=1;}}
  await mongo.closeMongoConnection();report.completed_at=new Date().toISOString();fs.writeFileSync(path.join(directory,'validation-report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'docs/evidence/origin-live.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
}
if(require.main===module){if(process.argv.includes('--apply')&&process.argv.includes('--test-environment'))run().catch(error=>{console.error(JSON.stringify({failed:true,name:error.name}));process.exitCode=1;});else console.log(JSON.stringify({mode:'plan_only',target:'protected_staging_confirmed_atlas_test_only',writes:'three new marked test workspaces; own profile/feed/invitations/project/comparison/GIS',geocoding:'actual public named Colombian matches with provider type retained, no cadastral parcel claim',cleanup:'exact owned selectors, private BSON backup, preserve global counters/security traces'}));}
