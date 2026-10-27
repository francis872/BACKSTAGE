const {service}=require('../services/bsie.service');
const {closeMongoConnection}=require('../infrastructure/soiMongo');
let stopping=false;process.once('SIGINT',()=>{stopping=true;});process.once('SIGTERM',()=>{stopping=true;});
async function main(){do{const job=await service.processNext();if(process.argv.includes('--once'))break;if(!job)await new Promise(resolve=>setTimeout(resolve,2000));}while(!stopping);}
main().catch(()=>{console.error('El worker BSIE no pudo acceder a MongoDB o al entorno científico.');process.exitCode=1;}).finally(closeMongoConnection);
