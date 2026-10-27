const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),site='https://backstage-web-seven.vercel.app',api='https://backstage-api.vercel.app';
const report={checked_at:new Date().toISOString(),site,api,checks:[],operational_records_written:false};
async function request(url,options={}){return fetch(url,{...options,signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache',...(options.headers||{})}});}
async function main(){
 const backend=await request(api+'/health');assert.equal(backend.status,200);const health=await backend.json();assert.equal(health.status,'ok');assert.equal(health.primaryStore,'mongodb');assert.equal(health.mongodb,'healthy');assert.equal(health.postgres,undefined);assert.equal(health.postgresVersion,undefined);report.checks.push('public_api_healthy_atlas_only');
 const page=await request(site+'/dashboard?page=soi');assert.equal(page.status,200);const html=await page.text();assert.match(html,/assets\/index-[^"']+\.js/);report.checks.push('public_frontend_html_and_asset_entry');
 const proxied=await request(site+'/api/health');assert.equal(proxied.status,200);assert.equal((await proxied.json()).primaryStore,'mongodb');report.checks.push('public_frontend_proxy_reaches_mongodb_api');
 assert.equal((await request(site+'/api/soi/sanitary/catalog')).status,401);report.checks.push('public_sanitary_data_requires_authentication');
 assert.equal((await request(api+'/internal/science',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);report.checks.push('public_scientific_function_requires_private_signature');
 report.passed=true;
}
main().catch(error=>{report.passed=false;report.failure=error.message;process.exitCode=1;}).finally(()=>{fs.writeFileSync(path.join(root,'docs/evidence/soi-public-release.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));});
