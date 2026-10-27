// Explicit deployment preparation. Existing credentials are never read or replaced.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),stateFile=path.join(root,'.vercel/soi-cloud-state.json');
const cli=process.argv[process.argv.indexOf('--cli')+1];
if(!process.argv.includes('--apply')||!process.argv.includes('--cli')||!fs.existsSync(cli))throw new Error('Explicit --apply and --cli path required.');
fs.mkdirSync(path.dirname(stateFile),{recursive:true});
const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{secret:crypto.randomBytes(48).toString('hex'),configured:[]};
fs.writeFileSync(stateFile,JSON.stringify(state));
const variables={SOI_SCIENCE_RPC_SECRET:state.secret,SOI_SCIENCE_RPC_URL:'self',BSIE_REQUEST_WORKER:'true',VERCEL_SUPPORT_LARGE_FUNCTIONS:'1'};
for(const[key,value]of Object.entries(variables)){
 if(state.configured.includes(key)&&(key!=='SOI_SCIENCE_RPC_URL'||state.rpc_self_configured))continue;
 const result=spawnSync(process.execPath,[cli,'env','add',key,'production','--yes',...(key==='SOI_SCIENCE_RPC_URL'&&state.configured.includes(key)?['--force']:[]),key.endsWith('_SECRET')?'--sensitive':'--no-sensitive','--scope','franciscogloopez-8505s-projects'],{cwd:path.join(root,'backend'),input:value,encoding:'utf8',windowsHide:true,shell:false,timeout:120000});
 if(result.status!==0){console.error(JSON.stringify({status:'failed',key,exit_code:result.status,error:result.error?.code||'CLI_FAILED'}));process.exitCode=1;break;}
 if(!state.configured.includes(key))state.configured.push(key);if(key==='SOI_SCIENCE_RPC_URL')state.rpc_self_configured=true;fs.writeFileSync(stateFile,JSON.stringify(state));console.log(JSON.stringify({status:'configured',key,credentials_replaced:false}));
}
