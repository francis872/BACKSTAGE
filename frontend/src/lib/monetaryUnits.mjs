export function toMinorUnits(value, scale) {
  if (!Number.isInteger(Number(scale)) || Number(scale) < 0 || Number(scale) > 4 || !/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(String(value))) throw Error('Escribe un importe positivo con punto decimal.');
  const [whole, fraction = ''] = String(value).split('.'); if (fraction.length > Number(scale)) throw Error('El importe tiene más decimales que la moneda indicada.');
  const result = Number(whole + fraction.padEnd(Number(scale), '0')); if (!Number.isSafeInteger(result) || result <= 0) throw Error('El importe está fuera del rango admitido.'); return result;
}
export function displayMinorUnits(value, scale) {
  if ((typeof value === 'number' ? !Number.isSafeInteger(value) : typeof value !== 'string' || !/^-?(0|[1-9]\d{0,29})$/.test(value)) || !Number.isInteger(scale) || scale < 0 || scale > 4) return 'Sin dato';
  const negative = BigInt(value) < 0n, digits = String(negative ? -BigInt(value) : BigInt(value)).padStart(scale + 1, '0');
  return (negative ? '-' : '') + (scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits);
}
export function economicMinorUnits(value, scale, signed = false) {
  if (!Number.isInteger(Number(scale)) || Number(scale)<0 || Number(scale)>4 || typeof value!=='string' || !(signed?/^-?(0|[1-9]\d*)(?:\.\d+)?$/:/^(0|[1-9]\d*)(?:\.\d+)?$/).test(value)) throw Error('Escribe un importe con punto decimal y sin separadores de miles.');
  const negative=value.startsWith('-'),[whole,fraction='']=(negative?value.slice(1):value).split('.');if(fraction.length>Number(scale)||whole.length+Number(scale)>30)throw Error('El importe supera la precisión monetaria admitida.');
  return String(BigInt((negative?'-':'')+whole+fraction.padEnd(Number(scale),'0')));
}
