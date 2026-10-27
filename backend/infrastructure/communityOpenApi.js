const id=name=>({name,in:'path',required:true,schema:{type:'integer',minimum:1}}),command={name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',minLength:16,maxLength:128}};
const responses=Object.fromEntries([200,201,400,401,403,404,409,410,413,429,503].map(c=>[c,{description:c<300?'Registro autorizado; sin fuerza jurídica automática':'Acceso denegado, conflicto, fuente retirada o servicio no disponible'}]));
const definitions={
 '/documents':{get:{summary:'Biblioteca privada del objeto; q, category, offset y limit, hasta 200 documentos activos'},post:{summary:'Guardar versión documental nativa cifrada y analizar; analysis_status pending indica documento guardado y análisis pendiente'}},
 '/documents/{record}':{get:{summary:'Leer texto, huellas, clasificación y candidatos con localizadores UTF-16'}},
 '/documents/{record}/history':{get:{summary:'Versiones documentales canónicas; hasta cincuenta, incluso metadatos de contenido eliminado'}},
 '/documents/{record}/analyze':{post:{summary:'Versionar clasificación humana y revisión estructurada de candidatos; prior_id y revision obligatorios al revisar análisis existente'}},
 '/documents/{record}/erase':{post:{summary:'Admin elimina cargas de todas las versiones; revision y reason, conserva referencias'}},
 '/analyses/{record}':{get:{summary:'Leer análisis histórico y texto autorizado de su fuente, sin copia persistida'}},
 '/analyses/{record}/history':{get:{summary:'Metadatos de hasta cincuenta versiones del análisis; sin modificar la evidencia original'}},
 '/analyses/{record}/reproduce':{post:{summary:'Reejecutar reglas deterministas y verificar huellas de código, fuente y resultado'}},
 '/shares':{get:{summary:'Intercambios salientes del objeto y recibidos autorizados, hasta cien'},post:{summary:'Admin propone liberar documento completo fijado a una versión; document_id, target_organization_id, purpose, confirm_full_document true, expires_at opcional'}},
 '/shares/{record}/respond':{post:{summary:'Admin de destino acepta/rechaza y vincula a su objeto; origen revoca. revision y decision accept/reject/revoke'}},
 '/shares/{record}/document':{get:{summary:'Texto liberado solo tras ambas aprobaciones, mientras fuente, organizaciones, objetos, versión y plazo sigan vigentes'}}
};
module.exports={paths:Object.fromEntries(Object.entries(definitions).map(([suffix,entry])=>['/assets/{id}/community'+suffix,{parameters:[id('id'),...(suffix.includes('{record}')?[id('record')]:[])],...Object.fromEntries(Object.entries(entry).map(([method,spec])=>[method,{...spec,tags:['Community contextual'],...(method==='post'&&!suffix.endsWith('/erase')&&!suffix.endsWith('/reproduce')?{parameters:[command]}:{}),...(method==='post'?{requestBody:{required:true,content:{'application/json':{schema:{type:'object'}}}}}:{}),responses}]))}]))};
