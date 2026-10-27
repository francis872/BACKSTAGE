// Read-only DNS/TCP diagnostics. Never prints credentials or changes OS DNS.
const dns=require('node:dns'),net=require('node:net'),path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
async function main(){
 const uri=process.env.MONGODB_URI;if(!uri)throw new Error('MONGODB_URI_NOT_CONFIGURED');
 const parsed=new URL(uri);const server=process.argv.find(v=>v.startsWith('--dns-server='))?.split('=')[1];
 if(server&&!net.isIP(server))throw new Error('DNS_SERVER_MUST_BE_IP');
 const resolver=new dns.promises.Resolver({timeout:3000,tries:1});if(server)resolver.setServers([server]);
 const result={host:parsed.hostname,protocol:parsed.protocol,resolvers:resolver.getServers(),configurationChanged:false};
 const probe=async(name,work)=>{try{result[name]={ok:true,result:await work()};}catch(error){result[name]={ok:false,code:error.code||error.name,syscall:error.syscall};}};
 await probe('srv',()=>resolver.resolveSrv(`_mongodb._tcp.${parsed.hostname}`));
 await probe('txt',()=>resolver.resolveTxt(parsed.hostname));
 if(result.srv?.ok){
  result.addresses=[];
  for(const record of result.srv.result){try{result.addresses.push({host:record.name,addresses:await resolver.resolve4(record.name)});}catch(error){result.addresses.push({host:record.name,code:error.code});}}
 }
 console.log(JSON.stringify(result));if(!result.srv?.ok)process.exitCode=1;
}
main().catch(error=>{console.error(JSON.stringify({error:error.code||error.message}));process.exitCode=1;});
