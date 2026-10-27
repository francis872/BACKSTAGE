'use strict';
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),venv=path.join(root,'.venv-bsie');
const local=path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python');
function run(python,args){const result=spawnSync(python,args,{cwd:root,stdio:'inherit',shell:false,windowsHide:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
try{
 if(!process.env.BSIE_PYTHON&&!fs.existsSync(local))run(process.env.PYTHON||'python',['-m','venv',venv]);
 const python=process.env.BSIE_PYTHON||local;
 run(python,['-m','pip','install','--no-cache-dir','-r',path.join(root,'sanitary','requirements.txt'),'-r',path.join(root,'bsie','requirements-test.txt')]);
 run(python,['-m','unittest','sanitary.test_engine','bsie.test_engine','bsie.test_advanced','bsie.test_temporal']);
 console.log('Runtime científico preparado y verificado. MongoDB no fue modificado.');
}catch(error){console.error(`No se completó la preparación científica: ${error.message}`);process.exitCode=1;}
