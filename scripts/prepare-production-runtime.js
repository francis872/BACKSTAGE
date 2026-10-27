const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function prepare(){
 const output=path.join(root,'.vercel',`production-runtime-${Date.now()}`),files=[];
 fs.mkdirSync(output,{recursive:true});
 function copy(relative){const source=path.join(root,relative),bytes=fs.readFileSync(source),destination=path.join(output,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);files.push({path:relative.replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
 function tree(relative){for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
  if(entry.isSymbolicLink()||['node_modules','.vercel','__pycache__','logs','tests','helpers'].includes(entry.name)||entry.name.startsWith('.env')||entry.name.endsWith('.test.js')||entry.name.startsWith('test_'))continue;
  const name=path.join(relative,entry.name),normalized=name.replaceAll('\\','/');
  if(normalized.startsWith('backend/cleancom/data/'))continue;
  if(entry.isDirectory())tree(name);else if(/\.(js|mjs|cjs|json|py|txt)$/.test(entry.name))copy(name);
 }}
 for(const folder of ['backend','shared','bsie','sanitary'])tree(folder);
 for(const name of ['deployment/worker.Dockerfile','deployment/operations.compose.yaml','.dockerignore','scripts/production-preflight.js'])copy(name);
 const check=require('node:child_process').spawnSync(process.execPath,['-e',"require('./backend/scripts/computational-worker');require('./backend/scripts/hosted-monitor');const c=require('./backend/infrastructure/analytics/computationalRegistry');if(!c.list().length)throw Error('Empty catalog');process.exit(0)"],{cwd:output,encoding:'utf8',windowsHide:true,shell:false,timeout:15000,env:{...process.env,NODE_PATH:path.join(root,'backend/node_modules'),MONGODB_URI:'',NODE_ENV:'test',BACKSTAGE_RUNTIME_ENV:''}});
 if(check.status!==0){fs.writeFileSync(path.join(root,'.vercel/production-runtime-check.log'),String(check.stderr||check.error?.code||''),{mode:0o600});throw Error('Prepared runtime failed isolated module/catalog loading');}
 const manifest={created_at:new Date().toISOString(),status:'source_prepared_not_built_or_deployed',files,isolated_module_catalog_loading_passed:true,dependencies_installed:false,secrets_included:false,continuous_worker_deployed:false};
 fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify(manifest,null,2));
 fs.writeFileSync(path.join(root,'.vercel/production-runtime-latest.json'),JSON.stringify({directory:output,files:files.length},null,2),{mode:0o600});
 console.log(JSON.stringify({directory:output,files:files.length,status:manifest.status}));return manifest;
}
if(require.main===module)prepare();
module.exports={prepare};
