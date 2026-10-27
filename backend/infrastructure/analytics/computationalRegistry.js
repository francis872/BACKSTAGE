const legacy=require('./algorithmRegistry');
const evidence=require('../../services/analyticsEvidence.service');
const spatial=require('../../services/spatialEvidence.service');
const perception=require('../../domain/perception');
const defense=require('../../domain/adaptiveDefense');
const {fail}=require('../../domain/computationalContract');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fingerprints=new Map();
function fingerprint(id){if(!fingerprints.has(id)){const files=['backend/infrastructure/analytics/computationalRegistry.js','backend/domain/computationalContract.js','backend/services/intelligenceContract.service.js',...(id.startsWith('bsie.')?['bsie/engine.py','bsie/temporal.py','bsie/requirements.txt']:id.startsWith('perception.')?['backend/domain/perception.js','backend/domain/geometry.js','backend/spatial/core.js']:id==='defense.evaluate'?['backend/domain/adaptiveDefense.js']:id.startsWith('gis.')?['backend/services/spatialEvidence.service.js','backend/spatial/core.js','shared/spatialRules.v1.json']:['backend/infrastructure/analytics/algorithmRegistry.js','backend/domain/analytics/financial.js','backend/domain/analytics/multicriteria.js','backend/domain/analytics/normalization.js','backend/domain/analytics/risk.js','backend/services/analyticsEvidence.service.js','shared/financial.v2.mjs','shared/decimal.mjs'])];fingerprints.set(id,crypto.createHash('sha256').update(JSON.stringify(files.map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../../..',file))).digest('hex')})))).digest('hex'));}return fingerprints.get(id);}
const entries=Object.create(null);
for(const a of legacy.listAlgorithms())entries[a.name]={id:a.name,version:evidence.supported(a.name)?evidence.versionFor(a.name):a.version,category:a.category,runtime:'javascript_worker',purpose:a.purpose};
for(const id of['gis.distance_matrix','gis.point_in_polygon'])entries[id]={id,version:spatial.VERSION,category:'geospatial',runtime:'javascript_worker',purpose:'Adaptador del motor GIS existente, con unidades y fuentes explícitas.'};
for(const operation of['validate','weights','recommend','moran','local_moran','gi_star','kde','temporal','regression']){const id=`bsie.${operation}`;entries[id]={id,version:'bsie-1.1.0',category:'geostatistics',runtime:'existing_python_runner',purpose:'Adaptador del BSIE existente; no reemplaza sus métodos.'};}
for(const id of['perception.geojson','perception.positions'])entries[id]={id,version:perception.VERSION,category:'perception',runtime:'javascript_worker',purpose:'Validación y análisis acotado de observaciones aportadas; no conecta GPS ni satélite.'};
entries['defense.evaluate']={id:'defense.evaluate',version:defense.VERSION,category:'defense',runtime:'javascript_worker',purpose:'Evaluación de umbrales con entrenamiento/validación; solo propuestas.'};
function get(id){if(typeof id!=='string'||!Object.hasOwn(entries,id))fail('Algoritmo no registrado.',400);return {...entries[id],source_sha256:fingerprint(id)};}
function list(){return Object.values(entries).map(row=>{const a=get(row.id);return {...a,input_schema:{type:'object',max_serialized_bytes:200000},output_schema:{type:'object',max_serialized_bytes:1000000},timeout_ms:30000,arbitrary_code:false,side_effects:'none',parameters_contract:a.id.startsWith('bsie.')?'/soi/bsie/methods':a.id.startsWith('perception.')||a.id==='defense.evaluate'?'/computational/openapi':'/analytics/algorithms'};});}
async function runPure(id,parameters){
 const algorithm=get(id);let result,analysis=null;
 if(evidence.supported(id)){const p=await evidence.canonicalInput(id,parameters);result=await evidence.run(id,p);analysis=await evidence.build(id,p,result);}
 else if(spatial.supported(id)){const p=spatial.canonicalInput(id,parameters);result=spatial.run(id,p);analysis=spatial.build(id,p,result);}
 else if(id==='perception.geojson')result=perception.geojson(parameters);
 else if(id==='perception.positions')result=perception.positions(parameters);
 else if(id==='defense.evaluate')result=defense.evaluate(parameters);
 else if(algorithm.runtime==='javascript_worker')result=await legacy.getAlgorithm(id).run(parameters);
 else fail('El algoritmo requiere el runner Python.');
 return {algorithm:id,version:algorithm.version,source_sha256:algorithm.source_sha256,result,...(analysis?{analysis}:{})};
}
module.exports={get,list,runPure,unavailable:['grey_wolf_optimizer','ant_colony_optimization','sparrow_search','genetic_algorithm','radial_basis_network']};
