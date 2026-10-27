const crypto=require('node:crypto');
function target(uri,database){
 const match=typeof uri==='string'&&uri.match(/^mongodb(?:\+srv)?:\/\/([^/?]+)(?:\/([^?]*))?/i);
 if(!match||!database||!/^[a-zA-Z0-9_-]{1,38}$/.test(database))throw Error('Invalid MongoDB target');
 const host=match[1].split('@').at(-1).toLowerCase();if(!host||host.includes('#'))throw Error('Invalid MongoDB host');
 return crypto.createHash('sha256').update(`${host}\n${database}`).digest('hex');
}
function assertRuntimeTarget(env){
 if(env.BACKSTAGE_RUNTIME_ENV!=='production')return;
 const actual=target(env.MONGODB_URI,env.MONGODB_DB);
 if(!/^[a-f0-9]{64}$/.test(env.BACKSTAGE_STAGING_TARGET_SHA256||'')||!/^[a-f0-9]{64}$/.test(env.BACKSTAGE_PRODUCTION_TARGET_SHA256||'')||actual!==env.BACKSTAGE_PRODUCTION_TARGET_SHA256||actual===env.BACKSTAGE_STAGING_TARGET_SHA256)throw Error('Production target must match the provisioned target and differ from staging');
}
module.exports={target,assertRuntimeTarget};
