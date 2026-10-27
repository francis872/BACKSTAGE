const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),directory=path.resolve(process.argv[2]||''),cli=process.argv[process.argv.indexOf('--cli')+1];
const type=directory.startsWith(path.join(root,'.vercel','soi-api-'))?'api':directory.startsWith(path.join(root,'.vercel','soi-web-'))?'web':null;
if(!type||!fs.existsSync(path.join(directory,'source-manifest.json'))||!process.argv.includes('--cli')||!fs.existsSync(cli))throw new Error('A prepared source directory and --cli path are required.');
const result=spawnSync(process.execPath,[cli,'deploy','--prod','--skip-domain','--yes','--scope','franciscogloopez-8505s-projects','--format','json'],{cwd:directory,encoding:'utf8',windowsHide:true,shell:false,timeout:600000,maxBuffer:20000000});
fs.writeFileSync(path.join(root,'.vercel/soi-cloud-build.log'),(result.stdout||'')+(result.stderr||''));
let output;try{output=JSON.parse(result.stdout);}catch{}
const success=result.status===0&&output?.deployment?.readyState==='READY';
const report={status:success?'ready_not_promoted':'failed',source:directory,deployment:output?.deployment?{id:output.deployment.id,url:output.deployment.url,readyState:output.deployment.readyState}:null,error:success?null:output?.message||result.error?.code||'CLI_FAILED',checked_at:new Date().toISOString()};
fs.writeFileSync(path.join(root,`.vercel/last-soi-${type}-deployment.json`),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(root,'.vercel/last-soi-deployment.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.status==='failed')process.exitCode=1;
