const {domainToASCII}=require('node:url');
const {transition,DEFAULTS}=require('../../backend/domain/monitorState');
function configurationError(code){const error=new Error(code);error.code=code;throw error;}
function mailConfiguration(env,{allowedOrigins=['https://backstage-web-seven.vercel.app']}={}){
 const from=env.AUTH_EMAIL_FROM,key=env.RESEND_API_KEY;
 if(!key||!from||!env.AUTH_PUBLIC_APP_URL)return{status:'bloqueado',code:'MAIL_CONFIGURATION_MISSING',sending_enabled:false};
 if(typeof key!=='string'||/[\r\n\s]/.test(key)||key.length<16)configurationError('INVALID_MAIL_KEY');
 if(typeof from!=='string'||from.length>254||/[\r\n\0]/.test(from))configurationError('INVALID_SENDER');
 const mailbox=from.match(/^(?:[^<>]*<)?([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([^<>\s]+)>?$/);if(!mailbox||from.includes('<')!==from.endsWith('>'))configurationError('INVALID_SENDER');
 const domain=domainToASCII(mailbox[2]).toLowerCase();if(domain.length>253||!domain.includes('.')||domain.split('.').some(label=>!label||label.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))||domain==='resend.dev'||domain.endsWith('.resend.dev'))configurationError('OWN_VERIFIED_SENDER_DOMAIN_REQUIRED');
 let url;try{url=new URL(env.AUTH_PUBLIC_APP_URL);}catch{configurationError('INVALID_RECOVERY_ORIGIN');}
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!allowedOrigins.includes(url.origin))configurationError('INVALID_RECOVERY_ORIGIN');
 return{status:'pendiente',code:'DOMAIN_PERMISSION_AND_DELIVERY_NOT_VERIFIED',sender_domain:domain,recovery_origin:url.origin,sending_enabled:false,required_runtime_permission:'sending_access',required_domain_restriction:true};
}
function domainEvidence(config,domains){
 if(config.status==='bloqueado')return config;if(!Array.isArray(domains)||domains.length>1000)configurationError('INVALID_DOMAIN_EVIDENCE');
 const match=domains.find(d=>d.name===config.sender_domain);
 return{...config,domain_verified:match?.status==='verified',status:match?.status==='verified'?'pendiente':'bloqueado',code:match?.status==='verified'?'SENDING_SCOPE_AND_REAL_DELIVERY_PENDING':'DOMAIN_NOT_VERIFIED',real_delivery_verified:false};
}
const percentile=(sorted,p)=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;
function summarizeTelemetry(events){
 if(!Array.isArray(events)||events.length>100000)configurationError('TELEMETRY_BUDGET_EXCEEDED');
 const result={requests:0,server_errors:0,client_errors:0,rate_limited:0,critical_requests:0,critical_server_errors:0,invalid_records:0},latencies=[];
 for(const row of events){if(row?.event!=='http.completed')continue;if(!Number.isInteger(row.status)||row.status<100||row.status>599||!Number.isFinite(row.duration_ms)||row.duration_ms<0||row.duration_ms>86400000){result.invalid_records++;continue;}
  result.requests++;if(row.status>=500)result.server_errors++;else if(row.status>=400)result.client_errors++;if(row.status===429)result.rate_limited++;latencies.push(row.duration_ms);
  const route=typeof row.route==='string'&&row.route.length<=300&&!/[?#\r\n]/.test(row.route)?row.route:'';
  const critical=['POST','PATCH','PUT','DELETE'].includes(row.method)&&/^\/(?:auth|users|organizations|assets|operations)(?:\/|$)/.test(route);
  if(critical){result.critical_requests++;if(row.status>=500)result.critical_server_errors++;}
 }
 latencies.sort((a,b)=>a-b);return{...result,latency_p50_ms:percentile(latencies,.5),latency_p95_ms:percentile(latencies,.95),server_error_ratio:result.requests?result.server_errors/result.requests:null,raw_identifiers_retained:false};
}
function observe(snapshot,previous={},now=Date.now(),policy={}){
 const limits={stale_after_ms:180000,error_ratio:.05,minimum_requests:20,p95_ms:2000,...policy};
 if(!Number.isFinite(now)||!Number.isFinite(limits.error_ratio)||limits.error_ratio<0||limits.error_ratio>1||!Number.isSafeInteger(limits.minimum_requests)||limits.minimum_requests<1||!Number.isFinite(limits.p95_ms)||limits.p95_ms<=0||!Number.isFinite(limits.stale_after_ms)||limits.stale_after_ms<=0)configurationError('INVALID_OBSERVABILITY_POLICY');
 const recent=value=>Number.isFinite(Date.parse(value))&&now-Date.parse(value)>=0&&now-Date.parse(value)<=limits.stale_after_ms;
 const samples=['api','web'].map(component=>{const value=snapshot?.availability?.find(v=>v.component===component);return{component,healthy:!!value&&value.healthy===true&&recent(value.checked_at),status:!value||!recent(value.checked_at)?'availability_missing_or_stale':value.healthy?'healthy':'unavailable'};});
 const m=snapshot?.metrics,usable=m&&recent(snapshot.metrics_checked_at)&&Number.isSafeInteger(m.requests)&&m.requests>=0&&Number.isSafeInteger(m.server_errors)&&m.server_errors>=0&&m.server_errors<=m.requests&&Number.isSafeInteger(m.critical_server_errors)&&m.critical_server_errors>=0&&m.critical_server_errors<=m.server_errors&&(m.requests===0||Number.isFinite(m.latency_p95_ms)&&m.latency_p95_ms>=0);
 samples.push({component:'http_errors',healthy:!!usable&&(m.requests<limits.minimum_requests||m.server_errors/m.requests<=limits.error_ratio),status:!usable?'metrics_missing_or_stale':m.requests<limits.minimum_requests?'low_sample_no_rate_certification':m.server_errors/m.requests>limits.error_ratio?'error_budget_exceeded':'within_provisional_threshold'});
 samples.push({component:'latency',healthy:!!usable&&(m.requests===0||Number.isFinite(m.latency_p95_ms)&&m.latency_p95_ms<=limits.p95_ms),status:!usable?'metrics_missing_or_stale':m.requests===0?'no_traffic':m.latency_p95_ms>limits.p95_ms?'latency_exceeded':'within_provisional_threshold'});
 samples.push({component:'critical_operations',healthy:!!usable&&m.critical_server_errors===0,status:!usable?'metrics_missing_or_stale':m.critical_server_errors?'critical_operation_server_error':'no_critical_server_error_observed'});
 samples.push({component:'audit_integrity',healthy:snapshot?.audit_integrity===true&&recent(snapshot.audit_checked_at),status:!recent(snapshot?.audit_checked_at)?'audit_evidence_missing_or_stale':snapshot.audit_integrity===true?'verified':'integrity_not_verified'});
 const changed=transition(previous,samples,DEFAULTS,new Date(now).toISOString()),old=previous.outbox||[];
 if(!Array.isArray(old)||old.length>1000||old.filter(e=>e.state==='PENDING').length+changed.events.length>1000)configurationError('ADMIN_ALERT_OUTBOX_FULL');
 const crypto=require('node:crypto'),outbox=[...old.filter(e=>e.state==='PENDING'),...old.filter(e=>e.state!=='PENDING').slice(-100),...changed.events.map(event=>({...event,id:crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex'),state:'PENDING',recipient_role:'admin'}))];
 return{checked_at:new Date(now).toISOString(),samples,incidents:changed.incidents,outbox,external_delivery:false,administrator_receipt_verified:false,provisional_policy:limits,sla_approved:false};
}
function metricsText(state){if(state.samples.some(s=>!['api','web','http_errors','latency','critical_operations','audit_integrity'].includes(s.component)))configurationError('INVALID_METRIC_LABEL');return state.samples.map(s=>`backstage_component_healthy{component="${s.component}"} ${s.healthy?1:0}`).concat(`backstage_pending_admin_alerts ${state.outbox.filter(a=>a.state==='PENDING').length}`).join('\n')+'\n';}
function rollbackAssessment({projectIds,current,candidate,requiredKeyIds=[],candidateKeyIds=[],mfaRequired=false,candidateMfaSupported=false,contractsVerified=false}){
 const checks=[];for(const type of ['api','web']){const live=current?.[type],old=candidate?.[type];if(!live||!old||live.project_id!==projectIds?.[type]||old.project_id!==projectIds?.[type])configurationError('ROLLBACK_PROJECT_SCOPE_MISMATCH');if(!/^dpl_[A-Za-z0-9]+$/.test(live.id)||!/^dpl_[A-Za-z0-9]+$/.test(old.id)||old.ready_state!=='READY')configurationError('ROLLBACK_BUILD_NOT_READY');checks.push({name:`${type}_candidate_project_and_ready_state`,verified:true});}
 const missing=requiredKeyIds.filter(id=>!candidateKeyIds.includes(id));return{status:missing.length||mfaRequired&&!candidateMfaSupported||!contractsVerified?'bloqueado':'pendiente',checks,historical_keys_available:!missing.length,mfa_compatibility_verified:!mfaRequired||candidateMfaSupported,contracts_verified:contractsVerified,execution_requires_explicit_authorization:true,alias_mutations:0,data_restore:false,plan_only:true};
}
async function dispatchAlerts(state,{url,token,allowedOrigin,fetchImpl=fetch,now=Date.now()}={}){
 const result=structuredClone(state);if(!url||!token)return{state:result,configured:false,attempted:0,administrator_receipt_verified:false};
 let endpoint;try{endpoint=new URL(url);}catch{configurationError('INVALID_ADMIN_WEBHOOK');}if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.origin!==allowedOrigin||/[\r\n]/.test(token))configurationError('INVALID_ADMIN_WEBHOOK');
 let attempted=0;for(const alert of result.outbox.filter(a=>a.state==='PENDING'&&(!a.next_attempt_at||Date.parse(a.next_attempt_at)<=now)).slice(0,5)){if(!/^[a-f0-9]{64}$/.test(alert.id)||!['api','web','http_errors','latency','critical_operations','audit_integrity'].includes(alert.component)||!['incident.opened','incident.resolved'].includes(alert.event))configurationError('INVALID_ADMIN_ALERT');attempted++;alert.attempts=(alert.attempts||0)+1;
  try{const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':alert.id},body:JSON.stringify({id:alert.id,component:alert.component,event:alert.event,at:alert.at,recipient_role:'admin'})});if(!response.ok)throw Error();alert.state='ACCEPTED_BY_WEBHOOK';}catch{alert.state=alert.attempts>=5?'FAILED':'PENDING';alert.next_attempt_at=new Date(now+Math.min(3600000,30000*2**alert.attempts)).toISOString();}
 }return{state:result,configured:true,attempted,administrator_receipt_verified:false};
}
module.exports={mailConfiguration,domainEvidence,summarizeTelemetry,observe,metricsText,rollbackAssessment,dispatchAlerts};
