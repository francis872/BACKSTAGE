const dns=require('node:dns'),net=require('node:net');

// Explicit application setting only; never edits Windows/network configuration.
function configureMongoDns(env=process.env,dnsModule=dns){
 const setting=String(env.MONGODB_DNS_SERVERS||'').trim();if(!setting)return{};
 const servers=setting.split(',').map(value=>value.trim());
 if(servers.length>3||servers.some(server=>!net.isIP(server)))throw new Error('MONGODB_DNS_SERVERS requiere entre una y tres direcciones IP DNS.');
 dnsModule.setServers(servers); // MongoDB's SRV/TXT resolver uses node:dns promises.
 const resolver=new dnsModule.promises.Resolver({timeout:3000,tries:2});resolver.setServers(servers);
 return{lookup(hostname,options,callback){
  if(typeof options==='function'){callback=options;options={};}if(typeof options==='number')options={family:options};options=options||{};
  if(net.isIP(hostname)){const address={address:hostname,family:net.isIP(hostname)};queueMicrotask(()=>options.all?callback(null,[address]):callback(null,address.address,address.family));return;}
  const resolve=async()=>{
   if(options.family===6)return(await resolver.resolve6(hostname)).map(address=>({address,family:6}));
   try{return(await resolver.resolve4(hostname)).map(address=>({address,family:4}));}
   catch(error){if(options.family===4||!['ENODATA','ENOTFOUND'].includes(error.code))throw error;return(await resolver.resolve6(hostname)).map(address=>({address,family:6}));}
  };
  resolve().then(addresses=>{if(!addresses.length){const error=new Error('MongoDB DNS no devolvió direcciones.');error.code='ENOTFOUND';return callback(error);}return options.all?callback(null,addresses):callback(null,addresses[0].address,addresses[0].family);},error=>callback(error));
 }};
}
module.exports={configureMongoDns};
