const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const local=path.join(root,'.venv-bsie',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const python=process.env.BSIE_PYTHON||(fs.existsSync(local)?local:'python');
const args=process.argv[2]==='benchmark'?['-m','bsie.benchmark']:process.argv[2]==='sanitary'?['-m','unittest','sanitary.test_engine','-v']:['-m','unittest','bsie.test_engine','bsie.test_advanced','bsie.test_temporal','-v'];
const result=spawnSync(python,args,{cwd:root,stdio:'inherit',shell:false,windowsHide:true,env:{...process.env,PROJ_NETWORK:'OFF'}});
if(result.error)console.error('Configura BSIE_PYTHON y las dependencias de bsie/requirements-test.txt.');
process.exitCode=result.status??1;
