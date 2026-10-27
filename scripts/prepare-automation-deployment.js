const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function prepare(){
 const output=path.join(root,'.vercel',`automation-source-${Date.now()}`),files=[];fs.mkdirSync(output,{recursive:true});
 const add=(name,bytes)=>{const file=path.join(output,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);files.push({path:name.replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(bytes).digest('hex')});};
 function tree(relative){for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
  if(entry.isSymbolicLink()||['node_modules','.vercel','__pycache__','logs','tests','helpers'].includes(entry.name)||entry.name.startsWith('.env')||entry.name.endsWith('.test.js')||entry.name.startsWith('test_'))continue;
  const name=path.join(relative,entry.name);if(name.replaceAll('\\','/').startsWith('backend/cleancom/data/'))continue;
  if(entry.isDirectory())tree(name);else if(/\.(js|mjs|cjs|json|py|txt)$/.test(entry.name))add(`worker/${name}`,fs.readFileSync(path.join(root,name)));
 }}
 for(const folder of ['backend','shared','bsie','sanitary'])tree(folder);
 const docker=fs.readFileSync(path.join(root,'deployment/worker.Dockerfile'),'utf8').replace('backend/scripts/computational-worker.js','backend/scripts/automation-staging-worker.js');
 add('worker/Dockerfile',docker);add('worker/.dockerignore',fs.readFileSync(path.join(root,'.dockerignore')));
 add('api/status.js',"module.exports=require('../worker/backend/controllers/automationControl.controller').status;\n");
 add('api/expiry.js',"module.exports=require('../worker/backend/controllers/automationControl.controller').functionExpiry;\n");
 add('public/index.html','<!doctype html><html lang="es"><meta charset="utf-8"><title>BACKSTAGE · ensayo autónomo protegido</title><body>Entorno de validación de BACKSTAGE. No es la aplicación de producción.</body></html>');
 const backend=JSON.parse(fs.readFileSync(path.join(root,'backend/package.json'),'utf8'));
 add('package.json',JSON.stringify({name:'backstage-autonomy-staging',private:true,engines:{node:'24.x'},dependencies:backend.dependencies,overrides:backend.overrides},null,2));
 add('package-lock.json',fs.readFileSync(path.join(root,'backend/package-lock.json')));
 add('vercel.json',JSON.stringify({$schema:'https://openapi.vercel.sh/vercel.json',outputDirectory:'public',functions:{'api/status.js':{maxDuration:30,includeFiles:'worker/**'},'api/expiry.js':{maxDuration:30,includeFiles:'worker/**'}},daemons:{'bco-acceptance':{root:'worker',entrypoint:'Dockerfile',instances:{iad1:2},resources:{requests:{memory:'1Gi'}},terminationGracePeriodSeconds:150}}},null,2));
 add('.vercelignore','node_modules\n.env*\n.vercel\n**/__pycache__/**\n');
 fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify({created_at:new Date().toISOString(),files,secrets_included:false},null,2));
 const result={directory:output,files:files.length,status:'prepared_not_deployed'};
 fs.writeFileSync(path.join(root,'.vercel/automation-source-latest.json'),JSON.stringify(result),{mode:0o600});console.log(JSON.stringify(result));return result;
}
if(require.main===module)prepare();module.exports={prepare};
