export function colombianDate(value=new Date()){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('Instante de evaluación inválido.');
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
