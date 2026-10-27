// Deterministic text rules. These identify candidates, never legal obligations by themselves.
export const VERSION='community-text-rules-1';
export function analyzeKnowledge(document){
 if(typeof document?.body!=='string'||!document.body.trim()||document.body.length>40000)throw Error('Texto requerido, hasta 40000 caracteres.');
 const text=(String(document.title||'')+'\n'+document.body).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 const keywords={regulation:['reglamento','copropiedad','articulo'],policy:['politica','privacidad','tratamiento de datos'],procedure:['procedimiento','paso','instructivo'],minutes:['acta','asamblea','orden del dia'],contract:['contrato','contratante','clausula'],report:['informe','indicador','resultado']};
 const scores=Object.entries(keywords).map(([category,words])=>({category,matched:words.filter(w=>text.includes(w))}));scores.sort((a,b)=>b.matched.length-a.matched.length||a.category.localeCompare(b.category,'en'));
 const candidates=[];let truncated=false;
 for(const match of document.body.matchAll(/[^\r\n.!?]+(?:[.!?]+|(?=\r|\n|$))/gu)){
  const s=match[0].trim();if(!s)continue;const obligation=/(?<![\p{L}\p{N}_])(?:deber[aá]n?|deben?|se\s+obliga(?:n)?\s+a|tendr[aá](?:n)?\s+que|es\s+obligatorio|queda\s+prohibido|no\s+podr[aá](?:n)?)(?![\p{L}\p{N}_])/iu.exec(s);if(!obligation)continue;
  if(candidates.length===250){truncated=true;break;}const start=match.index+match[0].indexOf(s),end=start+s.length;
  candidates.push({id:`candidate-${candidates.length+1}`,start_utf16:start,end_utf16:end,line:document.body.slice(0,start).split('\n').length,kind:/(?<![\p{L}\p{N}_])(?:prohibido|no\s+(?:podr[aá]n?|deben?|deber[aá]n?))(?![\p{L}\p{N}_])/iu.test(s)?'prohibition':'possible_duty',conditional:/\b(?:salvo|excepto|cuando|si)\b/iu.test(s),requires_human_review:true});
 }
 return{version:VERSION,classification:{suggested:scores[0].matched.length?scores[0].category:'unclassified',scores:scores.map(s=>({category:s.category,matched_keywords:s.matched.length})),method:'keyword_presence_counts_not_probability',automatically_legal:false},candidates,truncated,offset_encoding:'JavaScript UTF-16 code units',legal_obligations_certified:false,limitations:['Las coincidencias pueden omitir obligaciones o detectar frases que no lo sean.','Revisar negación, contexto, excepciones y aplicabilidad; no se calculan plazos legales.']};
}
export function candidateExcerpt(body,candidate){if(typeof body!=='string'||!Number.isInteger(candidate.start_utf16)||!Number.isInteger(candidate.end_utf16)||candidate.start_utf16<0||candidate.end_utf16>body.length||candidate.end_utf16<candidate.start_utf16)throw Error('Referencia textual inválida.');return body.slice(candidate.start_utf16,candidate.end_utf16);}
