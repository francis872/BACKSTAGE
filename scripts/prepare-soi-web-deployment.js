// Preserve the shared comparator beside the frontend in an isolated deployment snapshot.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.vercel',`soi-web-${Date.now()}`),files=[];
function copy(source,target){fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);files.push({path:path.relative(output,target).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')});}
function tree(source,relative){for(const entry of fs.readdirSync(source,{withFileTypes:true})){if(entry.isSymbolicLink()||['node_modules','.vercel','dist','tests'].includes(entry.name)||entry.name.startsWith('.env')||entry.name.endsWith('.log')||entry.name.endsWith('.gdb'))continue;const input=path.join(source,entry.name),name=path.join(relative,entry.name);if(entry.isDirectory())tree(input,name);else copy(input,path.join(output,name));}}
tree(path.join(root,'frontend'),'frontend');tree(path.join(root,'shared'),'shared');
const original=JSON.parse(fs.readFileSync(path.join(root,'frontend/package.json'),'utf8'));
fs.writeFileSync(path.join(output,'package.json'),JSON.stringify({...original,scripts:{build:'vite build frontend --config frontend/vite.config.js'}},null,2));
copy(path.join(root,'frontend/package-lock.json'),path.join(output,'package-lock.json'));
if(!process.argv.includes('--unlinked')){copy(path.join(root,'frontend/.vercel/project.json'),path.join(output,'.vercel/project.json'));}
fs.writeFileSync(path.join(output,'vercel.json'),JSON.stringify({version:2,builds:[{src:'package.json',use:'@vercel/static-build',config:{distDir:'frontend/dist'}},{src:'frontend/api/index.js',use:'@vercel/node'}],routes:[{src:'/api/(.*)',dest:'/frontend/api/index.js'},{handle:'filesystem'},{src:'/(.*)',dest:'/index.html'}]},null,2));
fs.writeFileSync(path.join(output,'.vercelignore'),'.env*\nnode_modules\n.vercel\nfrontend/node_modules\nfrontend/dist\nfrontend/.env*\n');
for(const name of ['package.json','vercel.json','.vercelignore'])files.push({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex')});
fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify({created_at:new Date().toISOString(),files},null,2));
console.log(JSON.stringify({status:'prepared_not_deployed',directory:output,files:files.length}));
