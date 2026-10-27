const test=require('node:test'),assert=require('node:assert/strict');
test('Node deployment retains scientific fingerprint assets that static JavaScript tracing can omit',()=>{
 const config=require('../../deployment/vercel-api.json');const node=config.builds.find(b=>b.use==='@vercel/node');
 for(const file of['bsie/engine.py','bsie/temporal.py','bsie/requirements.txt']){assert(node.config.includeFiles.includes(file),`Missing runtime fingerprint asset: ${file}`);assert(require('node:fs').existsSync(require('node:path').resolve(__dirname,'../..',file)));}
 assert(node.config.includeFiles.includes('backend/workers/**'));assert.match(require('../infrastructure/analytics/computationalRegistry').get('bsie.moran').source_sha256,/^[a-f0-9]{64}$/);
});
