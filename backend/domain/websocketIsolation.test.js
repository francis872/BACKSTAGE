const test=require('node:test');
const assert=require('node:assert/strict');
process.env.JWT_SECRET='isolated-websocket-phase-one-key';
const http=require('node:http'),WebSocket=require('ws');
const {createToken,verifyToken}=require('../auth');
const {resolveMembership}=require('../services/organization.service');
const {attachSecurityWebSocketServer}=require('../realtime/wsServer');
const {publishSecurityEvent}=require('../realtime/securityEvents');
const {publishOperationalEvent}=require('../realtime/operationalEvents');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await pause(10);}assert.fail('WebSocket condition timed out');}
test('native sockets enforce tenant, channel, persisted role, revocation and token validity',async t=>{
 const members=new Map([[1,[{organization_id:7,role:'admin'}]],[2,[{organization_id:8,role:'admin'}]],[3,[{organization_id:7,role:'viewer'}]]]);let valid=true;
 const server=http.createServer();const sockets=[];attachSecurityWebSocketServer(server,{memberships:{getUserMemberships:async id=>members.get(id)||[],resolveMembership},verify:token=>{if(!valid)throw new Error('expired');return verifyToken(token);},revalidateIntervalMs:30});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{for(const s of sockets)s.terminate();server.close();});
 const connect=async(id,org,channel)=>{const token=createToken({user_id:id,organization_id:org,role:'admin'});const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws/${channel}?token=${token}`);const messages=[];ws.on('message',b=>messages.push(JSON.parse(b.toString())));sockets.push(ws);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return{ws,messages};};
 const a=await connect(1,7,'security'),b=await connect(2,8,'security'),op=await connect(3,7,'operations');
 await assert.rejects(connect(3,7,'security'));
 publishSecurityEvent({organization_id:7,action:'tenant-seven'});await until(()=>a.messages.some(m=>m.data?.action==='tenant-seven'));assert(!b.messages.some(m=>m.data?.action==='tenant-seven'));assert(!op.messages.some(m=>m.data?.action==='tenant-seven'));
 publishOperationalEvent({organization_id:7,title:'operation-seven'});await until(()=>op.messages.some(m=>m.data?.title==='operation-seven'));assert(!a.messages.some(m=>m.data?.title==='operation-seven'));
 publishSecurityEvent({organization_id:null,action:'global-private'});await pause(40);assert(!a.messages.some(m=>m.data?.action==='global-private'));
 members.set(1,[]);publishSecurityEvent({organization_id:7,action:'after-revoke'});await until(()=>a.ws.readyState===WebSocket.CLOSED);assert(!a.messages.some(m=>m.data?.action==='after-revoke'));
 valid=false;await until(()=>b.ws.readyState===WebSocket.CLOSED&&op.ws.readyState===WebSocket.CLOSED);
});
