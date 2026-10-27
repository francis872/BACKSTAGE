const{spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'docs/evidence');
fs.mkdirSync(directory,{recursive:true});
const localPython=path.join(root,'.venv-bsie',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const python=process.env.BSIE_PYTHON||(fs.existsSync(localPython)?localPython:'python');
const cases=[
 ['backend',process.execPath,['--test'],'backend','backend-regression-current.txt'],
 ['frontend',process.execPath,['--test','tests/*.test.mjs'],'frontend','frontend-regression-current.txt'],
 ['bsie',python,['-m','unittest','bsie.test_engine','bsie.test_advanced','bsie.test_temporal','-v'],'.','bsie-scientific-tests.txt'],
 ['sanitary',python,['-m','unittest','sanitary.test_engine','-v'],'.','sanitary-scientific-tests.txt'],
 ['deployment',python,['-m','unittest','deployment.test_science','-v'],'.','scientific-deployment-tests.txt'],
 ['probability',process.env.PROBABILITY_PYTHON||process.env.PYTHON||'python',['-m','unittest','discover','-s','probability','-p','test_*.py','-v'],'.','probability-tests-current.txt'],
];
const only=process.argv.find(value=>value.startsWith('--only='))?.slice(7);
if(only&&!cases.some(row=>row[0]===only))throw new Error('Unknown suite');
const reportFile=path.join(directory,'soi-release-checks.json');
const report=only&&fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile,'utf8')):{started_at:new Date().toISOString(),scope:'local_regression_not_deployment_or_live_provider_verification',checks:[]};
for(const[name,command,args,cwd,file]of cases.filter(row=>!only||row[0]===only)){
 console.log(`Checking ${name}...`);const started=Date.now();
 const result=spawnSync(command,args,{cwd:path.join(root,cwd),encoding:'utf8',windowsHide:true,shell:false,maxBuffer:20000000,timeout:300000,env:{...process.env,...(name==='backend'?{MONGODB_URI:''}:{}),PROJ_NETWORK:'OFF'}});
 const output=(result.stdout||'')+(result.stderr||'');fs.writeFileSync(path.join(directory,file),output,'utf8');
 const check={name,passed:result.status===0,checked_at:new Date().toISOString(),duration_ms:Date.now()-started,evidence:file,...(result.error?{error:result.error.code}:{}),summary:output.split(/\r?\n/).filter(line=>/tests |pass |fail |skipped |Ran \d+ tests|^OK$/.test(line)).slice(-6)};
 report.checks=report.checks.filter(row=>row.name!==name);report.checks.push(check);console.log(JSON.stringify(check));
 if(!check.passed)process.exitCode=1;
}
report.finished_at=new Date().toISOString();report.passed=report.checks.every(check=>check.passed);
fs.writeFileSync(path.join(directory,'soi-release-checks.json'),JSON.stringify(report,null,2));
