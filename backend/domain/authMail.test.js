const test=require('node:test'),assert=require('node:assert/strict');
const {createAuthMailer}=require('../services/authMail.service');
test('mail configuration requires a trusted HTTPS application origin and a clean sender',()=>{
 for(const appUrl of['http://example.invalid','https://example.invalid/path','https://user:pass@example.invalid','https://example.invalid/?redirect=attacker'])assert.equal(createAuthMailer({apiKey:'fixture-key',from:'auth@example.invalid',appUrl}).configured(),false);
 assert.equal(createAuthMailer({apiKey:'fixture-key',from:'auth@example.invalid\r\nBcc: victim@example.invalid',appUrl:'https://example.invalid'}).configured(),false);
});
test('recovery uses fragment tokens, server-only credentials, bounded delivery and safe provider errors',async()=>{
 let request;const options={apiKey:'fixture-private-api-key',from:'auth@example.invalid',appUrl:'https://example.invalid',fetchImpl:async(url,init)=>{request={url,init};return {ok:true,json:async()=>({id:'fixture-message'})};}};
 const mailer=createAuthMailer(options),result=await mailer.send({to:'owner@example.invalid',purpose:'reset',token:'fixture-secret-reset-token',actionId:'fixture-action'});assert.equal(result.accepted,true);assert.equal(request.url,'https://api.resend.com/emails');assert.equal(request.init.redirect,'error');assert(JSON.parse(request.init.body).text.includes('/reset-password#token=fixture-secret-reset-token'));assert(!JSON.stringify(result).includes('fixture-private-api-key'));
 await assert.rejects(createAuthMailer({...options,fetchImpl:async()=>{throw Error('fixture-private-api-key');}}).send({to:'owner@example.invalid',purpose:'reset',token:'fixture-secret-reset-token',actionId:'fixture-action'}),e=>e.statusCode===503&&!e.message.includes('fixture-private-api-key'));
});
