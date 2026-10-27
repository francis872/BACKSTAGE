// Creates a self-contained source snapshot; never deploys or copies private env files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.vercel',`soi-api-${Date.now()}`);
fs.mkdirSync(output,{recursive:true});
const files=[];
function copy(source,target){fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);files.push({path:path.relative(output,target).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')});}
function tree(source,relative){for(const entry of fs.readdirSync(source,{withFileTypes:true})){if(entry.isSymbolicLink())continue;if(['node_modules','.vercel','__pycache__','logs','tests'].includes(entry.name)||entry.name.startsWith('.env')||entry.name.endsWith('.test.js')||entry.name.endsWith('.log')||entry.name.endsWith('.gdb')||relative.replaceAll('\\','/')==='backend/domain'&&entry.name==='helpers')continue;const input=path.join(source,entry.name),name=path.join(relative,entry.name);if(entry.isDirectory())tree(input,name);else copy(input,path.join(output,name));}}
for(const name of ['backend','shared','bsie','sanitary'])tree(path.join(root,name),name);
copy(path.join(root,'deployment/science.py'),path.join(output,'api/science.py'));
copy(path.join(root,'deployment/vercel-api.json'),path.join(output,'vercel.json'));
copy(path.join(root,'backend/package-lock.json'),path.join(output,'package-lock.json'));
if(!process.argv.includes('--unlinked')){copy(path.join(root,'backend/.vercel/project.json'),path.join(output,'.vercel/project.json'));}
const backend=JSON.parse(fs.readFileSync(path.join(root,'backend/package.json'),'utf8'));
fs.writeFileSync(path.join(output,'package.json'),JSON.stringify({name:'backstage-soi-api-release',private:true,engines:{node:'24.x'},dependencies:backend.dependencies,...(backend.overrides?{overrides:backend.overrides}:{}),scripts:{'vercel-build':'node backend/scripts/initialize-soi-mongo.js'}},null,2));
const requirements=['bsie/requirements.txt','sanitary/requirements.txt'].flatMap(file=>fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/)).map(line=>line.trim()).filter(line=>line&&!line.startsWith('-r')&&!line.startsWith('#'));
fs.writeFileSync(path.join(output,'requirements.txt'),[...new Set(requirements)].join('\n')+'\n');
fs.writeFileSync(path.join(output,'.python-version'),'3.12\n');
fs.writeFileSync(path.join(output,'.vercelignore'),'.env*\nnode_modules\n.vercel\n**/__pycache__/**\n');
for(const name of ['package.json','requirements.txt','.python-version','.vercelignore'])files.push({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex')});
fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify({created_at:new Date().toISOString(),files},null,2));
const check=require('node:child_process').spawnSync(process.execPath,['-e','require(process.argv[1]);process.exit(0)',path.join(output,'backend/index.js')],{encoding:'utf8',windowsHide:true,shell:false,timeout:15000,env:{...process.env,NODE_PATH:path.join(root,'backend/node_modules'),NODE_ENV:'test',JWT_SECRET:'isolated-module-check-not-a-runtime-secret',MONGODB_URI:'mongodb://127.0.0.1:27017',SPATIAL_STORE:'atlas'}});
if(check.status!==0){console.error(check.stderr);throw new Error('Prepared source failed module-loading validation.');}
console.log(JSON.stringify({status:'prepared_not_deployed',directory:output,files:files.length,source_bytes:files.reduce((sum,item)=>sum+fs.statSync(path.join(output,item.path)).size,0)}));
