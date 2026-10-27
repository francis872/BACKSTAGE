const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const core=['backend/services/assets.service.js','backend/services/comparisons.service.js','backend/services/geography.service.js','backend/domain/geometry.js','backend/domain/provenance.js','backend/middleware/organizationContext.js','backend/infrastructure/platformMongo.js','shared/comparison.mjs','backend/domain/computationalContract.js','backend/services/computationalOrchestrator.service.js','backend/services/resourceAuthorization.service.js','backend/repositories/computationalWorkflows.repository.js','backend/infrastructure/analytics/computationalRegistry.js'];
const dependencies=file=>[...fs.readFileSync(file,'utf8').matchAll(/(?:require\(\s*|from\s+|import\(\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]).filter(name=>name.startsWith('.')).map(name=>{
 const base=path.resolve(path.dirname(file),name);
 return [base,base+'.js',base+'.mjs',base+'.json',path.join(base,'index.js')].find(file=>fs.existsSync(file)&&fs.statSync(file).isFile());
}).filter(Boolean);

test('neutral contracts have no industry imports; explicit source/index adapters own storage composition',()=>{
 for(const relative of core){
  for(const file of dependencies(path.join(root,relative)))assert(!/[\\/]soi[\\/]|[\\/]soi[^\\/]*\.(?:js|mjs)$/.test(file),`${relative} imports industry code: ${file}`);
 }
 assert.equal(require('../infrastructure/soiMongo'),require('../infrastructure/platformMongo'));
 assert.equal(require('../services/soiGeo.service'),require('../services/geography.service'));
});

test('new core dependency graph is acyclic and platform route mounts are unique',()=>{
 const complete=new Set();
 function visit(file,stack=[]){
  assert(!stack.includes(file),`Dependency cycle: ${[...stack,file].map(f=>path.relative(root,f)).join(' -> ')}`);
  if(complete.has(file)||file.endsWith('.json'))return;
  for(const target of dependencies(file))visit(target,[...stack,file]);
  complete.add(file);
 }
 for(const file of core)visit(path.join(root,file));
 const mounts=[...fs.readFileSync(path.join(root,'backend/index.js'),'utf8').matchAll(/app\.use\(['"]([^'"]+)['"]/g)].map(m=>m[1]);
 assert.equal(mounts.length,new Set(mounts).size);
 for(const prefix of ['/assets','/comparisons','/geography','/soi','/clean-com'])assert(mounts.includes(prefix));
});
